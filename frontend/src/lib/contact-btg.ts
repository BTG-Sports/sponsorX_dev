/* --------------------------------------------------------------------------
   POL-FE-35 — "Contact BTG" as a link, not a phrase. A portal empty state
   that tells a team manager to contact BTG gives them the support address
   (the backend's SUPPORT_EMAIL, read through server/support.ts) as a mailto
   with the subject already filled in. Pure.
   -------------------------------------------------------------------------- */

export type ContactBtgAction = { label: string; href: string };

/** The EmptyState `action` for "contact BTG about …". */
export function contactBtgAction(email: string, subject: string): ContactBtgAction {
  const address = email.trim();
  return {
    label: `Email BTG at ${address}`,
    href: `mailto:${address}?subject=${encodeURIComponent(subject)}`,
  };
}
