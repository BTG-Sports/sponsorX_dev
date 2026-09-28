"use client";

import { useRouter } from "next/navigation";
import { MatchingStudio, type SendOutcome } from "@/components/matching-studio";
import type { MatchAthlete, MatchData } from "@/lib/matching";
import type { SendPick } from "@/app/(app)/admin/campaigns/match/actions";

/* --------------------------------------------------------------------------
   The Studio on a real brief (P4-FE-02 / -03). Only the send is new: picks
   become their per-line invitations, the server action sends them, and the
   page re-renders from Postgres so the roster reads each athlete's invite
   state rather than a local "sent" flag.
   -------------------------------------------------------------------------- */

export function LiveMatchingStudio({
  data,
  initial,
  send,
}: {
  data: MatchData;
  initial?: Partial<Record<"view" | "q" | "sport" | "tier" | "min", string>>;
  send: (picks: SendPick[]) => Promise<SendOutcome[]>;
}) {
  const router = useRouter();
  const onSend = async (athletes: MatchAthlete[]) => {
    const out = await send(
      athletes.map((a) => ({
        athleteId: a.id,
        lines: (a.lines ?? []).map((l) => ({ jobId: l.jobId, offered: l.offered })),
      })),
    );
    router.refresh();
    return out;
  };
  return <MatchingStudio data={data} initial={initial} onSend={onSend} />;
}
