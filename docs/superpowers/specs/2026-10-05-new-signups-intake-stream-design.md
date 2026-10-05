# New sign-ups — "Intake Stream" redesign, server-paged (P1-ART-15)

**Date:** 2026-10-05 · **Raised by:** programme owner · **Scope:** `/admin/new-signups`
(2S1-FE-07) only; its detail pages (`athletes/[id]`, `guardians/[id]`) and
`/rules` are unchanged.

## Goal

Redraw New sign-ups on the Mission Control stage introduced for `/admin`
(P1-ART-14), and make every list on it server-paged by the house rule
(memory "pagination-pattern": 12 / 24 / 60, default 12; pager above and
below; range in the top row; URL-driven; page, size, search and filters run
in the database; counts from a summary, never from visible rows).

Approved layout: **A · Intake Stream** (mockup
`.superpowers/brainstorm/6370-1791187301/content/signups-layout.html`).

## Page

Fixed-dark stage, full bleed, the `.sx-ops` ground and entrance, no outlined word.

1. **Header** — a dashboard header, not a hero (owner, 2026-10-05: "this
   is a dashboard not a landing page, so clear the hero style"; the first
   cut's 60px headline, dek and outlined INTAKE word are gone): title row
   (live dot, `New sign-ups`, Postgres pill, "Sign-up rules →"), then four
   glass tiles — Needs review (held), Approved automatically (with an auto /
   total share bar), On the desk (total), By kind (the four totals, held
   marked). Every figure from the summary read.
2. **Filter bar**: kind chips (All · Organizations · Athletes · Guardians ·
   Sponsors) with totals; an orange "Needs review" toggle that combines with
   the kind; a search box (debounced, `ListSearch`). Instant, URL-driven
   (`kind`, `review=1`, `q`), every change resets to page 1.
3. **Stream**: one paged list, newest first. Row: chamfered kind badge
   (AT / GU / OR / SP), name + sub line, signed-up day, status light + label,
   reason/checks line, Open → (Review → on held rows, filled). Held rows
   carry an orange edge and wash. Empty and unreadable states keep today's
   words. Pager rows above and below (`PagerRow`), styled for the stage.
4. **Sensitive profile edits**: own glass panel under the stream, paged with
   keys `epage` / `esize` (was a fixed 25). Shown with kind All or Athletes,
   or the review toggle, as today.

Legacy `?tab=` (emails link `?tab=review`): `review` → `review=1`; `org`,
`ath`, `gua`, `spo` → that kind; `all` → nothing.

## Backend

`GET /api/v1/signups/stream?page&size&kind&review&q` and
`GET /api/v1/signups/stream/summary`, in a new `domain/signups-stream.ts`.

Six sources, each a Prisma query under `whereFor` with ONE real sort column:

| Source | Model | Base where (today's desk rules) | Date |
|---|---|---|---|
| athlete | Athlete | `listSignups`' athlete where | `createdAt` |
| guardian-verified | Guardian | `verifiedAt ≠ null` | `verifiedAt` |
| guardian-rejected | Guardian | `verifiedAt = null, rejectedAt ≠ null` | `rejectedAt` |
| sponsor-approved | Inquiry | `state = APPROVED` | `decidedAt` |
| sponsor-held | Inquiry | `state = NEW`, `reviewReasons` not empty | `createdAt` |
| organization | PropertyOnboarding | state in PENDING_REVIEW, APPROVED, SUSPENDED, REJECTED | `submittedAt` |

Needs-review, as a where per source (matching today's row rules):
athlete: (`reviewReasons` not empty ∧ state in SUBMITTED/UNDER_REVIEW ∧
`signupRejectedAt` null) ∨ `majorityKnown` false · guardian: never ·
sponsor-held: always · sponsor-approved: never · organization: state ≠
REJECTED ∧ (state in PENDING_REVIEW/SUSPENDED ∨ `flags` not empty).

Search `q` (case-insensitive contains): athlete legalName, displayName,
school, sport, email; guardian legalName, email; inquiry companyName,
firstName, lastName, email; organization orgName.

Paging: for page *p* of size *s*, count every selected source (the total),
clamp the page, read `id` + date of the top `p × s` of each source, merge by
date desc (ties by kind, then id), slice `[(p−1)s, ps)`, then load just those
ids with the existing row builders (`athleteRow`, guardian row, sponsor
`summary`, org `signupRow`, all exported). Response `{ rows, page }`; each
row `{ kind, id, name, sub, signedUpAt, state, reasons, autoApproved }`.

Summary: per kind `{ total, held, auto }` and overall `{ total, held, auto }`,
from counts under the same wheres.

Permissions: the union of today's: `assertTenantWide` on athleteApplication
approve and guardian write (as `listSignups`); sponsor and organization
sources are included only if `can(actor, "inquiry"/"propertyOnboarding",
"read")`, so a role sees no more than it does today. The old `/signups`,
`/sponsor-requests` and `/onboarding/signups` stay for their other callers.

## Frontend

- `app/(app)/admin/new-signups/page.tsx`: reads stream + summary + (when
  shown) profile edits; renders the stage.
- `components/intake-stage.tsx` (server): hero, filter bar shell, stream rows,
  edits panel. Client pieces reuse `server-pager.tsx` (`ServerList`,
  `PagerRow`, `ListSearch`) and a small `intake-fx.tsx` for the chips/toggle.
- `lib/new-signups-live.ts`: `streamQuery(searchParams)` (incl. legacy tab
  mapping) and row view words, unit-tested.
- `components/sensitive-edits-section.tsx`: paged by `epage`/`esize`, stage
  styled.

## Verification

Backend: domain tests for the merge (boundaries across sources, filters,
search, counts = totals, clamping) and a route test incl. a second tenant;
`tenant-scope.static` green. Frontend: unit tests for query mapping; build in
a detached worktree (then the rimraf check); browser walk as BTG_ADMIN in
dark, light, 1440 and 390, paging through and filtering.
