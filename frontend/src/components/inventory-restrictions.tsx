"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { BRAND_CATEGORIES, categoryLabel, type RestrictionRow } from "@/lib/inventory-live";

/* --------------------------------------------------------------------------
   2S2-FE-02 — "Categories you won't promote": the athlete's own brand
   restrictions (GET/POST /restrictions, DELETE /restrictions/:id). A
   restriction blocks a purchase or an offer in that category for its
   dates; one added here is open-ended PROHIBITED. League/school rules and an
   accepted offer's exclusivity show too, but only the athlete's own manual
   ones can be removed — the API refuses the rest.
   -------------------------------------------------------------------------- */

type Result = { ok: true } | { ok: false; message: string };

const INPUT =
  "rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint outline-none focus:border-primary/50";

export function InventoryRestrictions({
  rows,
  add,
  remove,
}: {
  rows: RestrictionRow[];
  add: (category: string, reason: string) => Promise<Result>;
  remove: (id: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<Result>) => {
    setBusy(key);
    setError(null);
    try {
      const r = await fn();
      if (r.ok) {
        if (key === "add") {
          setCategory("");
          setReason("");
        }
        router.refresh();
      } else setError(r.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <p className="text-xs text-muted">None yet. Sponsors in a category you add here can&rsquo;t buy your items or send you offers.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{r.category}</span>
                <span className="block text-[11px] text-muted">
                  {r.type}
                  {r.window ? ` · ${r.window}` : " · no end date"}
                  {r.reason ? ` · ${r.reason}` : ""}
                </span>
              </span>
              {r.removable ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run(r.id, () => remove(r.id))}
                  className="shrink-0 text-[11px] text-muted hover:text-text disabled:opacity-50"
                >
                  {busy === r.id ? "Removing…" : "Remove"}
                </button>
              ) : (
                <span className="shrink-0 text-[10px] text-faint">Set by contract or rule</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (category) void run("add", () => add(category, reason));
        }}
      >
        <select aria-label="Category" className={INPUT} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Add a category…</option>
          {BRAND_CATEGORIES.map((c) => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </select>
        <input aria-label="Reason (optional)" className={`${INPUT} min-w-0 flex-1`} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
        <button
          type="submit"
          disabled={!category || busy !== null}
          className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40"
        >
          {busy === "add" ? "Adding…" : "Add"}
        </button>
      </form>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
