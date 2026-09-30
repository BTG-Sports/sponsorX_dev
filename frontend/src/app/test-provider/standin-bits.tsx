import type { ReactNode } from "react";
import Link from "next/link";

import { publicApi } from "@/app/(public)/onboarding/public-api";
import { parseStandinDetails, STANDIN_BANNER, type StandinDetails } from "@/lib/order-payment-live";

/* --------------------------------------------------------------------------
   The stand-in payment provider's frame and its one read — shared by
   /test-provider/account and /test-provider/checkout (2S5-FE-03, 2S5-FE-05).

   Deliberately NOT the SponsorX chrome: no portal nav, no marketing header.
   The page stands in for Stripe, so it must look like somewhere else, and
   say loudly that no real money moves.

   Reads GET /public/test-provider/details?token=… (no login). 400 = the link
   is invalid or expired, or the stand-in is switched off.
   -------------------------------------------------------------------------- */

export type DetailsResult =
  | { ok: true; details: StandinDetails }
  | { ok: false; reason: "invalid" | "down" };

export async function readStandin(token: string): Promise<DetailsResult> {
  if (!token) return { ok: false, reason: "invalid" };
  try {
    const res = await publicApi(`/public/test-provider/details?token=${encodeURIComponent(token)}`);
    if (res.status === 400 || res.status === 404) return { ok: false, reason: "invalid" };
    if (!res.ok) return { ok: false, reason: "down" };
    const details = parseStandinDetails(await res.json().catch(() => null));
    return details ? { ok: true, details } : { ok: false, reason: "invalid" };
  } catch {
    return { ok: false, reason: "down" };
  }
}

export function StandinFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-bg px-4 py-10 text-text">
      <div className="mx-auto max-w-md space-y-5">
        <div role="note" className="rounded-xl border-2 border-dashed border-warn/60 bg-warn/12 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-warn">{STANDIN_BANNER}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface-2 p-6 shadow-sm">
          <p className="font-mono text-[11px] uppercase tracking-widest text-faint">Test payment provider</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">{title}</h1>
          <div className="mt-4 space-y-4">{children}</div>
        </div>
      </div>
    </main>
  );
}

/** A bad, expired or refused link — a way back to SponsorX, no dead end. */
export function StandinProblem({ reason }: { reason: "invalid" | "down" }) {
  return (
    <StandinFrame title={reason === "invalid" ? "This link has expired" : "The test provider isn't answering"}>
      <p className="text-sm text-muted">
        {reason === "invalid"
          ? "This test-provider link is invalid or has expired (links last an hour), or the test provider is switched off here. Go back to SponsorX and start again — nothing was charged or changed."
          : "We couldn't reach the test provider just now. Nothing was charged or changed. Try again in a minute, or go back to SponsorX."}
      </p>
      <Link href="/" className="inline-flex text-sm font-medium text-primary-soft hover:underline">
        ← Back to SponsorX
      </Link>
    </StandinFrame>
  );
}

/** The ?e= a failed button leaves behind, as one line. */
export function StandinError({ e }: { e: string | undefined }) {
  if (!e) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
      {e === "invalid"
        ? "That didn't go through — the link is invalid or has expired. Go back to SponsorX and start again."
        : "That didn't go through — the test provider couldn't be reached. Try again."}
    </p>
  );
}

export const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
