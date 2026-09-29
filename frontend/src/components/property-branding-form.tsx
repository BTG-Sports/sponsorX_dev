"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { removeLogoAction, requestLogoUploadAction, saveBrandingAction, saveLogoAction } from "@/app/(app)/property/branding/actions";
import { brandingDraftFrom, contrastChecks, validateLogoFile, type ApiBranding, type BrandingDraft } from "@/lib/property-p2-live";

/* --------------------------------------------------------------------------
   2S7-FE-03 — the branding form. Name, colours, report footer, custom
   domain (PUT /branding) and the logo: POST /branding/logo grants an upload
   URL, the browser PUTs the file straight to the bucket with that
   Content-Type, then PUT /branding { logoKey } points the branding at it.

   A PROPERTY_MGR may write only when its tenant is an operated one. The
   first 403 turns this into the read-only view — "BTG manages branding for
   your organisation" — rather than a form that can never save.
   -------------------------------------------------------------------------- */

const field =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none aria-[invalid=true]:border-danger";
const lbl = "block text-[11px] font-medium text-muted";

export function BrandingReadOnly({ branding, reason }: { branding: ApiBranding; reason?: string }) {
  const rows: Array<[string, string | null]> = [
    ["Display name", branding.displayName],
    ["Primary colour", branding.primaryColor],
    ["Accent colour", branding.accentColor],
    ["Report footer", branding.reportFooter],
    ["Custom domain", branding.customDomain],
  ];
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-muted">{reason ?? "BTG manages branding for your organisation."} Ask BTG if something here should change.</p>
      <div className="rounded-xl border border-line bg-surface p-5">
        <div className="flex items-center gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a tenant's public-bucket logo; next/image optimisation is a host-specific primitive (stack decision)
            <img src={branding.logoUrl} alt="Logo" className="size-12 rounded-lg border border-line object-contain" />
          ) : (
            <span className="flex size-12 items-center justify-center rounded-lg border border-dashed border-line text-[10px] text-faint">No logo</span>
          )}
          <p className="text-sm font-semibold">{branding.displayName ?? "No display name set"}</p>
        </div>
        <dl className="mt-4 divide-y divide-line-soft text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 py-2">
              <dt className="text-muted">{k}</dt>
              <dd className="flex items-center gap-2 text-right">
                {v && /^#[0-9a-fA-F]{6}$/.test(v) && <span aria-hidden="true" className="size-3.5 rounded border border-line" style={{ background: v }} />}
                {v ?? <span className="text-faint">Not set</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function ColourField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (v: string) => void }) {
  const checks = contrastChecks(value.trim());
  const valid = /^#[0-9a-fA-F]{6}$/.test(value.trim());
  return (
    <div>
      <label className="block">
        <span className={lbl}>{label}</span>
        <span className="mt-1 flex items-center gap-2">
          <input
            type="color"
            aria-label={`${label} picker`}
            value={valid ? value.trim().toLowerCase() : "#000000"}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-0.5"
          />
          <input className={`${field} mt-0`} value={value} placeholder="#RRGGBB (empty uses SponsorX's)" aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} />
        </span>
      </label>
      {error && <span className="mt-1 block text-[11px] text-danger">{error}</span>}
      {checks && (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {checks.map((c) => (
            <li key={c.key} className={c.passes ? "text-muted" : "text-warn"}>
              {c.label}: {c.ratio} {c.passes ? "· passes AA" : "· below AA for text"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PropertyBrandingForm({ branding: initial }: { branding: ApiBranding }) {
  const router = useRouter();
  const [branding, setBranding] = useState(initial);
  const [draft, setDraft] = useState<BrandingDraft>(brandingDraftFrom(initial));
  const [errors, setErrors] = useState<Partial<Record<keyof BrandingDraft, string>>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [readOnly, setReadOnly] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  if (readOnly) return <BrandingReadOnly branding={branding} reason={readOnly} />;

  const set = <K extends keyof BrandingDraft>(k: K, v: string) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = () =>
    start(async () => {
      setMessage(null);
      const r = await saveBrandingAction(draft);
      if (r.ok) {
        setBranding(r.branding);
        setDraft(brandingDraftFrom(r.branding));
        setErrors({});
        setMessage({ tone: "ok", text: "Saved." });
        router.refresh();
      } else if (r.forbidden) setReadOnly(r.message);
      else {
        setErrors(r.errors ?? {});
        setMessage({ tone: "error", text: r.message });
      }
    });

  const upload = async (file: File) => {
    setMessage(null);
    const v = validateLogoFile(file);
    if (!v.ok) {
      setMessage({ tone: "error", text: v.message });
      return;
    }
    setUploading(true);
    try {
      const grant = await requestLogoUploadAction({ type: file.type, size: file.size });
      if (!grant.ok) {
        if (grant.forbidden) setReadOnly(grant.message);
        else setMessage({ tone: "error", text: grant.message });
        return;
      }
      /* Straight to the bucket with the Content-Type the grant was signed for. */
      let put: Response;
      try {
        put = await fetch(grant.uploadUrl, { method: "PUT", headers: { "Content-Type": v.contentType }, body: file });
      } catch {
        setMessage({ tone: "error", text: "The upload didn't reach storage. Check your connection and try again." });
        return;
      }
      if (!put.ok) {
        setMessage({ tone: "error", text: `Storage refused the upload (HTTP ${put.status}). Try again.` });
        return;
      }
      const r = await saveLogoAction(grant.logoKey);
      if (r.ok) {
        setBranding(r.branding);
        setMessage({ tone: "ok", text: "Logo updated." });
        router.refresh();
      } else if (r.forbidden) setReadOnly(r.message);
      else setMessage({ tone: "error", text: r.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = () =>
    start(async () => {
      setMessage(null);
      const r = await removeLogoAction();
      if (r.ok) {
        setBranding(r.branding);
        setMessage({ tone: "ok", text: "Logo removed." });
        router.refresh();
      } else if (r.forbidden) setReadOnly(r.message);
      else setMessage({ tone: "error", text: r.message });
    });

  const busy = pending || uploading;

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="rounded-xl border border-line bg-surface p-5">
        <p className="text-sm font-semibold">Logo</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a tenant's public-bucket logo; next/image optimisation is a host-specific primitive (stack decision)
            <img src={branding.logoUrl} alt="Current logo" className="size-14 rounded-lg border border-line object-contain" />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-lg border border-dashed border-line text-[10px] text-faint">No logo</span>
          )}
          <div className="space-y-1">
            <div className="flex flex-wrap gap-2">
              <label className={`cursor-pointer rounded-lg border border-line px-3.5 py-2 text-xs font-medium hover:bg-surface-2 ${busy ? "pointer-events-none opacity-40" : ""}`}>
                {uploading ? "Uploading…" : branding.logoUrl ? "Replace logo" : "Upload logo"}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
              </label>
              {branding.logoUrl && (
                <button type="button" disabled={busy} onClick={removeLogo} className="px-2 text-xs text-muted hover:text-danger disabled:opacity-40">
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-faint">PNG or JPEG, up to 1 MB. Square works best.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <label className="block">
          <span className={lbl}>Display name</span>
          <input className={field} value={draft.displayName} maxLength={120} placeholder="Shown in your portal's header" aria-invalid={!!errors.displayName} onChange={(e) => set("displayName", e.target.value)} />
          {errors.displayName && <span className="mt-1 block text-[11px] text-danger">{errors.displayName}</span>}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColourField label="Primary colour" value={draft.primaryColor} error={errors.primaryColor} onChange={(v) => set("primaryColor", v)} />
          <ColourField label="Accent colour" value={draft.accentColor} error={errors.accentColor} onChange={(v) => set("accentColor", v)} />
        </div>
        <p className="text-[11px] text-faint">SponsorX&rsquo;s status colours (success, warning, error) never change. 4.5:1 is the WCAG AA contrast for body text.</p>
        <label className="block">
          <span className={lbl}>Report footer</span>
          <textarea className={field} rows={2} maxLength={500} value={draft.reportFooter} placeholder="A line printed at the foot of your reports" aria-invalid={!!errors.reportFooter} onChange={(e) => set("reportFooter", e.target.value)} />
          {errors.reportFooter && <span className="mt-1 block text-[11px] text-danger">{errors.reportFooter}</span>}
        </label>
        <label className="block">
          <span className={lbl}>Custom domain (optional)</span>
          <input className={field} value={draft.customDomain} placeholder="partners.example.com" aria-invalid={!!errors.customDomain} onChange={(e) => set("customDomain", e.target.value)} />
          {errors.customDomain ? (
            <span className="mt-1 block text-[11px] text-danger">{errors.customDomain}</span>
          ) : (
            <span className="mt-1 block text-[11px] text-faint">Stored only for now — SponsorX doesn&rsquo;t serve your portal on this domain yet.</span>
          )}
        </label>
      </div>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`text-[11px] ${message.tone === "error" ? "rounded-lg bg-danger/10 px-3 py-2 text-danger" : "text-accent"}`}>
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save branding"}
      </button>
    </form>
  );
}
