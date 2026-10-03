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

**SponsorX NEXT** adds a fifth portal and four public routes
([spec](documentation/SponsorX-NEXT-Integration-Spec.md), policy in
[RBAC Matrix §15](documentation/SponsorX-RBAC-Matrix.md)). Its **screens are
Stage 1 work and startable now** — fixtures only, `P1-ART-08` and
`P1-FE-18`…`P1-FE-30`. Its **models, roles and wiring are Stage 9**, originally
gated behind B8 and an edition actually selling (`P9-PMO-03`).

> **Gate lifted for the build — 2026-09-25, by the programme owner.** The goal
> is to finish *all* backend work, NEXT included, so the Stage 9 models and the
> `STUDENT` / `ADVISOR` roles are now being built ahead of an edition selling.
> Batch A (Publication, Edition, AdSlot, RevenueSplit, EditionEvent —
> `P9-BE-02/03/06/09/12`) landed first; Batch B is the student side (incl.
> `P9-BE-05`, the two roles), Batch C rights and featured athletes. The
> commercial proof `P9-DATA-01` (edition one actually sold) is still open, and
> `P9-PMO-03` stays open as the record of it.

**Status:** in build. The repo is npm workspaces — `frontend/` (Next.js app,
Stage 1 UI on fixtures largely shipped) and `backend/` (Express API + pg-boss
worker + Prisma, scaffolded 2026-09-21, Addendum B). `npm run build` /
`npm test` at the root run both; `npm run docker:up` stands up local infra.

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

## Local setup

**Node 24.21.0 (LTS) and npm 11.x.** Next 16 needs Node 20.9 or newer.

If `node -v` fails, install it **without admin rights** — no Homebrew, no
installer, no password:

```bash
mkdir -p ~/.local && cd ~/.local
curl -sLO https://nodejs.org/dist/v24.21.0/node-v24.21.0-darwin-arm64.tar.xz   # Apple Silicon
tar -xf node-v24.21.0-darwin-arm64.tar.xz && mv node-v24.21.0-darwin-arm64 node
rm node-v24.21.0-darwin-arm64.tar.xz
echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> ~/.zshrc
```

Open a new terminal, then `npm ci` in the repo. Use `node-v24.21.0-darwin-x64`
on an Intel Mac. To undo: delete the `.zshrc` line and `rm -rf ~/.local/node`.

**Verify with `npm run build`, not `npx tsc --noEmit`.** On a fresh checkout the
typechecker reports six phantom `Cannot find name 'LayoutProps'` errors, because
Next generates those types into `.next/types` during the build. Build first,
then typecheck if you want it separately.

**`openpyxl` is deliberately not installed** — see the task-board section below.

## Stack

| Concern | Vendor |
|---|---|
| Web app + API + PDF worker + Postgres + Redis | Railway (one project, private networking; web and API are **two services** — Addendum B) |
| Video, agreements, creative assets | Cloudflare R2 (public CDN and private signed buckets — separate policies; MinIO is the local S3 stand-in) |
| Authentication + MFA | Clerk (identity only) |
| Sales, invoices, payment status | Zoho (CRM + Books) |
| Transactional email | Not yet chosen — Resend / Postmark / SES |

Redis is **cache / rate-limit only** — the job queue stays in Postgres (pg-boss),
Addendum A3/B4. Full rationale, rejected alternatives and revisit triggers:
**[.claude/stack-decision.md](.claude/stack-decision.md)** — read this before
proposing any hosting, database or vendor change. Addendum A reconciles the stack
against Blueprint v2.0; **Addendum B (2026-09-21)** records the split into
`frontend/` + `backend/` workspaces and the standalone Express API.

## The task board

The programme is 345 tasks across the blueprint's four phases. **Three artefacts, three
jobs** — keep them straight or they drift:

| Artefact | Owns | Changes | Who |
|---|---|---|---|
| `documentation/SponsorX-Phase{1..4}-*.md` | The **plan** — every task's definition, plain-English detail, acceptance criteria | Only when scope changes | Anyone, by pull request |
| `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` | The **working tracker** — all four phases consolidated | Continuously, during the day | Every developer |
| Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/) | The **published status** — what the team and stakeholders read | Once a day | Whoever worked that day |

> **The daily rule.** During the day, tag your task **In progress** in the consolidated
> **xlsx**, set `Owner` and `Date Started`, and move it to `Code review` then `Done` as it
> advances. **At end of day — whatever state your tasks are in — update the Google Sheet to
> match.** That is the copy other people read; a task left `Blocked` there when you have
> actually finished it is a teammate idle tomorrow for no reason. Put the task ID
> (e.g. `2S5-BE-04`) in the branch name and commit message.

> **Also append the day's row to `Stage Progress`.** That sheet in the same
> workbook answers "how far are we, and which stage is the wall?" — the
> Dashboard only counts by phase. Its top block is live formulas and needs no
> maintenance; the **snapshot block below it is appended by hand, one row per
> day, as literal numbers**. A formula there would recalculate and the history
> would quietly rewrite itself, which is the one thing a snapshot must not do.
> Claude appends this row as part of closing out the day, like the xlsx and
> the `Memory/` log.

> **Claude updates the xlsx too — it is part of finishing a task, not a handoff.**
> When you complete a task, edit `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`
> yourself in the same pass as the code, the docs and the `memory/` log: set `Status`,
> `Owner`, `Date Started` and `Date Done`, and **add a row** when a task is newly raised.
> Never tell the user the tracker is their step. The **Google Sheet** genuinely is theirs —
> it is the end-of-day published mirror a person updates by hand.
>
> Two things that make this go wrong. **`openpyxl` is not installed** — build a throwaway
> virtualenv in the session scratchpad rather than installing anything globally or into the
> project, and back the workbook up there first. And **inserting a row moves no ranges**:
> the Dashboard's `COUNTIF` / `COUNTA` / `SUMIF` formulas, the autofilter, the
> conditional-formatting ranges and the Status data-validation list all hardcode the last
> row, so each must be extended by hand or the Dashboard silently undercounts forever.
> Use a fractional `Order` (e.g. `24.5`) when inserting, so no existing row needs
> renumbering in anyone else's copy.

> **The Google Sheet cannot be automated — it is mirrored by hand.** The Drive connector is
> metadata-only for content: `update_file` changes a file's title and folder, and
> `create_file` makes a *new* file rather than a new revision, so there is no way to write
> cells in the published Sheet. Do not offer to update it, and do not "solve" this by
> uploading a rival copy — the Sheet's URL is referenced in ten places across this file, the
> four phase documents and the baseline memory, and a second copy fragments a link the team
> already has. Mirror it by hand at end of day, as the daily rule says.
>
> **Copies of the xlsx sitting in Google Drive are snapshots, not the tracker.** Two such
> uploads existed on 2026-09-11 and were renamed with an `ARCHIVE …` prefix to stop them
> being mistaken for the live board. If you find more, treat them the same way: the local
> xlsx is the working tracker, the Sheet is the published one, and a file in Drive is
> neither.

If a task's *definition* is wrong, fix it in the Markdown by pull request — never by quietly
reinterpreting it in the tracker.

### Where the tracker lives — changed 2026-09-14

**The tracker is `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`, and it
IS committed.** So is `Claude outputs/SponsorX-Provisioning-Sequence.xlsx`. This
reverses the earlier "never commit a spreadsheet" rule, deliberately.

**Why it changed.** The old rule said each developer keeps a private copy in
`documentation/` (gitignored) with the Google Sheet as the shared truth. That
does not work, because the Sheet is not reachable from the Drive connector and
is only ever updated by hand at end of day. In practice two developers spent
2026-09-14 updating two different files, neither able to see the other's status:
one had the Zoho and RBAC tasks closed, the other had the whole of Stage 1 at
Code review. Committing one file is what makes a shared tracker actually shared.

**What this means for you.**

- **Edit `Claude outputs/…xlsx` and commit it** with your work, like any other
  file. Do not edit a copy anywhere else.
- **Expect merge conflicts on it.** A binary file cannot be merged by git. If
  you hit one, take the other side's version, re-apply your own rows by hand,
  and commit — do not resolve it by discarding theirs. Keep your edits to the
  rows you own and conflicts stay rare.
- **`documentation/*.xlsx` remains gitignored** and is now **dead**. Two stale
  copies exist as of 2026-09-14 — one in `documentation/`, one at the repo
  root — and neither is the tracker. Do not read status from them. They are
  kept only until someone confirms they can go.
- **The Google Sheet is unchanged**: still the published mirror, still updated
  by hand at end of day, still the copy stakeholders read.

**Phase files:**
[Phase 1 · Managed Marketplace](documentation/SponsorX-Phase1-Managed-Marketplace.md) (207 tasks) ·
[Phase 2 · Marketplace & Commerce](documentation/SponsorX-Phase2-Marketplace-Commerce.md) (123) ·
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
- **One language, two workspaces.** TypeScript everywhere. The repo is npm
  workspaces: `frontend/` (`@sponsorx/frontend`, the Next.js app) and
  `backend/` (`@sponsorx/backend`, the API + worker + Prisma). The Phase 1 API
  (§19) is a **standalone Node.js + Express service** under `backend/src`
  (run with tsx), serving `/api/v1` to the portals and to §8's API Service
  Account on equal terms — deliberately not coupled to the Next.js runtime, so
  the same API serves off-web consumers (mobile, INFINEX §8, partners).
  Contracts stay schema-first (Zod → OpenAPI) because §38 requires a spec.
  Rationale: **Addendum B** in stack-decision.md.
- **Stay host-portable.** The web app is Next.js `output: 'standalone'`; the API
  is a plain Node server. Treat ISR, `next/image` optimization and edge
  middleware as host-specific primitives — adopt deliberately, never by default.
  The fan QR page stays a plain dynamic route. Local dev is one command
  (`npm run docker:up` → Postgres, Redis, MinIO, migrate, worker); the two apps
  run on the host.
- **Authorization is ours.** Clerk authenticates; `tenants`, `roles` and
  `user_roles` in Postgres authorize. Every protected record is tenant-scoped
  (§26), and §30 makes cross-tenant and role tests an acceptance criterion.
- **Uploads go direct to R2** via presigned URLs, never through the app server.
- **Postgres holds** product records, the job queue (Postgres, not Redis —
  Addendum A3/B4) and the audit log. Redis exists but is **cache / rate-limit
  only**; nothing about the queue lives in it.
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
