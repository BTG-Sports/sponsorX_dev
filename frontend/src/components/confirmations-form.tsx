"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { acceptCollabAction, confirmRulesAction } from "@/app/(app)/athlete/confirmations/actions";
import type { ConfirmResult } from "@/lib/athlete-confirmations";

/* --------------------------------------------------------------------------
   ConfirmationsForm — the tick box and button under one card on
   /athlete/confirmations (P8-FE-04 / P8-FE-07). Two steps: tick the line,
   then confirm. The page re-reads on success and when the API says the
   wording moved on; the form unticks either way, so a changed text is read
   again before it is confirmed again.
   -------------------------------------------------------------------------- */

export type ConfirmationTarget =
  | { kind: "rules"; version: string }
  | { kind: "collab"; agreementId: string; bodyHash: string };

export function ConfirmationsForm({ target, line, cta = "Confirm" }: { target: ConfirmationTarget; line: string; cta?: string }) {
  const router = useRouter();
  const [ticked, setTicked] = useState(false);
  const [said, setSaid] = useState<ConfirmResult | null>(null);
  const [pending, start] = useTransition();
  const id = `confirm-${target.kind}`;

  const go = () =>
    start(async () => {
      setSaid(null);
      const r = target.kind === "rules" ? await confirmRulesAction(target.version) : await acceptCollabAction(target.agreementId, target.bodyHash);
      setSaid(r);
      if (r.ok || r.reload) {
        setTicked(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={ticked}
          /* Back/forward must not restore a tick React doesn't hold — the box looked ticked over a dead button (QA 2026-10-23). */
          autoComplete="off"
          disabled={pending}
          onChange={(e) => setTicked(e.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 accent-[var(--sx-primary)]"
        />
        <span className="text-[12px] font-medium leading-relaxed text-text">{line}</span>
      </label>
      <button
        type="button"
        disabled={!ticked || pending}
        onClick={go}
        className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Recording…" : cta}
      </button>
      {/* A plain success says nothing here: the page re-reads and the card turns quiet. */}
      {said && said.message && (
        <p
          role={said.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-2 text-[12px] leading-relaxed ${said.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
        >
          {said.message}
        </p>
      )}
    </div>
  );
}
