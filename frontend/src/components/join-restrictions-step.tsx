"use client";

import { useState } from "react";
import { RESTRICTION_CATEGORIES, type Deal } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   Section 7 — the enforced one (P1-ART-07 comp 07). Existing deals as cards
   with a derived "blocked while active" line, a dashed add-row that expands
   into an inline form, and the six category chips. Declared = blocked, not
   deprioritised; the orange treatment is the enforcement signal (§26).
   -------------------------------------------------------------------------- */

export function JoinRestrictionsStep({
  deals,
  excluded,
  onDealsChange,
  onExcludedChange,
}: {
  deals: Deal[];
  excluded: string[];
  onDealsChange: (deals: Deal[]) => void;
  onExcludedChange: (excluded: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Deal>({ name: "", category: "", terms: "" });

  const commitDeal = () => {
    if (!form.name.trim() || !form.category.trim()) return;
    onDealsChange([...deals, { ...form, terms: form.terms.trim() || "terms not specified" }]);
    setForm({ name: "", category: "", terms: "" });
    setAdding(false);
  };

  const toggle = (cat: string) =>
    onExcludedChange(
      excluded.includes(cat) ? excluded.filter((c) => c !== cat) : [...excluded, cat],
    );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-medium text-muted">
          Sponsorships or deals you already have
        </p>
        <div className="mt-2 space-y-3">
          {deals.map((deal, i) => (
            <div
              key={`${deal.name}-${i}`}
              className="sx-join-rise rounded-xl border border-line bg-surface-2 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{deal.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {deal.category} · {deal.terms}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${deal.name}`}
                  onClick={() => onDealsChange(deals.filter((_, j) => j !== i))}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-text"
                >
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 4l8 8M12 4l-8 8" />
                  </svg>
                </button>
              </div>
              <p className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-xs leading-relaxed text-accent">
                <svg viewBox="0 0 16 16" className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M3.5 3.5l9 9" />
                </svg>
                {deal.category} campaigns are blocked while this is active
              </p>
            </div>
          ))}

          <div className="sx-expand" data-open={adding}>
            <div>
              <div className="space-y-3 rounded-xl border border-line bg-surface-2 p-4">
                <label className="block">
                  <span className="text-[11px] font-medium text-muted">Brand or deal name</span>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Midwest Running Co."
                    className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Category</span>
                    <input
                      type="text"
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      placeholder="Footwear"
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Terms</span>
                    <input
                      type="text"
                      value={form.terms}
                      onChange={(e) => setForm({ ...form, terms: e.target.value })}
                      placeholder="exclusive · until Jun 2027"
                      className="mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-accent/60 focus:outline-none"
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={commitDeal}
                    disabled={!form.name.trim() || !form.category.trim()}
                    className="rounded-lg bg-accent px-4 py-2.5 text-xs font-semibold text-cta-ink transition-opacity disabled:opacity-40"
                  >
                    Add deal
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdding(false)}
                    className="rounded-lg px-4 py-2.5 text-xs font-medium text-muted transition-colors hover:text-text"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>

          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-3.5 text-sm font-medium text-muted transition-colors hover:border-accent/50 hover:text-text"
            >
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 3v10M3 8h10" />
              </svg>
              Add another deal
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium text-muted">Categories you will not promote</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          {RESTRICTION_CATEGORIES.map((cat) => {
            const on = excluded.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(cat)}
                className={`flex min-h-11 items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors ${
                  on
                    ? "border-accent/60 bg-accent/12 text-text"
                    : "border-line bg-surface-2 text-text hover:border-line/80 hover:bg-surface"
                }`}
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded transition-colors ${
                    on ? "sx-pop bg-accent" : "bg-text"
                  }`}
                >
                  {on && (
                    <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="var(--sx-cta-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0s" } as React.CSSProperties} />
                    </svg>
                  )}
                </span>
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[11px] text-faint">
        You can update restrictions at any time from your profile.
      </p>
    </div>
  );
}
