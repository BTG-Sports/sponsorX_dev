/* --------------------------------------------------------------------------
   POL-FE-43 — the help desk form (the Contact page, and behind the ? in
   every portal). The person picks a topic, ticks the cases that apply and
   sends. The cases are SponsorX's (backend/src/domain/helpdesk-cases.ts):

     GET  /public/support/cases          the eight topics, each with the cases
                                         this person may tick — a visitor the
                                         public ones, signed in their role's
     POST /public/support/messages       {name, email, topic, cases, message?, attachments?}

   The message box stays on the form: optional once a case is ticked,
   needed when nothing is ticked (the form as it always was) or when
   "Something else" is. Pure: shapes, the URL's words, the send rules.
   -------------------------------------------------------------------------- */

export type HelpdeskTopicKey = "ACCOUNT" | "PAYMENT" | "GUARDIANSHIP" | "CAMPAIGNS" | "SHOP" | "REWARDS" | "NEXT" | "OTHER";

export type HelpdeskCase = { id: string; text: string };
export type HelpdeskTopicView = { key: HelpdeskTopicKey; label: string; sections: { title: string | null; cases: HelpdeskCase[] }[] };
export type ApiHelpdesk = { signedIn: boolean; topics: HelpdeskTopicView[] };

/** The eight topics, in the form's order — the words when the cases can't be read. */
export const HELPDESK_TOPICS: readonly { key: HelpdeskTopicKey; label: string }[] = [
  { key: "ACCOUNT", label: "Account" },
  { key: "PAYMENT", label: "Payment" },
  { key: "GUARDIANSHIP", label: "Guardianship" },
  { key: "CAMPAIGNS", label: "Campaigns" },
  { key: "SHOP", label: "Shop" },
  { key: "REWARDS", label: "Rewards" },
  { key: "NEXT", label: "NEXT" },
  { key: "OTHER", label: "Other" },
];

/** "Something else": ticking it makes the message box required. On every topic's list. */
export const OTHER_CASE: HelpdeskCase = { id: "OTH-01", text: "Something else" };

/**
 * ?topic= → a topic. The links already out there (guardian pages, emails)
 * say guardianship / account / payment / other; the new topics work too.
 * Anything else: Guardianship for a visitor (the page's first purpose, a
 * disputed guardianship), Account for someone signed in.
 */
export function helpdeskTopic(raw: string | string[] | undefined, signedIn = false): HelpdeskTopicKey {
  const v = ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim().toUpperCase();
  return HELPDESK_TOPICS.find((t) => t.key === v)?.key ?? (signedIn ? "ACCOUNT" : "GUARDIANSHIP");
}

/** The portals the ? opens the help desk from — where "Back" may return to. */
const PORTAL_ROOTS = ["/admin", "/advisor", "/athlete", "/finance", "/next", "/property", "/sponsor"];

/** ?back= kept only when it is a portal's own page (never another site). */
export function backHref(raw: string | string[] | undefined): string | null {
  const v = ((Array.isArray(raw) ? raw[0] : raw) ?? "").trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  return PORTAL_ROOTS.some((r) => v === r || v.startsWith(`${r}/`)) ? v.slice(0, 200) : null;
}

/** One topic's sections as the form lists them, with "Something else" always last. */
export function topicSections(topics: readonly HelpdeskTopicView[], key: HelpdeskTopicKey): { title: string | null; cases: HelpdeskCase[] }[] {
  const t = topics.find((x) => x.key === key);
  const sections = (t?.sections ?? []).map((s) => ({ ...s, cases: s.cases.filter((c) => c.id !== OTHER_CASE.id) })).filter((s) => s.cases.length > 0);
  return [...sections, { title: null, cases: [OTHER_CASE] }];
}

/** The topic's words, from the API's list or the fallback. */
export function topicLabel(topics: readonly HelpdeskTopicView[], key: HelpdeskTopicKey): string {
  return topics.find((t) => t.key === key)?.label ?? HELPDESK_TOPICS.find((t) => t.key === key)?.label ?? key;
}

/** Whether the message box must be filled: nothing ticked, or "Something else" ticked. */
export function messageRequired(ticked: readonly string[]): boolean {
  return ticked.length === 0 || ticked.includes(OTHER_CASE.id);
}

/** Why Send can't go yet, or null. */
export function sendProblem(f: { name: string; email: string; ticked: readonly string[]; message: string }): string | null {
  if (!f.name.trim()) return "Add your name.";
  if (!/\S+@\S+\.\S+/.test(f.email)) return "Add the email we should reply to.";
  if (messageRequired(f.ticked) && !f.message.trim()) {
    return f.ticked.length ? "You ticked “Something else”: tell us what’s wrong in the message box." : "Tick what’s wrong, or tell us in the message box.";
  }
  return null;
}

/** The message box's label: when it is needed, and when it isn't. */
export function messageLabel(ticked: readonly string[]): string {
  if (ticked.includes(OTHER_CASE.id)) return "Message (needed: tell us what’s wrong)";
  return ticked.length ? "Message (optional)" : "Message";
}
