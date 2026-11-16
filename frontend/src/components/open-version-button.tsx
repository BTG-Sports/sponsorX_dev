"use client";

import { useState } from "react";

/* --------------------------------------------------------------------------
   POL-FE-69 — an athlete opens a version they uploaded (GET
   /deliverables/:id/assets/:version/url, a short-lived signed read, audited
   by the API). The tab opens on the click so the browser doesn't block it,
   then follows the signed link once it arrives.
   -------------------------------------------------------------------------- */

type Link = (id: string, version: number) => Promise<{ ok: true; url: string } | { ok: false; message: string }>;

export function OpenVersionButton({ id, version, link }: { id: string; version: number; link: Link }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const w = window.open("about:blank", "_blank");
          const r = await link(id, version);
          setBusy(false);
          if (r.ok && w) w.location.href = r.url;
          else {
            w?.close();
            setErr(r.ok ? "Your browser blocked the new tab." : r.message);
          }
        }}
        aria-label={`Open version ${version}`}
        className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-text hover:bg-surface-2 disabled:opacity-50"
      >
        {busy ? "Opening…" : "Open"}
      </button>
      {err && <span role="alert" className="text-[10px] text-danger">{err}</span>}
    </span>
  );
}
