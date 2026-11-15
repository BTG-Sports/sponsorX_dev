"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTrackingLinkAction, recordViewsAction } from "@/app/(app)/admin/approvals/actions";
import { countOf, linkProblem, trackingUrl, viewsProblem } from "@/lib/deliverable-metrics-live";

/* --------------------------------------------------------------------------
   POL-FE-62 (app review §2) — in a published post's drawer: "Record views"
   (a day's views and engagements, checked by BTG) and "Create tracking
   link" (the link the post should carry, so clicks reach the report).
   -------------------------------------------------------------------------- */

const field = "min-h-9 w-full rounded-lg border border-line bg-surface-2/60 px-2.5 text-xs text-text focus:border-admin focus:outline-none";
const btn = "inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40";

export function MetricsTools({ deliverableId, publishedUrl, today }: { deliverableId: string; publishedUrl?: string | null; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ day: today, views: "", engagements: "0" });
  const [dest, setDest] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  return (
    <section aria-label="Reach and clicks" className="mt-4 space-y-3 rounded-lg border border-line-soft p-3">
      <form
        aria-label="Record views"
        className="grid grid-cols-3 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const p = viewsProblem(f, today);
          if (p) return setNote({ ok: false, text: p });
          start(async () => {
            const r = await recordViewsAction(deliverableId, f.day, countOf(f.views)!, countOf(f.engagements || "0")!);
            setNote({ ok: r.ok, text: r.message });
            if (r.ok) { setF((x) => ({ ...x, views: "", engagements: "0" })); router.refresh(); }
          });
        }}
      >
        <p className="col-span-3 text-[11px] font-medium text-muted">Record views (from the platform&apos;s insights)</p>
        <input aria-label="Day" type="date" max={today} className={field} value={f.day} onChange={(e) => setF((x) => ({ ...x, day: e.target.value }))} />
        <input aria-label="Views" inputMode="numeric" placeholder="Views" className={field} value={f.views} onChange={(e) => setF((x) => ({ ...x, views: e.target.value }))} />
        <input aria-label="Engagements" inputMode="numeric" placeholder="Engagements" className={field} value={f.engagements} onChange={(e) => setF((x) => ({ ...x, engagements: e.target.value }))} />
        <button type="submit" disabled={pending} className={`${btn} col-span-3 justify-center`}>Record views</button>
      </form>
      <form
        aria-label="Create tracking link"
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const p = linkProblem(dest);
          if (p) return setNote({ ok: false, text: p });
          start(async () => {
            const r = await createTrackingLinkAction(deliverableId, dest);
            if (r.ok) { setLink(trackingUrl(window.location.origin, r.code)); setNote({ ok: true, text: "Tracking link made — the athlete puts this in the post; clicks show in the report." }); }
            else setNote({ ok: false, text: r.message });
          });
        }}
      >
        <p className="text-[11px] font-medium text-muted">Create tracking link — where should a fan&apos;s click go?</p>
        <input aria-label="Destination" className={field} placeholder={publishedUrl ? "The sponsor's page, e.g. https://…" : "https://…"} value={dest} onChange={(e) => setDest(e.target.value)} />
        <button type="submit" disabled={pending} className={btn}>Create tracking link</button>
        {link && <p className="break-all font-mono text-[11px] text-text">{link}</p>}
      </form>
      {note && <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-[11px] text-accent" : "text-[11px] text-danger"}>{note.text}</p>}
    </section>
  );
}
