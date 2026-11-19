/* --------------------------------------------------------------------------
   POL-FE-108 — the words a BTG "record page" leads with: one organization
   (/admin/onboarding/:id) or one athlete's or guardian's sign-up
   (/admin/new-signups/{athletes|guardians}/:id).

   The owner, 2026-11-17: "the pages are too confusing for a human … having
   many information at once can haywire a human's brain". So each page now
   answers, in order: who is it and where does it stand (one pill), what do
   I do (one "next step" sentence), the few facts a reviewer looks for first
   (four tiles), and then one topic at a time behind tabs.

   Pure: the shapes, and the organization's and the sign-up's words.
   -------------------------------------------------------------------------- */

import { STATE_COPY } from "@/lib/onboarding-live";
import { profileStanding, type ApiOrgProfile } from "@/lib/org-profile-live";
import { liveBadge, type ApiSignupDetail } from "@/lib/signups-live";

/** green = fine, amber = BTG's move, red = stopped, blue = waiting on them, muted = nothing to say. */
export type RecordTone = "green" | "amber" | "red" | "blue" | "muted";

/** The one status in the header; `act` pulses its dot: it is BTG's move. */
export type RecordPill = { label: string; tone: RecordTone; act: boolean };

/** Where it stands in a few words, then what to do in one sentence. The
 *  decision popup opens on it; it is not drawn on the page (the owner turned
 *  down a "Your next step" card there). */
export type RecordNext = { tone: RecordTone; title: string; text: string };

/** One tile: a short answer, what it is the answer to, and a line under it. */
export type RecordFact = { key: string; label: string; value: string; note: string; tone: RecordTone };

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/* ------------------------------------------------------------ organization */

type OrgStanding = Pick<ApiOrgProfile, "onboardingState" | "autoApproved" | "approvedAt" | "flagged">;

export function orgPill(p: OrgStanding): RecordPill {
  if (p.onboardingState === "DRAFT" || p.onboardingState === "CHANGES_REQUESTED") {
    return { label: STATE_COPY[p.onboardingState].label, tone: p.onboardingState === "DRAFT" ? "muted" : "blue", act: false };
  }
  const s = profileStanding(p);
  if (p.onboardingState === "REJECTED") return { label: s.label, tone: "red", act: false };
  const tone: RecordTone = s.tone === "accent" ? "green" : s.tone === "warn" ? "amber" : s.tone === "danger" ? "red" : "muted";
  return { label: s.label, tone, act: s.tone === "warn" };
}

export function orgNextStep(p: OrgStanding): RecordNext {
  switch (p.onboardingState) {
    case "PENDING_REVIEW":
      return { tone: "amber", title: "Waiting for your decision", text: "Read what’s wrong and open the documents, then approve it, ask for changes, or reject it." };
    case "APPROVED":
      return p.flagged
        ? { tone: "amber", title: "Approved, then flagged", text: "A document changed after it was approved. Look at what changed, then leave it as it is or step in." }
        : {
            tone: "green",
            title: "Nothing for you to do",
            text: `${p.autoApproved ? "It passed every check and was approved automatically." : "BTG approved it."} Step in only if something is wrong.`,
          };
    case "SUSPENDED":
      return { tone: "red", title: "Suspended", text: "Its listing access is off. Reinstate it once the problem is sorted." };
    case "REJECTED":
      return p.approvedAt
        ? { tone: "red", title: "Rejected after approval", text: "Its sign-in and listings are off and its payouts are held. You can reinstate it." }
        : { tone: "red", title: "Rejected at review", text: "This is final. Nothing more can be decided here." };
    case "CHANGES_REQUESTED":
      return { tone: "blue", title: "Waiting on the applicant", text: "They were asked for changes and haven’t sent the application back yet." };
    default:
      return { tone: "muted", title: "Still a draft", text: "The applicant hasn’t submitted it yet, so there is nothing to decide." };
  }
}

export function orgFacts(
  p: Pick<ApiOrgProfile, "checks" | "requirements" | "documents">,
  extra: {
    listingAccess: boolean;
    contact: { name: string; role: string } | null;
    /** It is waiting on BTG or flagged: a gap is BTG's to look at (orange). Otherwise a gap is only a fact. */
    attention: boolean;
  },
): RecordFact[] {
  const gap: RecordTone = extra.attention ? "amber" : "muted";
  const passed = p.checks.filter((c) => c.ok).length;
  const total = p.checks.length;
  const reqs = p.requirements;
  const done = reqs.filter((r) => r.done).length;
  const missing = reqs.filter((r) => !r.done);
  const onFile = p.documents.filter((d) => d.current).length;
  return [
    {
      key: "checks", label: "Checks passed", value: total ? `${passed} of ${total}` : "None run",
      note: !total ? "No automatic checks yet" : passed === total ? "Every automatic check" : `${plural(total - passed, "check")} not passed yet`,
      tone: !total ? "muted" : passed === total ? "green" : gap,
    },
    reqs.length
      ? {
          key: "documents", label: "Required documents", value: `${done} of ${reqs.length}`,
          note: missing.length === 0 ? "All of them are in" : `Missing: ${missing[0]!.label}${missing.length > 1 ? ` and ${missing.length - 1} more` : ""}`,
          tone: missing.length === 0 ? "green" : gap,
        }
      : { key: "documents", label: "Documents", value: String(onFile), note: onFile ? "On file now" : "None have arrived", tone: onFile ? "blue" : "muted" },
    {
      key: "contact", label: "Primary contact", value: extra.contact?.name ?? "None given",
      note: extra.contact ? extra.contact.role : "Nobody to email yet", tone: extra.contact ? "blue" : gap,
    },
    {
      key: "listing", label: "Listing access", value: extra.listingAccess ? "On" : "Off",
      note: extra.listingAccess ? "Can put inventory on the marketplace" : "Can’t list anything yet", tone: extra.listingAccess ? "green" : "muted",
    },
  ];
}

/* ----------------------------------------------------------------- sign-up */

export function signupPill(s: Pick<ApiSignupDetail, "state" | "flags">): RecordPill {
  const label = liveBadge(s).label;
  if (s.state === "NEEDS_REVIEW") return { label, tone: "amber", act: true };
  if (s.state === "REJECTED") return { label, tone: "red", act: false };
  return s.flags.length ? { label, tone: "amber", act: true } : { label, tone: "green", act: false };
}

export function signupNextStep(
  s: Pick<ApiSignupDetail, "name" | "state" | "flags" | "missing" | "rejectedWithGuardian" | "can">,
): RecordNext {
  const first = firstName(s.name);
  if (s.can.confirmComingOfAge) {
    return { tone: "amber", title: "A takeover is waiting for you", text: `${first} came of age, but the ID didn’t read clear. Check it, then confirm the takeover or send the ID back.` };
  }
  if (s.state === "NEEDS_REVIEW") {
    return s.missing.length
      ? { tone: "amber", title: "Held, and still waiting on them", text: `You can’t approve yet. ${first} still owes: ${s.missing.join("; ")}.` }
      : { tone: "amber", title: "Waiting for your decision", text: "Read why it is held and open the documents, then approve or reject." };
  }
  if (s.state === "REJECTED") {
    return {
      tone: "red", title: "Rejected",
      text: s.rejectedWithGuardian
        ? "They were rejected with their guardian. Reinstate the guardian to bring them back."
        : s.can.reinstate ? "Their sign-in is off. You can reinstate them." : "Their sign-in is off.",
    };
  }
  if (s.flags.length) {
    return { tone: "amber", title: "Approved, with something flagged", text: "The flag didn’t hold the sign-up. Read it, then leave things as they are or step in." };
  }
  return {
    tone: "green", title: "Nothing for you to do",
    text: `${s.state === "APPROVED" ? "BTG approved this sign-up." : "It passed its checks and was approved automatically."} Step in only if something is wrong.`,
  };
}

export function signupFacts(
  s: Pick<ApiSignupDetail, "kind" | "state" | "signedUpAt" | "approvedAt" | "checks" | "reasons" | "flags" | "problems" | "documents" | "guardian" | "guardianOf">,
): RecordFact[] {
  const held = s.state === "NEEDS_REVIEW";
  const why = Math.max(s.problems?.length ?? 0, s.reasons.length);
  const kids = s.guardianOf;
  const who: RecordFact = s.kind === "GUARDIAN"
    ? {
        key: "who", label: "Looks after", value: kids.length === 1 ? kids[0]!.name : kids.length ? plural(kids.length, "athlete") : "No athletes",
        note: kids.length === 1 ? kids[0]!.sub : kids.length ? kids.map((k) => k.name).join(", ") : "Nobody is linked to this guardian", tone: kids.length ? "blue" : "muted",
      }
    : {
        key: "who", label: "Guardian", value: s.guardian?.name ?? "None",
        note: !s.guardian ? "No guardian on this account" : s.guardian.rejected ? "Their guardian is rejected" : "Looks after this athlete",
        tone: !s.guardian ? "muted" : s.guardian.rejected ? "red" : "blue",
      };
  return [
    who,
    held
      ? { key: "checks", label: "Held for", value: plural(Math.max(why, 1), "reason"), note: "See Overview", tone: "amber" }
      : {
          key: "checks", label: "Checks passed", value: String(s.checks.length),
          note: s.flags.length ? `${plural(s.flags.length, "thing")} flagged` : s.state === "REJECTED" ? "Before it was rejected" : "When it was approved",
          tone: s.flags.length ? "amber" : s.state === "REJECTED" ? "muted" : "green",
        },
    {
      key: "documents", label: "Documents", value: String(s.documents.length),
      note: s.documents.length ? `${s.documents.filter((d) => d.viewable).length} you can open` : "None uploaded", tone: s.documents.length ? "blue" : "muted",
    },
    {
      key: "when", label: "Signed up", value: dayOf(s.signedUpAt),
      note: s.approvedAt ? `Approved ${dayOf(s.approvedAt)}` : held ? "Not approved yet" : "", tone: "muted",
    },
  ];
}
