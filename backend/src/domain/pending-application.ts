/**
 * POL-BE-118 — someone signs in before their account exists.
 *
 * Phase 1 opens a login only when an application is approved: a sponsor's
 * brief (sponsor-requests.ts) or an athlete's /join application
 * (athlete-login.ts). Signing in earlier used to answer only "no SponsorX
 * account … apply on Get started" — to someone who had just applied (owner,
 * 2026-11-20: "this is super misleading").
 *
 * This finds what the signed-in address applied for and where it stands, so
 * the sign-in page can say so. For a sponsor it also counts the sign-in as
 * confirming the email (the same proof as the emailed link), which may open
 * the account there and then — `opened` tells the caller to claim it.
 *
 * Read only from identity resolution (auth/actor.ts), which has no actor and
 * no tenant: the verified address is the only key, as for claiming a login.
 */

import { prisma } from "../db/client";
import type { AthleteState } from "./athlete-state";
import { sponsorRequestForSignIn } from "./sponsor-requests";

export type PendingApplication =
  | {
      kind: "sponsor";
      /** NEW (waiting), DECLINED or REJECTED. */
      state: string;
      businessName: string;
      /** What the applicant still has to do, in words ("upload your proof of business"). */
      missing: string[];
      /** Everything is in and BTG is looking at it. */
      underReview: boolean;
      /** The status page, where the proof is uploaded: `/sponsor-request/<token>`. */
      statusPath: string;
    }
  | {
      kind: "athlete";
      /** DRAFT, SUBMITTED, UNDER_REVIEW, CHANGES_REQUESTED or REJECTED. */
      state: string;
      displayName: string;
    };

const ATHLETE_WAITING: AthleteState[] = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "REJECTED"];

export async function pendingApplicationFor(email: string): Promise<{ pending: PendingApplication | null; opened: boolean }> {
  const sponsor = await sponsorRequestForSignIn(email);
  if (sponsor) {
    return {
      opened: sponsor.opened,
      pending: {
        kind: "sponsor", state: sponsor.state, businessName: sponsor.businessName, missing: sponsor.missing,
        underReview: sponsor.underReview, statusPath: `/sponsor-request/${sponsor.requestToken}`,
      },
    };
  }
  const athlete = await prisma.athlete.findFirst({
    /* tenant-scope: identity resolution — no actor and no tenant yet; the signed-in, verified address is the key. */
    where: { email: { equals: email.trim(), mode: "insensitive" }, state: { in: ATHLETE_WAITING } },
    select: { state: true, displayName: true }, orderBy: { createdAt: "desc" },
  });
  if (athlete) return { opened: false, pending: { kind: "athlete", state: athlete.state, displayName: athlete.displayName } };
  return { opened: false, pending: null };
}
