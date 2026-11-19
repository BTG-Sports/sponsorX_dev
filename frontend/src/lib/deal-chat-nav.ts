import type { NavItem } from "@/components/portal-nav";

/* --------------------------------------------------------------------------
   2S4-FE-07 / -08 — the Messages link in a portal's sidebar.

   Always shown (owner, 2026-11-19: "always show it"), with the unread count
   on it. It was first shown only to someone with a chat; the owner wanted the
   page findable from day one, so the page's empty state says plainly that
   nothing is here yet, without promising when a chat opens. The round
   Messages button still appears only once there is a chat to open.

   On its own, straight under Dashboard — never inside the Marketplace group
   (owner, 2026-11-19: "don't put the message nav under marketplace"). An
   entry with no group sits on top of the sidebar, above every group
   (lib/nav-groups.ts), the way a messenger keeps its chats one click away.

   The portals' own nav arrays stay as they are (their tests pin them); this
   adds the one entry after the portal's first link.
   -------------------------------------------------------------------------- */

export type ChatPortal = "sponsor" | "athlete" | "property";

export const messagesPath = (portal: ChatPortal) => `/${portal}/messages`;

export function withMessages(nav: NavItem[], portal: ChatPortal): NavItem[] {
  const href = messagesPath(portal);
  if (nav.some((n) => n.href === href)) return nav;
  const item: NavItem = { href, label: "Messages", icon: "chat" };
  /* After the portal's own root (Dashboard); first if a nav ever has none. */
  const at = nav.findIndex((n) => n.href === `/${portal}`);
  return [...nav.slice(0, at + 1), item, ...nav.slice(at + 1)];
}
