"use client";

import { useState } from "react";

import { rewardQrUrlAction } from "@/app/(app)/sponsor/campaigns/[id]/actions";

/** POL-FE-67 — opens a reward token's QR on a short-lived signed link. */
export function QrLinkButton({ tokenId }: { tokenId: string }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="rounded-md border border-line px-2.5 py-1 text-[11px] font-medium hover:bg-surface-2"
        onClick={async () => {
          const r = await rewardQrUrlAction(tokenId);
          if (r.ok) window.open(r.url, "_blank", "noopener");
          else setErr(r.message);
        }}
      >
        Open QR
      </button>
      {err && <span role="alert" className="text-[11px] text-danger">{err}</span>}
    </span>
  );
}
