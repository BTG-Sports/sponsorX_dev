/* --------------------------------------------------------------------------
   POL-FE-118 — what the sign-in page (/portal) says to someone signed in with
   no login yet, about what they applied for. Owner, 2026-11-20: after
   sending a brief and signing in they read "this address doesn't have a
   SponsorX account yet … apply on Get started" — "this is super misleading".

   The API reports the application (backend domain/pending-application.ts);
   these are its words. Pure, so every case is tested
   (tests/pol-fe-118-pending-words.test.ts).
   -------------------------------------------------------------------------- */

import type { PendingApplication } from "@/server/api";

export type PendingWords = {
  heading: string;
  lead: string;
  /** What is still to do, one sentence each. */
  todo: string[];
  after?: string;
  action?: { href: string; label: string };
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + ".";

export function pendingWords(p: PendingApplication | null | undefined): PendingWords | null {
  if (!p) return null;
  if (p.kind === "sponsor") {
    const status = { href: p.statusPath, label: "See your request" };
    if (p.state === "DECLINED") {
      return { heading: "Your sponsor request wasn’t approved", lead: `BTG didn’t approve the request for ${p.businessName}, so no account was opened.`, todo: [], after: "Your request page says why.", action: status };
    }
    if (p.state === "REJECTED") {
      return { heading: "This sponsor account is closed", lead: `BTG closed the account for ${p.businessName}.`, todo: [], after: "Contact BTG support if you think this is a mistake." };
    }
    /* Signing in with the request's address confirms it (the API does so before answering). */
    const todo = p.missing.filter((m) => !/confirm your email/i.test(m));
    if (todo.length) {
      const proof = todo.some((m) => /proof/i.test(m));
      return {
        heading: "Your sponsor request is almost ready",
        lead: `Your request for ${p.businessName} is in, and signing in has confirmed your email. Your account opens as soon as you:`,
        todo: todo.map(sentence),
        action: proof ? { href: p.statusPath, label: "Upload your proof of business" } : status,
      };
    }
    return {
      heading: "BTG is checking your sponsor request",
      lead: `Everything for ${p.businessName} is in. A person at BTG checks it before the account opens, usually within 2 business days.`,
      todo: [],
      after: "We’ll email you when your account is ready. Sign in again then.",
      action: status,
    };
  }
  const join = { href: "/join/apply", label: "See your application" };
  switch (p.state) {
    case "DRAFT":
      return { heading: "Your application isn’t finished", lead: "You started an athlete application but haven’t sent it yet.", todo: [], after: "Your account opens once it is sent and approved.", action: { ...join, label: "Finish your application" } };
    case "CHANGES_REQUESTED":
      return { heading: "BTG asked for changes", lead: "BTG looked at your athlete application and asked you to change something before it can be approved.", todo: [], action: { ...join, label: "See what to change" } };
    case "REJECTED":
      return { heading: "Your application wasn’t approved", lead: "BTG didn’t approve your athlete application, so no account was opened.", todo: [], after: "Contact BTG support if you think this is a mistake." };
    default:
      return { heading: "Your application is with BTG", lead: "Your athlete application is in, and BTG is checking it.", todo: [], after: "We’ll email you when it is approved. Sign in again then.", action: join };
  }
}
