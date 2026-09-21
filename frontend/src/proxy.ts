/* --------------------------------------------------------------------------
   Clerk on every request — P2-INT-01, Guide §04.

   **This file is `proxy.ts`, not `middleware.ts`.** Next 16 deprecated the
   `middleware` file convention and renamed it to `proxy`, with the exported
   function renamed to match; the `edge` runtime is not supported under the new
   name and `proxy` always runs on `nodejs`
   (vendored `01-app/03-api-reference/03-file-conventions/proxy.md`). Clerk
   7.9.2 already knows this — its `suggestMiddlewareLocation()` looks for both
   `middleware` and `proxy` when the installed Next is 16 or higher — so
   `clerkMiddleware()` is still the right helper despite the file's name.

   **This file protects nothing.** It attaches Clerk's request context so that
   `auth()` works in server components, and stops there. Route protection lives
   in the layout of each portal, because Clerk deprecated `createRouteMatcher()`
   with the reasoning that "middleware-based auth checks rely on path matching,
   which can diverge from how Next.js routes requests and leave protected
   resources reachable". Resource-based checks are also where §04's
   `requireActor()` belongs, so the two agree.

   The public surface therefore needs no allowlist here: anything without a
   check in its own layout is public, which includes the marketing site and —
   critically — the fan surfaces `/r/[token]` and `/t/[code]`, which §16
   requires to work with no login at all. A fan scanning a QR code at an event
   must never meet a sign-in wall.

   Clerk answers *who is asking*. It never answers *what they may see* — that
   is the Postgres tenant and role lookup, which is why nothing here reads a
   role or a tenant out of a session claim (Addendum A4).
   -------------------------------------------------------------------------- */

import { clerkMiddleware } from "@clerk/nextjs/server";

export const proxy = clerkMiddleware();

export const config = {
  /* Skip Next internals and static assets, then run on everything else. Without
     a matcher the proxy would run on `_next/static` and `public/` too, which is
     how auth logic ends up blocking its own CSS. */
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
