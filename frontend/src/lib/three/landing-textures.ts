import * as THREE from "three";

/* --------------------------------------------------------------------------
   Procedural stadium textures (P1-ART-08). Generated in code as CanvasTextures
   — no downloads, offline/CSP-safe, host-portable, on-brand. Each ground bakes
   its sport's line markings so no extra geometry is needed. Client-only (uses
   <canvas>); three runs client-side so that's fine.
   -------------------------------------------------------------------------- */

function canvas(size = 1024): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!];
}

/** speckle noise overlay */
function noise(ctx: CanvasRenderingContext2D, size: number, alpha: number, tint: string) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = tint;
  for (let i = 0; i < size * size * 0.03; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;
}

function tex(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soccer pitch: mowed green stripes + white pitch lines baked in. */
export function soccerGround(): THREE.Texture {
  const S = 1024;
  const [c, x] = canvas(S);
  for (let i = 0; i < 12; i++) {
    x.fillStyle = i % 2 ? "#0f5a2a" : "#0c4d24";
    x.fillRect(0, (i * S) / 12, S, S / 12);
  }
  noise(x, S, 0.05, "#1c6e38");
  x.strokeStyle = "rgba(235,245,238,.85)";
  x.lineWidth = 6;
  x.strokeRect(60, 60, S - 120, S - 120);
  x.beginPath();
  x.moveTo(60, S / 2);
  x.lineTo(S - 60, S / 2);
  x.stroke();
  x.beginPath();
  x.arc(S / 2, S / 2, 130, 0, Math.PI * 2);
  x.stroke();
  return tex(c, 1);
}

/** Basketball hardwood: warm planks + grain + court arcs. */
export function basketballGround(): THREE.Texture {
  const S = 1024;
  const [c, x] = canvas(S);
  const planks = 16;
  for (let i = 0; i < planks; i++) {
    const g = x.createLinearGradient(0, 0, S, 0);
    const base = i % 2 ? "#7a4a1e" : "#8a5624";
    g.addColorStop(0, base);
    g.addColorStop(0.5, "#96602c");
    g.addColorStop(1, base);
    x.fillStyle = g;
    x.fillRect(0, (i * S) / planks, S, S / planks);
    x.strokeStyle = "rgba(40,20,6,.4)";
    x.lineWidth = 2;
    x.strokeRect(0, (i * S) / planks, S, S / planks);
  }
  noise(x, S, 0.04, "#5c3512");
  x.strokeStyle = "rgba(249,180,120,.5)";
  x.lineWidth = 6;
  x.beginPath();
  x.arc(S / 2, S / 2, 150, 0, Math.PI * 2);
  x.stroke();
  x.strokeRect(80, 80, S - 160, S - 160);
  return tex(c, 1);
}

/** Baseball: green field with a brown infield diamond + base paths. */
export function baseballGround(): THREE.Texture {
  const S = 1024;
  const [c, x] = canvas(S);
  x.fillStyle = "#0f5a2a";
  x.fillRect(0, 0, S, S);
  noise(x, S, 0.05, "#1c6e38");
  // infield dirt diamond
  x.save();
  x.translate(S / 2, S / 2);
  x.rotate(Math.PI / 4);
  x.fillStyle = "#9c6b3a";
  x.fillRect(-230, -230, 460, 460);
  x.strokeStyle = "rgba(235,245,238,.8)";
  x.lineWidth = 6;
  x.strokeRect(-230, -230, 460, 460);
  x.restore();
  noise(x, S, 0.04, "#7d5228");
  return tex(c, 1);
}

/** Football: turf with white yard lines + hash marks. */
export function footballGround(): THREE.Texture {
  const S = 1024;
  const [c, x] = canvas(S);
  for (let i = 0; i < 10; i++) {
    x.fillStyle = i % 2 ? "#0e5227" : "#0c4a23";
    x.fillRect(0, (i * S) / 10, S, S / 10);
  }
  noise(x, S, 0.05, "#1c6e38");
  x.strokeStyle = "rgba(235,245,238,.8)";
  x.lineWidth = 5;
  for (let i = 1; i < 10; i++) {
    const y = (i * S) / 10;
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(S, y);
    x.stroke();
  }
  // hash marks
  x.lineWidth = 3;
  for (let i = 0; i < 40; i++) {
    const y = (i * S) / 40;
    x.beginPath();
    x.moveTo(S * 0.36, y);
    x.lineTo(S * 0.4, y);
    x.moveTo(S * 0.6, y);
    x.lineTo(S * 0.64, y);
    x.stroke();
  }
  return tex(c, 1);
}

/** Soft round dot for crowd / particle Points and sprites. */
export function dotSprite(): THREE.Texture {
  const S = 64;
  const [c, x] = canvas(S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Segmented luminance strip for the scrolling LED ribbon (tinted per accent). */
export function ribbonTexture(): THREE.Texture {
  const W = 512;
  const H = 32;
  const [c, x] = canvas(W);
  c.height = H;
  x.clearRect(0, 0, W, H);
  for (let i = 0; i < 32; i++) {
    const on = i % 3 !== 0;
    x.fillStyle = on ? `rgba(255,255,255,${0.5 + Math.random() * 0.5})` : "rgba(255,255,255,0.08)";
    x.fillRect((i * W) / 32 + 2, 6, W / 32 - 4, H - 12);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dark rock/earth strata for the underground shaft walls. */
export function rockWall(): THREE.Texture {
  const S = 512;
  const [c, x] = canvas(S);
  x.fillStyle = "#0b0a08";
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 22; i++) {
    const y = (i * S) / 22 + (Math.random() * 6 - 3);
    x.fillStyle = i % 2 ? "#141109" : "#0e0c07";
    x.fillRect(0, y, S, S / 22 + 2);
    x.strokeStyle = "rgba(0,0,0,.6)";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(S, y);
    x.stroke();
  }
  noise(x, S, 0.06, "#2a2213");
  return tex(c, 3);
}
