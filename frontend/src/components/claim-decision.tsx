"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import { decideClaimAction } from "@/app/(app)/advisor/actions";

/* P9-FE-08 — the school's half of a claim. A claimant not on the roster
   cannot be verified (the API refuses it); the button says why instead of
   inviting the refusal. */
export function ClaimDecision({ claimId, rosterMatched }: { claimId: string; rosterMatched: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const go = (d: "verify" | "reject") =>
    start(async () => {
      const r = await decideClaimAction(claimId, d);
      setMsg(r);
      if (r.ok) router.refresh();
    });
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => go("verify")}
          disabled={pending || !rosterMatched}
          title={rosterMatched ? undefined : "Not on your school's roster — this claim can't be verified"}
        >
          Verify
        </Button>
        <Button variant="secondary" onClick={() => go("reject")} disabled={pending}>
          Reject
        </Button>
      </div>
      {msg && <p role="status" className={`max-w-sm text-right text-[11px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.message}</p>}
    </div>
  );
}
