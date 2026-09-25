# `P3-FE-02` — the admin review queue, wired (HeckerCreatives)

*Code review. The second Block B substitution, following /join's pattern: the
fixture demo stays for visitors and ?demo= states; a signed-in BTG reviewer
gets the truth.*

`/admin/applications` now renders the real queue. `liveQueue()` follows the
marketplace precedent exactly — `fetchActor()` unswallowed (an API outage is
an error page, never fixtures dressed as the queue), roles checked against the
three the matrix gives `athleteApplication.approve`, and
`GET /applications?limit=100` mapped through a **pure, tested translation**
(`lib/applications-live.ts`, 25 new tests): guardian status → the desk's minor
semantics, backend factor keys → reviewer labels, and *nothing invented* —
live rows carry no followers, no conflict flags and no profile slug, because
the API answers none of those (§22).

## The backend half: the snapshot rides the queue row

`P3-BE-10` stored the §14 score with its factors, but no endpoint exposed it —
the acceptance's "score factor snapshot renders" had nothing to render from.
`GET /applications` (list and detail) now carries the **latest snapshot,
factors and all**, in the same select: the drawer is the §23 review surface
and a second request per opened row would reread the same table for nothing.
Safe for every role that can reach the router — §7's `athleteScore.value`
denial names only sponsor/property roles, which have no `athleteApplication`
cell. Three route tests pin it: latest-only (`take: 1` desc), the whole
breakdown not just the number, and **null for an unscored athlete — never
zero, which would be an assessment** (§14's rule, surfaced twice in UI: a
dashed "—" ring on rows, a "Not scored yet" panel in the drawer, and a
partial-score warning when `assessedGapPercent > 0`).

## Live decisions are the real §21 machine

The drawer's live decision bar renders the state machine honestly instead of
imitating it:

- **SUBMITTED shows one button: "Start review"** — §21 only permits decisions
  out of UNDER_REVIEW, so the claim step is a visible action, not something a
  decision button does silently. Its copy says why (two reviewers cannot
  decide the same application twice).
- **Notes are a first-class input.** The API refuses request-changes and
  reject without reviewer notes (they are sent to the athlete verbatim); the
  buttons disable with the reason before the API has to say it. Approve takes
  notes optionally.
- **Reject arms before it fires** — first click flips to "Confirm reject —
  final"; REJECTED is terminal.
- **A minor's unverified guardian warns but does not block approve** — the
  fixture demo blocked it, the backend truth is that §37 gates *activation*,
  not approval. The demo keeps its old behaviour; live tells the truth.
- Errors come back as values through `reviewAction` (409 already-decided,
  422 notes, 403) and render in the drawer; only transport failures throw.

Live state overrides live in their own map, deliberately not the demo's
undoable `decisions` — a real transition must never appear to Undo.

In live mode the hero drops the fixture funnel and review-pace stats (no
endpoint answers them yet) and shows only derived-from-rows numbers.

## Proof — a signed-in headless walk, 24 checks

Clerk's device-verification step blocks password sign-in headlessly; the walk
signs in with a one-shot **sign-in token** (`clerk.signInTokens`) consumed by
the widget via `?__clerk_ticket=`. Worth remembering for every future
auth-gated E2E.

Against the local stack (docker PG + API + next dev), as a seeded BTG_ADMIN:
real athletes render (fixture names absent), the scored row shows its ring and
the full factor list with "not assessed" and the 5% gap note, the
missing-guardian danger row renders, begin-review unlocks decisions,
request-changes/approve/reject all landed (each queued its `notify.email`
outbox row), notes gating held, reject armed, **and a reload proved every
state came back from Postgres** — CHANGES_REQUESTED under "Info requested" in
the review tab, APPROVED and REJECTED in theirs. Zero console errors. Mobile:
0px overflow at 390/768, drawer verified settled (an early screenshot caught
the slide-in mid-animation looking broken — it wasn't; wait for animationend
before eyeballing).

One walk expectation was wrong, not the app: the hero counts what waits on
the DESK (SUBMITTED/UNDER_REVIEW), so a CHANGES_REQUESTED row correctly
drops out of "waiting".

## State

Backend 1184 passed (mocked suites; DB suites green earlier this session),
frontend **135/135** (25 new), lint clean, root build exit 0 checked bare
with the dev server stopped. Board: `P3-FE-02` → Code review
(HeckerCreatives, started and done 2026-09-25). Google Sheet mirror still by
hand at EOD. Dev DB note: the four E2E athletes now sit in decided states
(one CHANGES_REQUESTED, one APPROVED, one REJECTED, one SUBMITTED) — real
decisions from the walk, fine to leave or reset locally.
