# SponsorX (BTG) — Phase 1

Athlete sponsorship platform. Sponsors buy sponsorship packages, athletes
deliver on them, fans redeem at events via QR.

Phase 1 is a **managed** marketplace: sponsors browse and submit briefs, BTG
staff does matching, pricing, conflict checks and invoicing. No self-service
checkout — that is Phase 2.

**Surfaces:** marketing site; the 12 core screens (§9); portals for sponsor,
athlete and property (§8); four BTG admin workspaces — Admin, Athlete Network
Manager, Finance, Content Approval (§10, §23); guardian / authorized-rep access
for minors (§4); and a public fan QR page with no login (§16).

**Status:** greenfield — no application code yet. No build/test commands exist.

## Always use graphify

This repo has a persistent knowledge graph in [graphify-out/](graphify-out/).
**Always use graphify first** for any question about the codebase, its
architecture, file relationships, or project content — treat the request as a
graphify query before reaching for grep/read/manual exploration. Invoke the
`graphify` skill (or `/graphify`) at the start of such tasks and let its
query/path/explain tools drive discovery; fall back to direct file tools only
when graphify can't answer. Re-run graphify ingestion after material changes so
the graph stays current.

## Sync with the team via `memory/`

The [memory/](memory/) folder is the shared, in-repo record other developers
update — often daily. **Read it at the start of each session** to stay in sync:
`memory/Initial Memory/` is the baseline snapshot (project, stack, rules,
decisions), and each `memory/YYYY-MM-DD/` subfolder logs that day's work.
After completing any task, append to today's dated subfolder (create it first
if missing) and update the baseline only when foundational facts change.

## Stack

| Concern | Vendor |
|---|---|
| App + API + PDF worker + Postgres | Railway (one project, private networking) |
| Video, agreements, creative assets | Cloudflare R2 (public CDN and private signed buckets — separate policies) |
| Authentication + MFA | Clerk (identity only) |
| Sales, invoices, payment status | Zoho (CRM + Books) |
| Transactional email | Not yet chosen — Resend / Postmark / SES |

Full rationale, rejected alternatives and revisit triggers:
**[.claude/stack-decision.md](.claude/stack-decision.md)** — read this before
proposing any hosting, database or vendor change. Addendum A there reconciles
the stack against Blueprint v2.0 and records what §27's open choices resolved
to, and why.

## The task board

The programme is 344 tasks across the blueprint's four phases. **Three artefacts, three
jobs** — keep them straight or they drift:

| Artefact | Owns | Changes | Who |
|---|---|---|---|
| `documentation/SponsorX-Phase{1..4}-*.md` | The **plan** — every task's definition, plain-English detail, acceptance criteria | Only when scope changes | Anyone, by pull request |
| `documentation/SponsorX-Full-Programme-Task-Board.xlsx` | The **working tracker** — all four phases consolidated | Continuously, during the day | Every developer |
| Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/) | The **published status** — what the team and stakeholders read | Once a day | Whoever worked that day |

> **The daily rule.** During the day, tag your task **In progress** in the consolidated
> **xlsx**, set `Owner` and `Date Started`, and move it to `Code review` then `Done` as it
> advances. **At end of day — whatever state your tasks are in — update the Google Sheet to
> match.** That is the copy other people read; a task left `Blocked` there when you have
> actually finished it is a teammate idle tomorrow for no reason. Put the task ID
> (e.g. `2S5-BE-04`) in the branch name and commit message.

If a task's *definition* is wrong, fix it in the Markdown by pull request — never by quietly
reinterpreting it in the tracker.

**Never commit a spreadsheet** — `documentation/*.xlsx` is gitignored. Each developer keeps
their own working copy; the Sheet is the shared truth.

**Phase files:**
[Phase 1 · Managed Marketplace](documentation/SponsorX-Phase1-Managed-Marketplace.md) (184 tasks) ·
[Phase 2 · Marketplace & Commerce](documentation/SponsorX-Phase2-Marketplace-Commerce.md) (64) ·
[Phase 3 · Intelligence & Attribution](documentation/SponsorX-Phase3-Intelligence-Attribution.md) (44) ·
[Phase 4 · INFINEX Integration](documentation/SponsorX-Phase4-INFINEX-Integration.md) (51)

## Architecture rules

- **The Zoho boundary.** Zoho knows who we're selling to and whether they've
  paid. SponsorX knows what was promised, who's delivering it and whether it
  worked. Keep Zoho, don't build on Zoho.
- **Zoho never touches a request path.** Outbound exchanges go through the
  worker, queued. Inbound Zoho webhooks land in the queue too — §18 makes
  Accounts, Contacts, Deals and Tasks bi-directional. If Zoho is down, sponsors
  still browse, athletes still accept orders, fans still redeem — syncs wait.
- **One language, one service.** TypeScript everywhere. The Phase 1 API (§19)
  is Next.js route handlers under `/api/v1`, consumed by the portals and by
  §8's API Service Account on equal terms. Contracts are schema-first (Zod →
  OpenAPI) because §38 requires a spec.
- **Stay host-portable.** Next.js `output: 'standalone'`. Treat ISR,
  `next/image` optimization and edge middleware as host-specific primitives —
  adopt deliberately, never by default. The fan QR page stays a plain dynamic
  route.
- **Authorization is ours.** Clerk authenticates; `tenants`, `roles` and
  `user_roles` in Postgres authorize. Every protected record is tenant-scoped
  (§26), and §30 makes cross-tenant and role tests an acceptance criterion.
- **Uploads go direct to R2** via presigned URLs, never through the app server.
- **Postgres holds** product records, the job queue (Postgres, not Redis —
  Addendum A3) and the audit log.
- **Postgres does not hold** passwords (Clerk), files (R2), invoices (Zoho),
  bank details (nowhere — forbidden by §26), or tax IDs (not collected in
  Phase 1 — Addendum A6).

## Open decisions — do not code around these silently

- **Phase 1 payment policy.** Must be written before coding starts (§37 gate
  one). Expected: earnings *status* tracking only, no tax ID collected. Flag it
  if a task would store one.
- **Data residency.** Likely US-only; confirm, then set Railway and R2 regions
  explicitly.
- **Guardian e-signature for minors.** Click-wrap covers Phase 1 agreements;
  guardian authorization may need true e-sign. Legal question, not technical.
- **Transactional email provider.** Pick when the first notification is built.
- **Does the PDF worker have a real requirement?** It appears nowhere in the
  blueprint's 39 sections, yet it shaped the hosting architecture.

## Scope reality

§31 staffs Phase 1 at 4.5-7.5 FTE over 14-18 weeks. This team is two people.
The stack is not the binding constraint — scope is. When scope must give, §39
names what to protect:

> athlete application → approval → NIL job/rate → sponsor brief → matching →
> invitation → Campaign Order → deliverable → tracking/reward → earnings →
> sponsor report

Cut from the self-service ecommerce end, never from that loop.

## Documentation

- `.claude/stack-decision.md` — current stack decision plus Addendum A
  (blueprint reconciliation); supersedes the PDF's hosting section
- `documentation/SponsorX-Stack-Summary.pdf` — original Phase 1 summary;
  hosting section is now out of date
- **Master Development Blueprint v2.0** — **not in this repo**; all `§`
  references point into it. Readable through the Google Drive connector: file
  `1JBuVYW8ahkUZ7q1tNZ4AQkKjeG5mFqjZ`
  (`Updated_BTG_SponsorX_Master_Development_Blueprint_Integrated_Athlete_Network.docx`)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
