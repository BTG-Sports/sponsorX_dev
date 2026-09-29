# Check pass — every page, every role (HeckerCreatives, 2026-09-29)

A signed-in Playwright walk against the dev stack, after the server-pagination
work (`P2-FE-02`). The spec was throwaway and has been deleted; the QA student
link it borrowed was restored.

**Roles covered (14 identities plus signed-out):**
- SUPER_ADMIN, BTG_ADMIN, SALES, CAMPAIGN_MGR, NETWORK_MGR, FINANCE
- SPONSOR_ADMIN, SPONSOR_ANALYST
- PROPERTY_MGR
- ATHLETE (adult), ATHLETE (minor with a verified guardian), GUARDIAN
- ADVISOR, STUDENT
- public (signed out)

**Coverage:**
- **195 page visits.** Every route in the app for each role's portal, the
  detail routes with real ids, and the public pages.
- **Per page:** HTTP status; error page; console and page errors; "Demo data"
  or sample-fixture text shown to a live user; other-tenant and other-sponsor
  names; an h1; 390px overflow; redirects.
- **The portal access matrix:** each role against all six portal roots.
- **axe WCAG 2.1 AA on 47 pages,** with animations settled (reduced motion
  plus a 1.5s wait).

## Results

- **Crashes:** 0 error pages, 0 HTTP 5xx and 0 console errors across the 195
  visits. The one 500 in the first run was an API hot-restart; it loaded on the
  re-run.
- **Layout:** 0px horizontal overflow at 390px on every page.
- **Access matrix correct for every role:**
  - admin roles reach /admin;
  - BTG_ADMIN and SUPER_ADMIN also reach /advisor and /next as previews, by
    design (server/portal.ts);
  - each other role reaches only its own portal;
  - signed out, every portal goes to /login.
- **Leaks:** none. SUPER_ADMIN sees another tenant's campaign, which is its
  `any` scope in the policy, while BTG_ADMIN is `own-tenant`. No sponsor saw
  another sponsor's campaign.
- **axe:** 45 of 47 pages have 0 violations (see C-4 for the other two).

## Findings

| # | Sev | Origin | Finding |
|---|---|---|---|
| C-1 | Medium | old | **Staff roles see a sample desk where their role has no live read.** Seen for SALES, CAMPAIGN_MGR, NETWORK_MGR and FINANCE on /admin/applications, /admin/approvals, /admin/finance, /admin/rewards (and /rewards/new), /admin/campaigns/match and /admin/next/{editions,inventory,rights,splits}. The page falls back to the fixture desk (e.g. "Under Armour", "BTG Sports Talk") behind a "Demo data" notice. The notice keeps it honest, but a signed-in FINANCE user shouldn't be shown a sample approvals desk. **Fix:** a "not in your role" state (as /admin/integrations already does), and hide those nav items per role. |
| C-2 | Medium | old (P4-FE-04) | **A GUARDIAN sees the sample invitation inbox with no "Demo data" notice.** /athlete/invitations goes live only for ATHLETE, so a guardian (routed to the athlete portal) gets the fixtures ("Player of the Week") presented unlabelled; the only notice there is about counsel. The home page does show the notice. **Fix:** a guardian state, or at minimum the demo notice. A guardian portal isn't built yet. |
| C-3 | Low | old | **The admin Campaigns list links a detail page that SALES and NETWORK_MGR can't open.** `/campaigns/:id/ops` answers 403 for them, and the page turns that into "This page doesn't exist". **Fix:** "not in your role" instead of not-found, or no link for those roles. |
| C-4 | Low | new (P2-FE-02 brief picker) | **axe colour contrast on /admin/campaigns/match:** the selected brief's count text (`text-faint` on `bg-admin/10`) is 4.14:1, below 4.5:1. **Fix:** `text-muted` in the active row. |
| C-5 | Low | known | **/sponsor/marketplace/SX-03 renders the fixture job detail to a live sponsor, with no notice.** It's only linked from the demo media tab, which is hidden for live sponsors, but it can be reached by URL. **Fix:** a demo notice, or a redirect to the marketplace for live sponsors. |

**Checked and fine:**
- /admin/rewards/new opens the creator on /admin/rewards; that redirect is by
  design.
- A public /properties/no-such-xyz shows not-found (the status is still 200 —
  F-7).
- An unknown /r/token is a 404 fan page, and its console 404 is the page's own
  request.
- Every server-paged list showed its pager top and bottom, with no demo data
  for the role that owns it.

## Part 2 — pagination design (frontend) and the live paging contract (backend)

Signed-in Playwright walk against the house convention (memory
"pagination-pattern"). Bulk seeds were used to force long pagers: 250
campaigns for one sponsor, and 30 property inventory items. The spec was
throwaway and has been deleted, and all seeds were removed.

**Design: every server-paged list with rows matches the convention.**
- **Lists audited:**
  - admin: applications, approvals, campaigns, match (2 lists), finance
    (3 lists), rewards;
  - advisor;
  - sponsor campaigns;
  - athlete: invitations, deliverables, earnings;
  - property (2 lists);
  - NEXT sales (2 lists) and points.
- **The checks:**
  - a pager row **above and below** each list, right-aligned (`justify-end`,
    0px from the right edge);
  - ‹ › arrows, with ‹ disabled on page 1;
  - the 12 / 24 / 60 size menu in both rows, with exactly those options;
  - the top menu opens downward and the bottom menu opens **upward**;
  - "Showing X–Y of Z" in the top row only;
  - the active page tinted in the portal's colour (admin / sponsor / athlete /
    property / next);
  - 0px overflow at 390.
- **Real long pagers seen:**
  - `‹ 1 2 3 4 5 … 22 ›` on admin campaigns (258 rows);
  - `‹ 1 2 3 4 5 … 21 ›` on the sponsor list (250 rows).
- **Interactions on the 250-row sponsor list:**
  - Next → page 2 ("Showing 13–24 of 250");
  - clicking the last page → `‹ 1 … 17 18 19 20 21 ›` ("Showing 241–250");
  - page 10 → `‹ 1 … 9 10 11 … 21 ›`;
  - choosing 60 per page → URL `?size=60`, back to page 1, exactly 60 cards,
    `‹ 1 2 3 4 5 ›`.
- **By design:**
  - the sponsor dashboard's portfolio card has one pager below it (5 per page,
    `… 50` over 250), with no size menu;
  - a list with 0 rows shows its empty state instead of a pager — admin network
    reach and advisor claims had no rows in this data, so their pagers weren't
    exercised with data.

**Backend: 21 paged endpoints called live with real sessions (BTG admin,
sponsor, athlete, property manager, student).** Every one met the contract:
- `page: { page, size, total, pages }`;
- page 1 has `min(12, total)` rows;
- `pages = ceil(total/12)`;
- `?page=99999` clamps to the last page;
- `?size=100000` becomes 100;
- `?page=abc&size=0` becomes page 1 of 12;
- page 2 shares no rows with page 1.

The endpoints: `/campaigns`, `/applications`, `/deliverables`, `/earnings`,
`/earnings/reconciliation`, `/earnings/invoices`, `/rewards`, `/briefs`,
`/briefs/:id/eligible-athletes`, `/operations/delivery-health`, `/students`,
`/claims`, `/invitations`, `/team/athletes`, `/team/inventory`, and
`/students/:id/{sales,points,prospects}`.

- **Summary totals equal the list totals:** campaigns, applications,
  deliverables, rewards, invitations.
- **Legacy (unpaged) mode is unchanged on all 8 list endpoints** that had one:
  each returns 200 with no offset page block.
- **Scope:**
  - the sponsor's `/campaigns` total is exactly its own 250;
  - a sponsor gets 403 on `/earnings/reconciliation`;
  - an athlete's `/applications` returns only their own application.

**Environment note:** the dev Clerk instance hit its **100-user limit** from
today's QA identities (`e2e.*@example.com`). Later walks reused existing
identities. Someone should prune old `e2e.*` users on the dev instance before
the next big QA run.

## Fix pass — C-1 to C-5 (same day)

| # | Status | What changed |
|---|---|---|
| C-1 | **Fixed** | New `lib/admin-access.ts`: one map of which staff roles each desk is for. A signed-in staff role that isn't listed gets `components/not-in-role.tsx` ("Not in your role" — which roles the desk is for, and your roles) instead of the sample desk, on applications, approvals, finance, rewards, the Matching Studio and the four NEXT desks. The admin nav hides desks a role can't use; commission stays BTG-admin only, and `commission-live.test` was updated to the new nav expression. The Operations Board's queue cards no longer link to a desk the role can't open (the count is still shown, "handled by another role"). |
| C-2 | **Fixed** | /athlete/invitations and /athlete/profile carry the "Demo data" notice when a signed-in non-athlete (a guardian, or staff previewing) sees the sample. /athlete/earnings was already live for guardians (ward scope). |
| C-3 | **Fixed** | Admin campaign detail: when the ops read is 403 but the campaign itself is readable, the page shows "Campaign operations aren't in your role", with the campaign name and who the board is for. A campaign that really isn't there is still a not-found. |
| C-4 | **Fixed** | The brief picker's selected-row state text is `text-muted` (axe: 0 violations on /admin/campaigns/match). |
| C-5 | **Fixed** | /sponsor/marketplace/[jobId] shows a "Demo data — sample media-property listing" notice with a link back to the marketplace. |

**Verified:**
- Signed-in re-walk for FINANCE, SALES, NETWORK_MGR, CAMPAIGN_MGR, GUARDIAN,
  SPONSOR_ADMIN and BTG_ADMIN:
  - the nav shows only allowed desks;
  - every denied desk shows "Not in your role", with no samples;
  - every allowed desk is live;
  - the campaign detail shows not-in-role with the campaign name (SALES,
    NETWORK_MGR);
  - the board doesn't link denied desks;
  - guardian samples are labelled;
  - the SX-03 notice shows;
  - the match page has 0 axe violations.
- Frontend vitest 458/458 (a new `admin-access.test.ts`); eslint and tsc clean;
  `npm run build` green.
- Official e2e: 14 passed, 7 skipped, 1 failed. The failure was
  `loop-p3-application`: the join intake hit a moment when the API was
  unreachable ("application service is unreachable"). It passed on an
  immediate re-run (2/2), back to baseline.
