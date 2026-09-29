"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { InventoryForm } from "@/components/inventory-form";
import type { InventoryBody } from "@/lib/inventory-live";

/* --------------------------------------------------------------------------
   2S2-FE-02 — the two small client islands the inventory manager needs:
   pause/resume (PATCH {active}) and the "New item" panel. Everything else
   on the list is server-rendered.
   -------------------------------------------------------------------------- */

type Result = { ok: true; id: string } | { ok: false; message: string };

/** Pause selling / Resume selling — never touches price, so never frozen. */
export function InventoryPauseToggle({
  id,
  active,
  setActive,
  compact = false,
}: {
  id: string;
  active: boolean;
  setActive: (id: string, active: boolean) => Promise<Result>;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await setActive(id, !active);
      if (r.ok) router.refresh();
      else setError(r.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={`rounded-lg border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50 ${
          compact ? "px-2.5 py-1 text-[11px]" : "px-4 py-2 text-xs"
        }`}
      >
        {busy ? "Saving…" : active ? "Pause selling" : "Resume selling"}
      </button>
      {error && (
        <span role="alert" className="max-w-56 text-right text-[11px] text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

/** "+ New item" → the create form, in place. */
export function InventoryNewItem({
  create,
  components,
  savedHref,
  startOpen = false,
}: {
  create: (body: InventoryBody) => Promise<Result>;
  components: Array<{ id: string; label: string }>;
  savedHref: string;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
      >
        + New item
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold tracking-tight">New item</h2>
      <InventoryForm mode="create" create={create} components={components} savedHref={savedHref} onCancel={() => setOpen(false)} />
    </div>
  );
}
