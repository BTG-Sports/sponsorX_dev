"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  BRAND_CATEGORIES,
  EMPTY_DRAFT,
  INVENTORY_KINDS,
  KIND_LABEL,
  MAX_COMPONENTS,
  categoryLabel,
  draftFromItem,
  patchFrom,
  toggleCategory,
  validateDraft,
  type ApiInventoryItem,
  type DraftErrors,
  type InventoryBody,
  type InventoryDraft,
} from "@/lib/inventory-live";

/* --------------------------------------------------------------------------
   InventoryForm — 2S2-FE-02. One form for a new item and for editing one,
   shared by the athlete and the team manager.

   The draft is checked by `validateDraft` (the API's own rules, mirrored)
   before anything is sent, so a refusal the API would give is caught here
   with the field it belongs to. What reaches the API: a full body on create
   (components only for a PACKAGE), and on edit only the fields that changed
   (`patchFrom`) — so saving a new title never trips the published-listing
   price freeze. A refusal the form can't foresee (409: not yet approved, or
   a live listing) is shown as the API's sentence.
   -------------------------------------------------------------------------- */

type Result = { ok: true; id: string } | { ok: false; message: string };

const INPUT =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint outline-none transition-colors focus:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60";
const LABEL = "mb-1 block text-[11px] font-medium text-muted";

function FieldError({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-[11px] text-danger">{text}</p> : null;
}

export function InventoryForm({
  mode,
  item,
  components = [],
  create,
  update,
  savedHref,
  onCancel,
}: {
  mode: "create" | "edit";
  /** The item being edited (edit mode). */
  item?: ApiInventoryItem;
  /** Items a new package may bundle. */
  components?: Array<{ id: string; label: string }>;
  create?: (body: InventoryBody) => Promise<Result>;
  update?: (id: string, patch: Partial<InventoryBody>) => Promise<Result>;
  /** Where to go after a create — `{id}` is replaced with the new item's id. */
  savedHref?: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const initial: InventoryDraft = item ? { ...draftFromItem(item), components: [] } : EMPTY_DRAFT;
  const [d, setD] = useState<InventoryDraft>(initial);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const isPackage = d.kind === "PACKAGE";
  const lockedPackage = mode === "edit" && item?.kind === "PACKAGE";
  const set = <K extends keyof InventoryDraft>(k: K, v: InventoryDraft[K]) => setD((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setMessage(null);
    const v = validateDraft(d, mode);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (mode === "create" && create) {
        const r = await create(v.body);
        if (!r.ok) setMessage({ tone: "error", text: r.message });
        else if (savedHref) router.push(savedHref.replace("{id}", encodeURIComponent(r.id)));
        else {
          setD(EMPTY_DRAFT);
          setMessage({ tone: "ok", text: "Saved." });
          router.refresh();
        }
      } else if (mode === "edit" && update && item) {
        const patch = patchFrom(item, v.body);
        if (Object.keys(patch).length === 0) {
          setMessage({ tone: "ok", text: "Nothing changed." });
          return;
        }
        const r = await update(item.id, patch);
        if (!r.ok) setMessage({ tone: "error", text: r.message });
        else {
          setMessage({ tone: "ok", text: "Saved. Orders already placed keep the price they were placed at." });
          router.refresh();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const kindOptions = INVENTORY_KINDS.filter((k) => (lockedPackage ? k === "PACKAGE" : mode === "edit" ? k !== "PACKAGE" : true));

  return (
    <form
      className="space-y-4"
      aria-label={mode === "create" ? "New inventory item" : "Edit inventory item"}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div>
        <label className={LABEL} htmlFor="inv-title">Title</label>
        <input id="inv-title" className={INPUT} value={d.title} maxLength={200} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Basketball clinic" />
        <FieldError text={errors.title} />
      </div>

      <div>
        <label className={LABEL} htmlFor="inv-desc">Description</label>
        <textarea id="inv-desc" rows={2} className={INPUT} value={d.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} placeholder="What the sponsor gets, where and for how long." />
        <FieldError text={errors.description} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="inv-kind">Kind</label>
          <select id="inv-kind" className={INPUT} value={d.kind} disabled={lockedPackage} onChange={(e) => set("kind", e.target.value as InventoryDraft["kind"])}>
            {kindOptions.map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
          <FieldError text={errors.kind} />
        </div>
        <div>
          <label className={LABEL} htmlFor="inv-price">Price (USD)</label>
          <input id="inv-price" inputMode="decimal" className={INPUT} value={d.price} onChange={(e) => set("price", e.target.value)} placeholder="250.00" />
          <FieldError text={errors.price} />
        </div>
        <div>
          <label className={LABEL} htmlFor="inv-qty">Quantity</label>
          <input id="inv-qty" inputMode="numeric" className={INPUT} value={d.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="Blank = open" />
          <FieldError text={errors.quantity} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="inv-from">Available from</label>
          <input id="inv-from" type="date" className={INPUT} value={d.availableFrom} onChange={(e) => set("availableFrom", e.target.value)} />
          <FieldError text={errors.availableFrom} />
        </div>
        <div>
          <label className={LABEL} htmlFor="inv-until">Available until</label>
          <input id="inv-until" type="date" className={INPUT} value={d.availableUntil} onChange={(e) => set("availableUntil", e.target.value)} />
          <FieldError text={errors.availableUntil} />
        </div>
      </div>

      {isPackage && mode === "create" && (
        <fieldset className="rounded-lg border border-line-soft p-3">
          <legend className="px-1 text-[11px] font-medium text-muted">What the package bundles</legend>
          {components.length === 0 ? (
            <p className="text-[11px] text-muted">Add a single item first — a package is built from your own items.</p>
          ) : (
            <div className="space-y-2">
              {d.components.map((c, n) => (
                <div key={n} className="flex items-center gap-2">
                  <select
                    aria-label={`Item ${n + 1}`}
                    className={INPUT}
                    value={c.itemId}
                    onChange={(e) => set("components", d.components.map((x, i) => (i === n ? { ...x, itemId: e.target.value } : x)))}
                  >
                    <option value="">Pick an item…</option>
                    {components.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    aria-label={`Units of item ${n + 1}`}
                    type="number"
                    min={1}
                    max={100}
                    className={`${INPUT} w-20`}
                    value={c.quantity}
                    onChange={(e) => set("components", d.components.map((x, i) => (i === n ? { ...x, quantity: Number(e.target.value) } : x)))}
                  />
                  <button
                    type="button"
                    className="text-[11px] text-muted hover:text-text"
                    onClick={() => set("components", d.components.filter((_, i) => i !== n))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {d.components.length < MAX_COMPONENTS && (
                <button
                  type="button"
                  className="text-[11px] font-medium text-primary hover:underline"
                  onClick={() => set("components", [...d.components, { itemId: "", quantity: 1 }])}
                >
                  + Add an item
                </button>
              )}
            </div>
          )}
          <FieldError text={errors.components} />
          <p className="mt-2 text-[10px] text-faint">A package&rsquo;s contents are fixed once it&rsquo;s saved.</p>
        </fieldset>
      )}

      {lockedPackage && item && item.components.length > 0 && (
        <div className="rounded-lg border border-line-soft p-3">
          <p className="text-[11px] font-medium text-muted">This package bundles</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {item.components.map((c) => (
              <li key={c.component.id} className="flex justify-between gap-2">
                <span className="truncate">{c.component.title}</span>
                <span className="text-muted tabular-nums">× {c.quantity}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-faint">Contents are fixed — create a new package to change them.</p>
        </div>
      )}

      {(["restrictedCategories", "categories"] as const).map((list) => (
        <fieldset key={list}>
          <legend className={LABEL}>
            {list === "restrictedCategories" ? "Won’t sell to these brand categories" : "Good fit for these brand categories (optional)"}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {BRAND_CATEGORIES.map((c) => {
              const on = d[list].includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setD((p) => ({ ...p, ...toggleCategory(p, list, c) }))}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                    on
                      ? list === "restrictedCategories"
                        ? "border-danger/40 bg-danger/10 text-text"
                        : "border-primary/40 bg-primary/10 text-text"
                      : "border-line text-muted hover:text-text"
                  }`}
                >
                  {categoryLabel(c)}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <FieldError text={errors.categories} />

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-[11px] leading-relaxed ${message.tone === "error" ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"}`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Saving…" : mode === "create" ? "Add item" : "Save changes"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-xs text-muted hover:text-text">
            Cancel
          </button>
        )}
      </div>
      {mode === "edit" && (
        <p className="text-[10px] leading-relaxed text-faint">
          Price and quantity can&rsquo;t change while a listing of this item is live on the marketplace — pause the listing first.
        </p>
      )}
    </form>
  );
}
