"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { Dropdown } from "@/components/filter-kit";
import { BRAND_CATEGORIES, categoryLabel, type RestrictionRow } from "@/lib/inventory-live";

/* --------------------------------------------------------------------------
   2S2-FE-02 — "Categories you won't promote": the athlete's own brand
   restrictions (GET/POST /restrictions, DELETE /restrictions/:id). A
   restriction blocks a purchase or an offer in that category for its
   dates; one added here is open-ended PROHIBITED. League/school rules and an
   accepted offer's exclusivity show too, but only the athlete's own manual
   ones can be removed — the API refuses the rest.

   POL-FE-83 (2026-11-16) — drawn as chips: each category a sticker with
   its ✕ (or a lock when a contract or rule set it), the add row over them,
   inside the "Won't promote" popup on the inventory page's header.
   Styles in app/(app)/athlete/inventory/inventory.css (`.sx-iv-ban…`).
   Same reads, same writes.
   -------------------------------------------------------------------------- */

type Result = { ok: true } | { ok: false; message: string };

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
  /* memory: double-submit-needs-a-ref */
  const lock = useRef(false);

  const run = async (key: string, fn: () => Promise<Result>) => {
    if (lock.current) return;
    lock.current = true;
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
      lock.current = false;
      setBusy(null);
    }
  };

  return (
    <div className="sx-iv-ban">
      <div className="sx-iv-ban-intro">
        <p>
          Sponsors in these categories <strong>can&rsquo;t buy your items or send you offers</strong>. It covers every item you sell.
        </p>
      </div>

      <form
        className="sx-iv-ban-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (category) void run("add", () => add(category, reason));
        }}
      >
        <Dropdown
          label="Category"
          allLabel="Add a category…"
          value={category}
          options={BRAND_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }))}
          onChange={setCategory}
          tone="athlete"
          /* POL-FE-45 opened this menu upward: it was the last thing on the page and its last
             categories sat under the phone's bottom navigation bar. POL-FE-83 moved the form into
             a popup above that bar, at the top of a body tall enough for the whole menu
             (`.sx-iv-sheet[data-open] .sx-iv-sheet-body`), so it opens downward again — upward
             it covered the popup's own title. */
          placement="down"
        />
        <input
          aria-label="Reason (optional)"
          className="sx-iv-input min-w-0 flex-1 basis-40"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)"
        />
        <button type="submit" disabled={!category || busy !== null} className="sx-iv-ban-submit">
          {busy === "add" ? "Adding…" : "Add"}
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="sx-iv-ban-none">None yet. Add a category above if there&rsquo;s a kind of brand you&rsquo;d never promote.</p>
      ) : (
        <ul className="sx-iv-ban-chips">
          {rows.map((r, i) => (
            <li key={r.id} className="sx-iv-ban-chip sx-iv-rise" data-locked={r.removable ? undefined : ""} data-busy={busy === r.id ? "" : undefined} style={{ "--d": `${0.04 * i}s` } as React.CSSProperties}>
              <span className="min-w-0">
                <span className="sx-iv-ban-name">{r.category}</span>
                <span className="sx-iv-ban-sub">
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
                  className="sx-iv-ban-x"
                  aria-label={`Remove ${r.category}`}
                  title="Remove"
                >
                  {busy === r.id ? <span className="sx-iv-spin" aria-hidden="true" /> : <Glyph ui="close" className="size-3.5" />}
                </button>
              ) : (
                <span className="sx-iv-ban-lock" title="Set by a contract or a rule, so it can't be removed here">
                  <Glyph ui="lock" className="size-3.5" />
                  <span className="sr-only">Set by contract or rule</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="sx-iv-error">
          {error}
        </p>
      )}
    </div>
  );
}
