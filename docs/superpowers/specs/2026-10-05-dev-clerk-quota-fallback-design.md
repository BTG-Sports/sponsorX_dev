# Dev Clerk-quota fallback — design

**Date:** 2026-10-05 · **Scope:** local development only · **Approach:** A (free a slot + one-time login link)

## Problem

The development Clerk instance caps at 100 users and is full: 92 Playwright
`e2e.*@example.com` leftovers, 7 `qa.*` walk users, one real account. A seeded
walkthrough persona (`btg.admin+clerk_test@example.com` etc.) has a `User` row
but no Clerk identity until its first sign-in. That first sign-in is a Clerk
sign-up, and the quota rejects it. Clerk's `<SignIn>` then shows the misleading
"This verification has already been verified" message, and the developer is stuck.

## Goal

On `/login` in local development, when the quota is reached:

1. Show a notice: *Clerk dev quota reached (100/100). New sign-ups will fail.*
2. Offer the seeded walkthrough personas as one-click logins that skip email
   verification and land on the persona's dashboard.
3. Make room on demand by deleting the oldest disposable `e2e.*` Clerk user,
   only when the chosen persona has no Clerk user yet.

Non-goals: staging/production, arbitrary emails, any change to the auth path
(`requireActor`, `resolveActor`, `fetchActor`, `proxy.ts`).

## Design

### Backend — `backend/src/routes/v1/dev-login.ts` (new)

Mounted at `/api/v1/dev/quick-login` **only when** `env.NODE_ENV === "development"`
and `env.CLERK_SECRET_KEY` starts with `sk_test_`. Outside that, the router is
never mounted, so the path 404s. Each handler also rejects non-loopback callers
(`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) with 404, because the frontend calls it
server-to-server on the same machine.

- `GET /api/v1/dev/quick-login` returns
  `{ used, limit, full, personas: [{ email, who, story, hasClerkUser }] }`.
  - `used` comes from Clerk `GET /users/count`.
  - `limit` comes from the new optional env `CLERK_DEV_USER_LIMIT`, default 100. Clerk doesn't expose the cap.
  - `personas` is `PERSONAS` from `worker/jobs/seed-personas.mts`.
- `POST /api/v1/dev/quick-login { email }` returns `{ ticket, freed?: string }`.
  1. Reject (400) any email that is not in `PERSONAS`. This allowlist is the only
     way to pick a user, so no other account (qa.*, a real person) can be minted.
  2. Find the persona's Clerk user by email. If missing:
     - If `used >= limit`, pick a victim with `pickRecyclable(users)` and delete it.
     - Create the user: `POST /users { email_address: [email], skip_password_requirement: true }`.
       Users created through the Backend API have verified emails, so no OTP step.
  3. `POST /sign_in_tokens { user_id, expires_in_seconds: 300 }` and return the token.

`pickRecyclable` is a pure function in `backend/src/dev/recycle.ts`:
- Considers only emails matching `^e2e[._].*@example\.com$`.
- Orders by `last_sign_in_at`, nulls first, then oldest `created_at`.
- Returns the first match, or `null`. If it returns `null`, respond 409:
  *"No disposable e2e users left. Free a slot in the Clerk dashboard."*

Linking to Postgres needs no new code. The persona's `User` row holds a
placeholder `clerkId` (`seed:…`), or a stale id if the persona was recreated.
`resolveActor` claims the row by verified email on the first `/me`. A deleted
`e2e` user's row keeps a stale `clerkId`, and `e2e/support/auth.ts`
`provision()` already rebinds it on the next run.

### Frontend

- `frontend/src/app/login/page.tsx` becomes `async`. Only when
  `process.env.NODE_ENV === "development"` does it fetch the GET endpoint
  (`API_URL`, `no-store`, any failure means render nothing). It renders
  `<DevQuotaFallback>` above `<SignIn>` inside `SignInPanel` only when `full`.
- `frontend/src/components/dev-quota-fallback.tsx` (new) is a small client island.
  - It shows a warning-toned notice with the `used/limit` figure, then personas
    grouped by story (BTG / Marketplace / NEXT).
  - Each persona is a button with a pending state, plus a hint: "ready" (has a
    Clerk user) or "frees an e2e slot".
  - Inline error text when the action fails.
  - House glass styling, matching the panel.
- `frontend/src/app/login/dev-actions.ts` (new) holds the server action `devQuickLogin(email)`.
  - It refuses unless `NODE_ENV === "development"`, then POSTs to the backend.
  - On success it calls `redirect("/login?__clerk_ticket=" + token)`. Clerk's
    `<SignIn>` consumes the ticket, as `e2e/support/auth.ts` already relies on,
    then `forceRedirectUrl="/portal"` routes to the persona's workspace.
  - On failure it returns `{ error }`.

### Errors

| Case | Result |
|---|---|
| Not development, or not an `sk_test_` key | Route not mounted (404); the frontend renders nothing |
| Non-loopback caller | 404 |
| Email not a persona | 400 |
| No `e2e.*` user to recycle | 409 with the dashboard message, shown inline |
| Clerk API error | 502 with Clerk's message, shown inline |
| Persona `User` row missing (worker seed not run) | Lands on `/portal`'s existing "account isn't set up" screen |

## Testing

- `backend/tests/dev-recycle.test.ts`: `pickRecyclable`.
  - Picks only e2e addresses.
  - Puts never-signed-in users first, then the oldest.
  - Returns null when none qualify.
  - Never picks `qa.*`, `+clerk_test`, or other addresses.
- `backend/tests/dev-login.route.test.ts`, with the Clerk client mocked:
  - Not mounted outside development or with a non-`sk_test_` key.
  - Rejects non-loopback callers.
  - Rejects non-persona emails.
  - An existing persona user means no delete.
  - A missing user when full means delete one e2e user, then create, then return the ticket.
  - A missing user with no e2e users left returns 409.
- `authz.coverage.test.ts`: register the dev route as deliberately unauthenticated
  if the coverage test requires it.
- Manual walk: with the quota full, open `/login`, choose BTG admin, and land on `/admin`.

## Bookkeeping

New tracker row next to `P0-OPS-03` (Clerk dev instance), a fractional `Order`,
plus a `Memory/2026-10-05/` log entry and an update to the `clerk-dev-user-cap` memory.
