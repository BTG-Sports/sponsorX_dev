"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { DashboardLink } from "@/lib/dashboard-link";
import { myDashboard } from "@/server/my-dashboard";

/* --------------------------------------------------------------------------
   The public site's Login / Get Started, for someone already signed in
   (2026-10-14, P1-ART-27): they become "<Role> Dashboard" and go straight
   to it.

   Clerk decides "still signed in" — an expired session reads as signed out —
   and only then is the server asked which portal (one call per page, shared
   by every button). Until the answer arrives, and for everyone signed out,
   the buttons are exactly as they were, so the static page never waits.
   -------------------------------------------------------------------------- */

/** One question per page and user, however many buttons ask. */
const asked = new Map<string, Promise<DashboardLink | null>>();

export function useMyDashboard(): DashboardLink | null {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [answer, setAnswer] = useState<{ userId: string; link: DashboardLink | null } | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    let live = true;
    let pending = asked.get(userId);
    if (!pending) {
      pending = myDashboard().catch(() => null);
      asked.set(userId, pending);
    }
    pending.then((link) => {
      if (live) setAnswer({ userId, link });
    });
    return () => {
      live = false;
    };
  }, [isLoaded, isSignedIn, userId]);

  /* Signed out since (or a different user): the stale answer is ignored. */
  return isSignedIn && answer?.userId === userId ? answer.link : null;
}

/** A call-to-action link that becomes "<Role> Dashboard" for a signed-in visitor.
 *  `children` is the signed-out label; `icon` follows either label. */
export function DashboardCta({
  href,
  className,
  children,
  icon,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const dashboard = useMyDashboard();
  return (
    <Link href={dashboard?.href ?? href} className={className} data-dashboard={dashboard ? "" : undefined}>
      {dashboard ? dashboard.label : children}
      {icon}
    </Link>
  );
}
