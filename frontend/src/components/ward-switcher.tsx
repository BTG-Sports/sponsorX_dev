"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { chooseWardAction } from "@/app/(app)/athlete/ward-actions";

/* --------------------------------------------------------------------------
   2S1-FE-08 — a guardian who looks after more than one athlete picks whose
   account the portal acts for (2S1-BE-11). Everything they then accept,
   list or ask to be paid is for that athlete, from their own login.
   -------------------------------------------------------------------------- */

export function WardSwitcher({ wards, current }: { wards: { athleteId: string; displayName: string }[]; current: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs font-medium">
      Acting for
      <select
        className="min-h-10 rounded-lg border border-line bg-bg px-3 text-sm text-text focus:border-primary/60 focus:outline-none disabled:opacity-50"
        value={current ?? ""}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await chooseWardAction(id);
            router.refresh();
          });
        }}
      >
        {wards.map((w) => (
          <option key={w.athleteId} value={w.athleteId}>{w.displayName}</option>
        ))}
      </select>
    </label>
  );
}
