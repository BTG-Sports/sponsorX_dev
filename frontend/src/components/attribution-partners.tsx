"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  partnerLine, partnerProblem, type AddedPartner, type ApiPartnerDesk,
} from "@/lib/attribution-partners-live";

/* --------------------------------------------------------------------------
   POL-FE-74 — the Partners panel on Attribution: the commerce partners who
   send sales, and (for a BTG admin) adding one. The partner's secret token is
   shown once, with the address it posts to; SponsorX keeps only its hash.
   -------------------------------------------------------------------------- */

type Result = { ok: true; added: AddedPartner } | { ok: false; message: string };

export function AttributionPartners({ desk, canAdd, add }: {
  desk: ApiPartnerDesk;
  canAdd: boolean;
  add: (name: string, adapter: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [adapter, setAdapter] = useState(desk.adapters[0]?.key ?? "");
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedPartner | null>(null);
  const [pending, start] = useTransition();
  const problem = partnerProblem(name, adapter, desk.adapters);

  return (
    <section aria-labelledby="partners-title" className="sx-stadium-panel space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="partners-title" className="sx-section-title">Partners</h2>
        {canAdd && !open && (
          <button type="button" onClick={() => { setOpen(true); setAdded(null); }} className="min-h-9 rounded-lg bg-primary px-3 text-[12px] font-semibold text-cta-ink hover:bg-primary-soft">
            Add partner
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted">Commerce partners send their sales here, and each is matched to a campaign.</p>

      {desk.partners.length === 0 ? (
        <p className="text-sm text-muted">No partners yet.{canAdd ? " Add one to start receiving sales." : " A BTG admin adds them."}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {desk.partners.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="text-sm font-medium text-text">{p.name}{!p.enabled && <span className="ml-2 text-[11px] text-faint">switched off</span>}</span>
              <span className="text-[11px] text-muted">{desk.adapters.find((a) => a.key === p.adapter)?.name ?? p.adapter} · {partnerLine(p)}</span>
            </li>
          ))}
        </ul>
      )}

      {added && (
        <div role="status" className="space-y-1.5 rounded-lg border border-accent/40 bg-accent/10 p-3 text-[12px]">
          <p className="font-semibold text-accent">{added.partner.name} is added.</p>
          <p className="text-muted">Give the partner this token and address now — the token isn&apos;t shown again.</p>
          <p className="break-all font-mono text-[11px] text-text">{added.token}</p>
          <p className="break-all font-mono text-[11px] text-text">POST {added.endpoint} <span className="font-sans text-muted">(on the SponsorX API address)</span></p>
        </div>
      )}

      {open && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (problem) return setError(problem);
            setError(null);
            start(async () => {
              const r = await add(name.trim(), adapter);
              if (!r.ok) return setError(r.message);
              setAdded(r.added);
              setOpen(false);
              setName("");
              router.refresh();
            });
          }}
        >
          <label className="block text-[11px] font-medium text-muted">
            Partner name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="mt-1 block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text" />
          </label>
          <label className="block text-[11px] font-medium text-muted">
            How they send sales
            <select value={adapter} onChange={(e) => setAdapter(e.target.value)} className="mt-1 block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text">
              {desk.adapters.map((a) => (
                <option key={a.key} value={a.key}>{a.name}</option>
              ))}
            </select>
          </label>
          {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="min-h-9 rounded-lg bg-primary px-3 text-[12px] font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-40">
              {pending ? "Adding…" : "Add partner"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null); }} className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-medium text-text hover:bg-surface-2">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
