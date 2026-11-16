"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { StageMove } from "@/lib/campaign-stage";

/* --------------------------------------------------------------------------
   POL-FE-52 (app review B1) — BTG's hand moves on the campaign page: Start
   staffing, Move to approval, Back to staffing / draft. Each is one click
   on the existing transition; the API's refusal comes back in words.
   -------------------------------------------------------------------------- */

export function StageMoveButtons({
  campaignId,
  moves,
  move,
}: {
  campaignId: string;
  moves: StageMove[];
  move: (campaignId: string, to: StageMove["to"]) => Promise<{ ok: boolean; message: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (!moves.length) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Move the campaign">
        {moves.map((m) => (
          <button
            key={m.to}
            type="button"
            title={m.hint}
            disabled={pending}
            onClick={() =>
              start(async () => {
                setNote(null);
                const r = await move(campaignId, m.to);
                setNote({ ok: r.ok, text: r.message });
                if (r.ok) router.refresh();
              })
            }
            className={
              m.primary
                ? "min-h-10 rounded-lg bg-primary px-4 text-[12px] font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-40"
                : "min-h-10 rounded-lg border border-line px-4 text-[12px] font-medium text-text hover:bg-surface-2 disabled:opacity-40"
            }
          >
            {m.label}
          </button>
        ))}
      </div>
      {note && (
        <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-xs text-accent" : "text-xs text-danger"}>
          {note.text}
        </p>
      )}
    </div>
  );
}
