"""Step 3 - Blender 4.5 headless: FBX -> one raw glTF for the city kit (P1-ART-09).

Run by scripts/city-kit/run.mjs:

    blender -b --python bl_export.py -- <build/export-job.json>

For every palette mesh in the job: import the FBX, keep the LOD0 objects (joined
into one mesh named exactly <id>) and, when the palette says `lod: true`, the
LOD2 objects as `<id>__lod`; drop LOD1, convex hulls and UCX_ objects; apply the
importer's 0.01 / 90-degree transforms so every node sits at the origin with an
identity transform. Materials are rebuilt as Principled BSDF from the resolved
Unity materials (see resolve.mjs) so the glTF exporter produces the standard
PBR slots, with occlusion/roughness/metallic wired from a single _ORM image.

Textures are pre-scaled to the largest palette `textureSize` of the meshes that
use them (never above job.maxTexture) and re-saved as PNG in build/tex/ - the
exporter reads an unmodified image from its ORIGINAL file (T95616), so scaling
in memory alone would not shrink the raw GLB.

Also writes build/export-report.json (LOD0 bounds in three.js Y-up metres,
tri counts, slot -> material, unresolved slots, fallbacks, timings) and, when
job.env is given, the environment map at job.env.out (Radiance .hdr).
"""
import json
import math
import os
import re
import sys
import time
import traceback

import bpy
import numpy as np
from mathutils import Matrix

T0 = time.time()
argv = sys.argv[sys.argv.index("--") + 1:]
with open(argv[0], encoding="utf-8") as fh:
    JOB = json.load(fh)

MATS = JOB["materials"]
ALIAS = JOB.get("alias", {})
MAX_TEX = int(JOB.get("maxTexture", 2048))
OUT = JOB["out"]
TEX_DIR = OUT["texDir"]
USED_ROLES = ("B", "N", "ORM", "E", "O", "R", "M", "AO")
FALLBACK = "__fallback__"

os.makedirs(os.path.dirname(OUT["glb"]), exist_ok=True)
os.makedirs(TEX_DIR, exist_ok=True)

report = {
    "blender": bpy.app.version_string,
    "meshes": {},
    "unresolved": [],
    "fallback": [],
    "images": {},
    "env": None,
    "timing": {},
}


def log(*a):
    print("[bl_export]", *a, flush=True)


def r3(v):
    return round(float(v), 3)


# ---------------------------------------------------------------------------
# scene
# ---------------------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"
scene.unit_settings.scale_length = 1.0

LOD_RE = re.compile(r"_LOD(\d)(\.\d{3})?$")
HULL_RE = re.compile(r"(_ConvexHulls?|^UCX_)", re.I)


def override(objs, active):
    return bpy.context.temp_override(
        active_object=active,
        object=active,
        selected_objects=list(objs),
        selected_editable_objects=list(objs),
    )


def apply_transform(o):
    """Bake the FBX importer's parent transform into the mesh data."""
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
    with override([o], o):
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.matrix_world = Matrix.Identity(4)


def join(objs, name):
    if len(objs) > 1:
        with override(objs, objs[0]):
            bpy.ops.object.join()
    o = objs[0]
    o.name = name
    o.data.name = name
    return o


def strip_slot(slot_name):
    base = re.sub(r"\.\d{3}$", "", slot_name or "")
    base = re.sub(r"^(MI_|MM_)", "M_", base)
    return ALIAS.get(base, base)


def import_entry(e):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(
        filepath=e["file"],
        use_custom_normals=True,
        use_image_search=False,
        ignore_leaf_bones=True,
    )
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH" and not HULL_RE.search(o.name)]
    by_lod, plain = {}, []
    for o in meshes:
        m = LOD_RE.search(o.name)
        if m:
            by_lod.setdefault(int(m.group(1)), []).append(o)
        else:
            plain.append(o)
    lod0 = by_lod.get(0) or plain
    lod2 = by_lod.get(2) if e.get("lod") else None
    if not lod0:
        raise RuntimeError("no LOD0 mesh objects in " + e["file"])
    keep = list(lod0) + (list(lod2) if lod2 else [])
    for o in keep:
        apply_transform(o)
    for o in new:
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)
    main = join(lod0, e["id"])
    lodobj = join(lod2, e["id"] + "__lod") if lod2 else None
    return main, lodobj


def measure(o):
    me = o.data
    n = len(me.vertices)
    buf = np.empty(n * 3, dtype=np.float32)
    me.vertices.foreach_get("co", buf)
    co = buf.reshape(n, 3)
    mn, mx = co.min(axis=0), co.max(axis=0)
    tris = sum(max(0, len(p.vertices) - 2) for p in me.polygons)
    # Blender Z-up -> three.js Y-up: x = x, y = z, z = -y
    return {
        "dims": [r3(mx[0] - mn[0]), r3(mx[2] - mn[2]), r3(mx[1] - mn[1])],
        "min": [r3(mn[0]), r3(mn[2]), r3(-mx[1])],
        "max": [r3(mx[0]), r3(mx[2]), r3(-mn[1])],
        "tris": int(tris),
        "verts": int(n),
    }


def resolve_slots(obj, e):
    slots = [s.material.name if s.material else "" for s in obj.material_slots]
    pm = e.get("prefabMaterials")
    use_prefab = bool(pm) and len(pm) == len(slots) and all(pm)
    names = []
    for i, sn in enumerate(slots):
        cand = pm[i] if use_prefab else strip_slot(sn)
        if cand not in MATS and strip_slot(sn) in MATS:
            cand = strip_slot(sn)
        if cand not in MATS:
            report["unresolved"].append({"mesh": e["id"], "slot": sn, "tried": cand})
            cand = FALLBACK
        names.append(cand)
    return slots, names, use_prefab


# ---------------------------------------------------------------------------
# 1. import every palette mesh
# ---------------------------------------------------------------------------
t_imp = time.time()
objects = []  # (entry, main, lodobj, slots, names)
for e in JOB["meshes"]:
    try:
        main, lodobj = import_entry(e)
        slots, names, from_prefab = resolve_slots(main, e)
        objects.append((e, main, lodobj, names))
        m = measure(main)
        m.update({
            "file": e["file"],
            "lod": lodobj is not None,
            "lodTris": measure(lodobj)["tris"] if lodobj else None,
            "slots": slots,
            "materials": names,
            "materialsFromPrefab": from_prefab,
        })
        report["meshes"][e["id"]] = m
        log(f"import {e['id']}: {m['tris']} tris, dims {m['dims']}, slots {slots} -> {names}")
    except Exception as ex:  # noqa: BLE001
        report["meshes"][e["id"]] = {"error": str(ex), "trace": traceback.format_exc()[-800:]}
        log("IMPORT FAILED", e["id"], ex)
report["timing"]["import"] = round(time.time() - t_imp, 1)

# ---------------------------------------------------------------------------
# 2. texture targets: largest palette textureSize among the users of each map
# ---------------------------------------------------------------------------
mat_size = {}
for e, main, lodobj, names in objects:
    for n in names:
        mat_size[n] = max(mat_size.get(n, 0), int(e.get("textureSize", 512)))
tex_target = {}
for n, size in mat_size.items():
    spec = MATS.get(n)
    if not spec:
        continue
    for role, p in spec.get("live", {}).items():
        if role in USED_ROLES and p:
            tex_target[p] = max(tex_target.get(p, 0), min(MAX_TEX, size))

# ---------------------------------------------------------------------------
# 3. materials
# ---------------------------------------------------------------------------
IMG = {}


def load_image(path, colorspace):
    key = (path, colorspace)
    if key in IMG:
        return IMG[key]
    img = bpy.data.images.load(path, check_existing=False)
    base = os.path.splitext(os.path.basename(path))[0]
    name = base if (colorspace == "sRGB" or (path, "sRGB") not in IMG) else base + "_lin"
    img.name = name
    img.colorspace_settings.name = colorspace
    w, h = img.size
    if w == 0 or h == 0:
        raise RuntimeError("image has no size: " + path)
    target = tex_target.get(path, MAX_TEX)
    if max(w, h) > target:
        f = target / max(w, h)
        img.scale(max(1, int(round(w * f))), max(1, int(round(h * f))))
    png = os.path.join(TEX_DIR, img.name + ".png")
    img.filepath_raw = png
    img.file_format = "PNG"
    img.save()
    IMG[key] = img
    report["images"][img.name] = {"src": path, "source": [w, h], "size": list(img.size), "colorspace": colorspace}
    return img


_group = None


def gltf_output_group():
    """The exporter reads occlusion from a group node named 'glTF Material Output'."""
    global _group
    if _group is None:
        g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        g.nodes.new("NodeGroupInput")
        _group = g
    return _group


def first_color(colors, keys):
    for k in keys:
        c = colors.get(k)
        if c and sum(c[:3]) > 0.02 and max(c[:3]) < 0.999:
            return c[:3]
    return None


def build_material(name):
    spec = MATS.get(name)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, L = nt.nodes, nt.links.new
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Emission Strength"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.7
    bsdf.inputs["Metallic"].default_value = 0.0

    def tex(path, cs, x, y):
        n = nodes.new("ShaderNodeTexImage")
        n.image = load_image(path, cs)
        n.location = (x, y)
        return n

    if spec is None:
        bsdf.inputs["Base Color"].default_value = (0.22, 0.22, 0.24, 1)
        return mat

    live = spec.get("live", {})
    flags = spec.get("flags", {})
    props = spec.get("props", {})
    colors = spec.get("colors", {})
    floats = spec.get("floats", {})
    shader = spec.get("shader", "")
    hologram = bool(flags.get("hologram"))

    B = live.get("B")
    tb = None
    if B:
        tb = tex(B, "sRGB", -600, 300)
        L(tb.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        c = first_color(colors, ("ColorInner", "Tint1", "_BaseColor", "Color"))
        if shader.startswith("S_CubeMap"):
            c = c or (0.02, 0.03, 0.05)
            bsdf.inputs["Metallic"].default_value = 0.9
            bsdf.inputs["Roughness"].default_value = 0.15
        elif shader.startswith("S_Window"):
            c = c or (0.05, 0.08, 0.12)
            bsdf.inputs["Roughness"].default_value = 0.15
        else:
            c = c or (0.35, 0.35, 0.37)
        bsdf.inputs["Base Color"].default_value = (*c, 1)
        report["fallback"].append({"material": name, "shader": shader, "why": "no live base-colour map", "baseColor": [r3(v) for v in c]})

    if hologram:
        # S_HologramMaster: unlit-looking, additive glow, 70% alpha, both sides
        if tb is not None:
            L(tb.outputs["Color"], bsdf.inputs["Emission Color"])
        else:
            bsdf.inputs["Emission Color"].default_value = (0.2, 0.8, 1.0, 1)
        bsdf.inputs["Emission Strength"].default_value = 1.0
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Alpha"].default_value = 0.7
        mat.surface_render_method = "BLENDED"
        mat.use_backface_culling = False
        return mat

    N = live.get("N")
    if N:
        tn = tex(N, "Non-Color", -600, -300)
        nm = nodes.new("ShaderNodeNormalMap")
        nm.location = (-300, -300)
        L(tn.outputs["Color"], nm.inputs["Color"])
        L(nm.outputs["Normal"], bsdf.inputs["Normal"])

    ORM = live.get("ORM")
    if ORM:
        t = tex(ORM, "Non-Color", -600, 0)
        sep = nodes.new("ShaderNodeSeparateColor")
        sep.location = (-300, 0)
        L(t.outputs["Color"], sep.inputs["Color"])
        L(sep.outputs["Green"], bsdf.inputs["Roughness"])
        L(sep.outputs["Blue"], bsdf.inputs["Metallic"])
        occ = nodes.new("ShaderNodeGroup")
        occ.node_tree = gltf_output_group()
        occ.location = (300, -500)
        L(sep.outputs["Red"], occ.inputs["Occlusion"])
    else:
        R, M, AO = live.get("R"), live.get("M"), live.get("AO")
        if R:
            L(tex(R, "Non-Color", -600, 0).outputs["Color"], bsdf.inputs["Roughness"])
        if M:
            L(tex(M, "Non-Color", -600, -150).outputs["Color"], bsdf.inputs["Metallic"])
        if AO:
            occ = nodes.new("ShaderNodeGroup")
            occ.node_tree = gltf_output_group()
            occ.location = (300, -500)
            L(tex(AO, "Non-Color", -600, -450).outputs["Color"], occ.inputs["Occlusion"])

    E = live.get("E")
    if E:
        te = tex(E, "sRGB", -600, 600)
        L(te.outputs["Color"], bsdf.inputs["Emission Color"])
        ei = floats.get("_EmissiveIntensity")
        bsdf.inputs["Emission Strength"].default_value = float(min(6.0, max(1.0, ei if ei is not None else 1.0)))
    elif shader.startswith("S_Window") and float(props.get("Emissive", 0) or 0) > 0.05:
        c = first_color(colors, ("ColorOut", "ColorInner")) or (1.0, 0.85, 0.6)
        bsdf.inputs["Emission Color"].default_value = (*c, 1)
        bsdf.inputs["Emission Strength"].default_value = float(min(6.0, max(1.0, props["Emissive"])))

    O = live.get("O")
    if O and flags.get("alphaMask"):
        to = tex(O, "Non-Color", -600, -600)
        rnd = nodes.new("ShaderNodeMath")
        rnd.operation = "ROUND"  # exporter: Alpha -> [Math:Round] => alphaMode MASK, cutoff 0.5
        rnd.location = (-300, -600)
        L(to.outputs["Color"], rnd.inputs[0])
        L(rnd.outputs[0], bsdf.inputs["Alpha"])
        mat.surface_render_method = "DITHERED"

    mat.use_backface_culling = not bool(flags.get("doubleSided"))
    return mat


t_mat = time.time()
built = {}
for e, main, lodobj, names in objects:
    for i, n in enumerate(names):
        if n not in built:
            try:
                built[n] = build_material(n)
            except Exception as ex:  # noqa: BLE001
                log("MATERIAL FAILED", n, ex)
                report["fallback"].append({"material": n, "why": "build error: " + str(ex)})
                built[n] = build_material(FALLBACK) if n != FALLBACK else None
        for o in (main, lodobj):
            if o is not None and i < len(o.material_slots):
                o.material_slots[i].material = built[n]
report["timing"]["materials"] = round(time.time() - t_mat, 1)
log(f"{len(built)} materials, {len(IMG)} images loaded")

# ---------------------------------------------------------------------------
# 4. export
# ---------------------------------------------------------------------------
bpy.data.orphans_purge(do_recursive=True)
t_exp = time.time()
wanted = dict(
    filepath=OUT["glb"],
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_animations=False,
    export_cameras=False,
    export_lights=False,
    export_extras=False,
    export_skins=False,
    export_morph=False,
    export_texcoords=True,
    export_normals=True,
    export_tangents=False,
    export_attributes=False,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_unused_images=False,
    export_unused_textures=False,
    export_original_specular=False,
    use_selection=False,
)
known = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
kwargs = {k: v for k, v in wanted.items() if k in known}
bpy.ops.export_scene.gltf(**kwargs)
report["timing"]["export"] = round(time.time() - t_exp, 1)
report["rawGlbBytes"] = os.path.getsize(OUT["glb"])
log(f"exported {OUT['glb']} ({report['rawGlbBytes'] / 1e6:.1f} MB)")

# ---------------------------------------------------------------------------
# 5. environment map (2:1 equirect HDR)
# ---------------------------------------------------------------------------
env = JOB.get("env")
if env:
    chosen = None
    tried = []
    for cand in env.get("candidates", []):
        if not os.path.exists(cand):
            continue
        img = bpy.data.images.load(cand, check_existing=False)
        w, h = img.size
        tried.append({"file": os.path.basename(cand), "size": [w, h], "equirect": w == 2 * h})
        if w > 0 and w == 2 * h:
            chosen = (cand, img)
            break
        bpy.data.images.remove(img)
    if chosen:
        cand, img = chosen
        tw, th = env.get("size", [1024, 512])
        if list(img.size) != [tw, th]:
            img.scale(tw, th)
        os.makedirs(os.path.dirname(env["out"]), exist_ok=True)
        img.filepath_raw = env["out"]
        img.file_format = "HDR"
        img.save()
        report["env"] = {"written": True, "source": cand, "size": [tw, th], "out": env["out"], "tried": tried}
        log("env.hdr from", os.path.basename(cand))
    else:
        report["env"] = {"written": False, "reason": "no 2:1 equirectangular HDR among candidates", "tried": tried}
        log("env.hdr NOT written:", report["env"]["reason"])

report["timing"]["total"] = round(time.time() - T0, 1)
with open(OUT["report"], "w", encoding="utf-8") as fh:
    json.dump(report, fh, indent=1)
log(f"report -> {OUT['report']}; unresolved slots: {len(report['unresolved'])}; fallbacks: {len(report['fallback'])}; {report['timing']}")
