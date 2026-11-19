# 2026-11-19 · tasks completed

## main_development pulled into the frontend checkout (HeckerCreatives)

- **What:** the working checkout was 51 commits behind `origin/main_development` (tip `25c9bedd`, #472) with two days of uncommitted frontend work on top. It is level now. Nothing was committed or pushed.
- **ID collision, settled:** on 2026-11-17 both developers took polish item 107.
  - rcfworks' is merged: item 107, "+ New request" leads to pre-made packages (`POL-BE-107` Done, `POL-FE-107` Ready, HeckerCreatives).
  - HeckerCreatives' was uncommitted: the `/admin/new-signups` redraw. It is **item 109 / `POL-FE-109`** now, in `documentation/polish.md`, the 2026-11-17 log, the tracker and the code comments.
  - Item 108 (`POL-FE-108`, the record pages) was free and keeps its number.
- **Three files had changes on both sides and were merged by hand:**
  - `documentation/polish.md`: rcfworks' items 101–104 and 107, then 108 and 109. Item 106 keeps the later local text (the phone toolbar and the hotfix).
  - `Memory/2026-11-17/tasks-completed.md`: both developers' sections kept. `POL-FE-106` reads Done.
  - The tracker (`Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`), Polish sheet: rcfworks' copy, with the local edits put back.
    - Row 143, `POL-FE-106`: Done, 2026-11-17.
    - Row 154, `POL-FE-108` and row 155, `POL-FE-109`: both Code review, Order 142 and 143.
    - The autofilter, conditional formatting and Status list now end at row 155. The Dashboard counts to row 200, so it needed no change.
    - The Stage Progress row for 2026-11-17 was already there with the same numbers.
- **Checked:** `tsc` clean and 2,430 / 2,430 frontend tests on the merged tree. No line from either side of the two text files is missing, other than the ones replaced on purpose.
- **Still to do on this machine:** `npm ci` (Next 16.4.2 → 16.4.6), then `prisma migrate deploy` and `prisma generate` for the eight new migrations, with the web and API servers stopped.
- **Still uncommitted:** `POL-FE-108`, `POL-FE-109`, the follow-ups to `POL-FE-106` and the re-captured help pictures.

## 2S4-FE-07 / -08 / -09 · Deal Chat on screen (HeckerCreatives) — Code review

- **What:** the frontend for Deal Chat (`documentation/SponsorX-Deal-Chat-Feature.md`), drawn the way a messenger is (owner, 2026-11-19: "make it feel like messenger", not a 1 to 1 copy), on each portal's own stage colours.
- **Screens:**
  - **Messages page**, `/sponsor/messages`, `/athlete/messages`, `/property/messages`: your chats on the left (search; All / Unread / Your turn), the open chat in the middle, the deal on the right (checklist, final amount, agreement, call the deal off). One column at a time on a phone. `?chat=<id>` opens one.
  - **The round Messages button**, bottom-right on every page of the three portals: unread count, your chats, and a chat window that stays put while you move around the page and folds down to a round picture. On a phone it goes to the Messages page.
  - **In the chat:** bubbles; offers as cards with Reply / Accept / Decline; the next question as a card with its answers; the final amount; the agreement card and its dialog (the text, the confirmations to tick, Sign, Download PDF); held and kept-back notes; Report to BTG.
  - **Sponsor's order page:** a Deal chat card per seller (where it stands, Open chat, the agreement's PDF). Every place a sponsor reads an order's state now knows `IN_CHAT` and the two endings `CALLED_OFF` and `NOT_SIGNED`; Pay says it waits for both signatures.
  - **Seller's item card** (athlete and team): Download the agreement.
  - **BTG**, `/admin/deal-chats` (Marketplace group, BTG admins only): Needs a check (held and reported: Release / Keep it back with a reason / Read the chat) and All chats (read-only). The count sits on the nav entry. `/admin/deal-chats/review` (the email's link) lands on the tab.
- **Whole screen, no borders** (owner, 2026-11-19, on seeing the sample): the Messages page fills everything under the portal's header, edge to edge, with no card around it; only the lists inside it scroll. BTG's desk keeps the panel under its title and cards. `data-full` in `deal-chat.css`.
- **The Messages link is always in the sidebar** (owner, 2026-11-19: "always show it"; it was first hidden until someone had a chat). It sits on its own straight under Dashboard, not inside the Marketplace group (owner, the same day). The page's empty state promises nothing about when a chat opens, so it is true with `DEAL_CHAT` on or off. **The round button** still appears only for someone who has at least one chat. BTG staff previewing a portal never get BTG's every-chat list under a sponsor's chrome.
- **Addresses the backend's emails use:** `/sponsor/orders/<id>`, `/athlete/sales/deal-chats/<id>` and `/property/sales/deal-chats/<id>` (both redirect to Messages with the chat open), `/admin/deal-chats/review`.
- **The PDF** goes through a route handler, `/deal-agreements/<id>/download`, which asks the API as the signed-in person. It adds no authority.
- **No sockets** (spec §9): an open chat asks again every 4 seconds while the tab is in front; the list every 20.
- **`?demo=sample`** on the three Messages pages and `/admin/deal-chats`, and `?demo=sample&as=chat` on a sponsor order: four sample chats, one per stage. Nothing is sent, picked or signed.
- **Files:** `frontend/src/lib/deal-chat.ts` (shapes, words, decisions), `deal-chat-sample.ts`, `deal-chat-nav.ts`; `frontend/src/server/deal-chat.ts`, `deal-chat-actions.ts`; `frontend/src/components/deal-chat/*`; the pages above; `frontend/tests/deal-chat.test.ts` (48 tests, its fixtures parsed by the backend's own contract).
- **Checked:** `tsc` clean, eslint clean, 2,478 / 2,478 frontend tests. The sample screens on the running dev server at 1440, 1180 and 390 wide as sponsor, athlete and BTG admin: no console errors, no sideways scroll on the phone.
- **Not checked: real chats.** This machine's database has not had the Deal Chat migrations applied and the Prisma client is the old one (the "still to do" above), so `/deal-chats` answers 500 here and no chat can be opened. Every write (message, pick, offer, accept, amount, sign, call off, release, keep back) is untested against the API. Do the migrations and `prisma generate`, restart the API with `DEAL_CHAT=on`, place an order, and walk it as sponsor, athlete, guardian, team manager and BTG admin before these move to Done.
- **For rcfworks:** `GET /deal-chats` gives a summary with no names and no last message, so the list reads each chat's detail (the newest 30) to draw a row. `sponsorName`, `sellerName` and a last-message preview on `DealChatSummary` would make it one call.
- **Tracker:** Phase 2 rows 149 to 151, Blocked to Code review, HeckerCreatives, started 2026-11-19. The plan's three status lines say the same. No Stage Progress row yet for today.
- **Not built:** help-center articles for Messages (each step needs a captured screenshot), and no `npm run build` (the owner's `next dev` is live in this checkout).

## Deal Chat goes live over a socket (HeckerCreatives, with backend changes) — walked on real chats

- **Why:** owner, 2026-11-19: "add socket on all of the messages functionality". Chosen with the owner: socket.io on the API (over a stream through the web app, or faster polling).
- **How it works:** the API opens a socket on `/api/v1/socket`. It carries one event, `deal-chat:changed`, with a chat id and its order's id and nothing else. Whoever hears it reads the chat again the ordinary way, so no rule about who sees what is repeated on the socket.
- **Who hears:** exactly who could read the chat. A socket's room is its caller's own `whereFor(dealChat, read)`; a change is announced to the rooms built from the chat's row.
- **Between API instances:** Postgres `LISTEN` / `NOTIFY`. Nothing in Redis.
- **Fallback:** with the socket off or down, every screen keeps asking as before (4 seconds for an open chat; 30 with the socket up, as a safety net).
- **Backend (rcfworks' area, touched by HeckerCreatives; please review):**
  - new: `backend/src/realtime/deal-chat-rooms.ts`, `deal-chat-socket.ts`, `backend/tests/deal-chat-socket.test.ts` (7 tests, no database);
  - `config/env.ts`: the `DEAL_CHAT_SOCKET` switch, default off;
  - `index.ts`, `combined.mts`: start it on the API's server, close it on shutdown;
  - `routes/v1/deal-chats.ts`, `deal-agreements.ts`, `marketplace.ts` (placing an order): one `announceDealChat(...)` after each write. No domain file changed.
  - `socket.io` 4.8.4 added to the backend, `socket.io-client` 4.8.4 to the frontend (and to the backend's dev dependencies for the test).
- **Frontend:** `components/deal-chat/deal-socket.ts` (one connection per tab), hooked into the open chat, the list, the round button's number, the order page's Deal chat card and BTG's desk. A small "Live" mark on the Messages page while it is connected.
- **Settings:** `DEAL_CHAT_SOCKET` (API) and `API_PUBLIC_URL` (web service), both in `documentation/SponsorX-Switches.md` and the two `.env.example` files. The feature spec has §8a and decision 15; the stack decision has Addendum E.
- **This machine:** the two dev servers were stopped and restarted (owner's OK). `npm ci`, `prisma generate` (the client was stale; the migrations were already applied), and `DEAL_CHAT=on`, `DEAL_CHAT_SOCKET=on` added to the root `.env`.
- **Walked on real data, two signed-in browsers plus BTG (all passed, no console errors):**
  - order placed (state `IN_CHAT`), the order page's Deal chat card, the round button, the email link's redirect;
  - messages each way: seen by the other side in about 0.2 to 0.3 seconds;
  - every question answered, one differing; an offer, a reply, both accepts; the last answer matched;
  - the final amount confirmed by both; the agreement posted; both signed; the order moved to `AWAITING_PAYMENT` and the order page offers Pay;
  - the agreement's PDF through the web app (200, a real PDF);
  - a message with a phone number: held, not shown to the sponsor, listed on BTG's desk, released, then seen by the sponsor;
  - a report, kept back with a reason, the sender shown the reason;
  - BTG reading a chat (no box to type in);
  - calling the deal off: the other side's open chat window showed it with the reason;
  - the Messages page on a phone: no sideways scroll.
- **Found and fixed by the walk:** on BTG's desk the tab bar's sliding highlight spread over the page and covered the Release button; the bar now sits in the desks' toolbar wrapper.
- **Not walked:** a guardian acting for a minor, a minor's own login, a team manager, a sponsor analyst (no local sign-in fits), and actually paying.
- **Left in the local database:** two QA orders from the walk (`SX-…7B9MJ4OM` called off, the other awaiting payment) and one held message on BTG's desk from the first run.
- **Checked before the push:** `npm run lint` clean in both workspaces; frontend `tsc` clean, 2,481 / 2,481 tests, and `next build` passes; backend `tsc` clean; the secret scan and the dependency audit clean. The whole backend suite on the test database (`sponsorx_test`, never the dev one): 3,959 pass; the 6 that fail are on files this work does not touch and are this Windows machine's (backslash paths, CRLF documents, no `psql`). Two failures the first run found in the new code were fixed: the start-up log line moved to the entry files (the only ones allowed to log plainly), and the test's servers use the house `listen(0, "127.0.0.1")` form.
- **Pushed** straight to `main_development` at the owner's word ("don't do PR"), together with the earlier admin redraw (POL-FE-108, POL-FE-109) that Deal Chat's desk builds on.

## 2S4-BE-18 — the live socket service (rcfworks)

- **Owner's decisions, 2026-11-19:**
  - the socket is its own Railway service, shared by Deal Chat and the INFINEX game;
  - its addresses are `socketservice.sponsorx.net` and `socketservice-staging.sponsorx.net`, with no
    "chat" in the name;
  - it has its own connection pipeline with option B passes: no login token for the socket.
- **Built:**
  - **The service:** `socketservice/`, a standalone package with its own lockfile and
    `railway.json`. It has no database and no Clerk. It checks passes with the public key and
    forwards notices.
  - **The API:**
    - `POST /live-passes`: the access check, plus a 60-second single-use pass for one channel,
      signed with Ed25519;
    - the relay: database `sx_live` notices to the service over the private network.
  - **The triggers** (migration `20261119120000_live_events`) raise every event inside the writing
    transaction: messages, holds, releases, picks, offers, amounts, read markers, the warning, the
    form, signatures, every order move, closing, and logins switched off.
- **Removed:** HeckerCreatives' in-API socket (`backend/src/realtime/deal-chat-*`,
  `DEAL_CHAT_SOCKET`, the `/api/v1/socket` path and their route announce lines). This also fixes the
  gaps found in the audit: the worker sweep, order decisions, payment and the second signature.
- **Tests:** socketservice (10, real sockets) and `backend/tests/live-events.test.ts` (9, real
  database). The full backend suite is 277 files / 3,979 tests.
- **Spec:** `documentation/SponsorX-Socket-Service.md`.
- **Also updated:** Switches, stack decision (Addendum F; E superseded), Deal Chat feature §8a and
  the phase plan.
- **Tracker:** `2S4-BE-18` at Code review. `2S4-FE-10` (HeckerCreatives) at Ready, for the web app's
  side.
- **Left:** the Railway service, keys, settings and Cloudflare DNS, on staging first.

## 2S4-BE-18 rollout, staging (rcfworks)

- **Merged:** #474 into main_development, then the sync #475 into main. The daily deploy follows
  once main's CI is green.
- **Railway staging:**
  - **The service:** `socketservice` created. It's set to the `/socketservice` folder, `npm start`,
    a `/health` check, restart on failure, and one replica in US East. It's created in staging only;
    production has no instance yet.
  - **Settings:** a fresh Ed25519 key pair (private half on api, public half on socketservice), the
    publish secret on both, the allowed origin (the staging web app), and port 4100. The key pair
    and secret were checked to match, without printing them.
  - **The custom domain:** `socketservice-staging.sponsorx.net`.
  - **Lesson:** this Mac's `openssl` (LibreSSL) can't make Ed25519 keys and failed silently, which
    left the first values empty. Generate keys with Node's crypto, and set secrets through the
    Railway API (`variableCollectionUpsert`) from a mode-600 file, then verify lengths.
  - **Lesson:** Railway rejects `railwayConfigFile` now ("Config as Code is deprecated"). The
    service settings are set directly on the instance; `socketservice/railway.json` is kept only as
    a record.
- **Cloudflare (owner approved):**
  - `CNAME socketservice-staging → etrp7ht7.up.railway.app`, DNS only;
  - `TXT _railway-verify.socketservice-staging`.
- **Backend check:** no old socket code is left (`socket.io` inside the API, `deal-chat-socket`,
  `DEAL_CHAT_SOCKET`, `/api/v1/socket` are all gone). Only past-tense mentions remain in the docs.
- **Frontend:** affected, not broken. Nothing is live until `2S4-FE-10`. The task is rewritten
  with the exact files, events and clean-up for HeckerCreatives, and the tracker row matches.
- **Fix tasks for HeckerCreatives:** 2S4-FE-07, 2S4-FE-08 and 2S4-FE-09 (all at Code review) were
  built on the removed in-API socket. Each now has a Fix note in the phase plan and the tracker, and
  depends on `2S4-FE-10`, which must land before they're Done.

## 2S4-BE-18 live on staging and production; Done (rcfworks)

- **Deploy:** #478 merged, main's CI green, `deploy-daily` → release = main = 1ce818ca, on both
  environments.
- **Staging:** `socketservice` was connected to `release`, then deployed. The staging api was
  redeployed so its relay picks up the socket service's private address.
- **Production** (owner: "go ahead with production"):
  - **The service:** `socketservice-production`. Railway won't add a staging-only service to
    production, so it's a separate service, like `Postgres-production`.
  - **Settings and DNS:** its own Ed25519 pair and secret, origins `https://sponsorx.net,https://www.sponsorx.net`,
    and the domain `socketservice.sponsorx.net` (`CNAME → p2zs841y.up.railway.app`, DNS only, plus the
    verification TXT).
  - **Then:** connected to `release`, deployed, and the production api redeployed.
- **Checked on both:**
  - `/health` 200, the domain verified with a valid certificate;
  - the api's private address resolves and the relay is running;
  - a test notice through the database is delivered;
  - the public publish door answers 404;
  - no pass, a forged pass, and foreign origins are refused, and production also refuses the
    staging origin.
- **Tracker:** `2S4-BE-18` Done. `2S4-FE-10` (HeckerCreatives) is what makes the chat actually live in
  browsers. The fix notes are on 2S4-FE-07/08/09.

## End of day (rcfworks)

- **The socket, start to finish:**
  - **Why:** the owner asked why sockets weren't built. I had left them out of the Deal Chat spec
    without asking, which is now a standing rule against doing that (memory
    `never-cut-scope-without-asking`).
  - **Audit:** I audited HeckerCreatives' in-API version.
  - **Decisions (owner):** its own Railway service, `socketservice.sponsorx.net`, option B passes.
  - **Built and live:** 2S4-BE-18 (#474) is live on staging and production, and Done (#479/#480).
- **Deployed:** release = main = 1ce818ca on both environments. That includes the socket service
  code, the database triggers, and HeckerCreatives' Deal Chat screens and POL-FE-108/109.
- **For HeckerCreatives:** `2S4-FE-10` (1.5 days) makes the chat live in browsers. The fix notes
  on 2S4-FE-07/08/09 make them depend on it.
- **Backend board:** no backend task can start. P8-OPS-03 waits on Stripe go-live and P2-INT-02 on
  Clerk Pro; the wallet passes, P9-DATA-01 and Phase 6 are parked.
- **Stage Progress:** rows for 2026-11-18 and 2026-11-19, both at 320 Done. Days left: 15.5 on
  11-18, and 27.5 on 11-19, because the upload audit's 8 NEXT tasks (12 days) joined Phase 1 that day.
- **Restored:** yesterday's Stage Progress row and end-of-day entry never reached main_development.
  The commit landed on the POL-BE-104 branch a minute after #471 merged, so both were added back
  today.
- **Lesson:** don't push to a branch whose pull request may already be merged. Check
  `gh pr view <n> --json state` first, or put end-of-day changes on their own branch.
- **Clean-up:** the test database, toolkits and key files were deleted after use, and no secret is
  on disk.

## Upload audit: SponsorX NEXT and every upload (rcfworks, read-only)
- **Asked by the owner:** NEXT is a magazine, but there's no page to upload photos. Also, check that
  every upload works (photo, video, and so on), since nothing audits that.
- **Written up:** [documentation/SponsorX-Upload-Audit.md](../../documentation/SponsorX-Upload-Audit.md),
  listing all 16 uploads with their screens, file types, size limits, checks and tests.
- **NEXT:**
  - students can upload a JPG, PNG or PDF draft, and sponsors their ad artwork;
  - readers never see a photo or an ad (the public edition is text only);
  - BTG can't upload anything;
  - no cover, no press PDF, no production board, no video;
  - an approved "DESIGN" piece gets a kind that doesn't exist.
- **Elsewhere:**
  - team, school and sponsor logos are saved without checking the file arrived;
  - five uploads are never tested with a real file;
  - CI's browser tests fake the upload step;
  - nothing checks the live storage settings. That gap is what broke every photo and logo upload on
    2026-11-16.
- **Proposed, not on the board yet:**
  - backend `P9-BE-25`…`28` and `POL-BE-108`…`111`;
  - frontend `P9-FE-13`…`16` (HeckerCreatives);
  - open question for the owner: video in the magazine.

## The upload audit's 12 tasks, and P9-BE-25 built (rcfworks)
- **Owner, 2026-11-19:** "1. yes, 2. any format". So the 12 tasks are on the board, and the magazine
  takes any file format.
  - **Phase 1 plan:** `P9-BE-25`…`28`, plus `P9-FE-13`…`16` (HeckerCreatives).
  - **polish.md:** `POL-BE-110`…`113`, in a new group K. Items 108 and 109 were taken, so the audit's
    proposed `POL-BE-108`…`111` became `POL-BE-110`…`113`.
  - **Tracker:** 8 rows on Phase 1 (Order 209.88–209.95) and 4 on Polish (Order 144–147). The
    autofilter, Status list and highlighting ranges are extended. The Dashboard ranges (400 and 200)
    already cover the new rows.
- **`P9-BE-25`, Code review ([#483](https://github.com/BTG-Sports/sponsorX_dev/pull/483)):** any-format uploads for edition content. Up to 2 GB, signed for the
  exact type and size, and checked on save.
  - A piece added by title can be given its file once.
  - Files a browser shouldn't open in place are signed as downloads.
  - Student drafts take any format too. "DESIGN" is now a real content kind.
- **Checks:** full backend suite 279 files, 3,995 tests; lint and backend build clean. Frontend build
  not run: no frontend file changed.
- **For HeckerCreatives:** the student's file picker still allows only JPG, PNG and PDF up to 20 MB.
  Opening it is part of `P9-FE-13`.
- **Test database:** run on the portable Postgres, then stopped and deleted. Disk was down to 252 MB.
  The zonky archive unpacks three 55 MB copies of `libicudata`, so link two of them to the third
  next time.
## POL-FE-102 · the sponsor's Account page (HeckerCreatives) — Code review

- **What:** `/sponsor/account`, "Account details" under the sponsor's Account group: the company's details and the signed-in person's own, on one page (polish.md §102; backend `POL-BE-102`).
- **Layout:** the company on top (logo, name, categories, "Change name or categories", and one notice when a change waits for BTG or was decided); four equal cards with their Edit in a pop-up (Company details, Billing contact, Your details, Sign-in); Notifications.
- **Saved at once:** logo, website, address, billing contact, the person's name and job title. **Checked first:** the company name and categories (in effect at once when the API's checks pass, else "Waiting for BTG" with the reasons).
- **Sign-in is Clerk's:** "Manage sign-in" opens Clerk's own account screen.
- **A Sponsor Viewer** reads the same page with no Edit button.
- **Decision made here: Notifications lists nothing for a sponsor.** Every email kind that can be muted today is an athlete's or a student's, so the section says there is nothing to turn off instead of showing seven switches for emails a sponsor never gets. For rcfworks: if sponsors should be able to mute something (order reminders, say), it needs a mutable event on the backend; `SPONSOR_EMAIL_EVENTS` is the list on the frontend.
- **Checked:** `tsc` and eslint clean; 2,501 / 2,501 frontend tests (20 new). Walked live as a Sponsor Admin, a Sponsor Viewer and BTG; the QA sponsor (`Bluefin Tutoring`) was put back, though its change history keeps the walk's rows (two that took effect, one rejected), so its page shows "BTG didn't approve your change".
- **Seen once, not reproduced:** a React hydration warning in the console on one reload during the walk. Plain loads, reloads with the pointer over the page and opening Clerk's screen were all clean afterwards.
- **Also seen:** the API dev server (`--watch`) restarted several times on its own during two earlier walk attempts, which failed for that reason; it did not recur and no backend file had changed. Cause not found.
- **Tracker:** Polish row `POL-FE-102`, Ready to Code review, HeckerCreatives, started 2026-11-19. Branch `feat/POL-FE-102-sponsor-account`, not committed.

## POL-FE-114 · the sponsor brief as a full-screen wizard (HeckerCreatives) — Code review

- **Why:** owner, 2026-11-19: "big visual redesign for /brief, don't make it look like a ordinary landing page, make this a step by step process wizard that had its own page add an animation + wow factor + awwwaaaard, the current design right now is full of confusing parts, we don't need it, it must be understandable by a human". Logged as polish item 114 (`documentation/polish.md`), which has the full description.
- **What:** `/brief` is its own page now. It moved out of the `(public)` route group to `app/brief`, like `/login`, so the site's header and footer are not on it. The address and its `?package=`, `?new=1` and `?demo=submitted` are unchanged.
- **Six screens, one question each:** Goal, Business, Budget, Where, Contact, Review and send. Each has one thing that must be answered and at most one optional follow-up that opens once it is. The review shows the whole brief on one card with Edit on every part; Send to BTG is only there.
- **Removed as confusing:** the marketing panel, the business-type dropdown (now choices, everyday kinds first), the "Starting package" dropdown (a package picked on the packages page shows as one line with Remove), "Required" as an error, and the timeline on the sent screen that repeated the to-dos.
- **Motion:** in `app/brief/brief.css` and `components/brief-fx.tsx`. Lights that travel per step, a rolling step number, word-by-word headings, choices that light toward the pointer, a review card that leans, confetti on sending. Reduced motion shows it still.
- **Not changed:** the answers, the draft's shape and storage key, the body sent to `POST /public/inquiries`, the proof upload and the status page. No backend change.
- **Decisions made here:**
  - No design round first. The owner's message named the direction, so it was built and walked; the polish entry lists what was chosen.
  - The optional answers were kept (a good result, when to start, who to reach, phone), each as a follow-up marked Optional, not dropped.
  - "When do you want to start?" is four choices now, not free text. A draft holding older free text keeps it and shows it on the review.
  - An email needs a dot after the @.
- **Checked:** 2,513 / 2,513 frontend tests, eslint clean. Walked on the running dev server at 1440, 1180 and 390 wide and with reduced motion: no console errors, no sideways scroll.
- **Not checked:** a real send (the walk stopped at the review so no inquiry or Zoho Lead was made), and `npm run build` (the owner's `next dev` is live). `tsc` shows two errors in the generated `.next/types/validator.ts`, which still names the old route path; a build regenerates it.
- **Found, not fixed (for rcfworks and the owner):** the packages page links to `/brief?package=<the live catalogue's key>` (`TEST_DRIVE`, `COMMUNITY_CAMPAIGN`, `NEXT-AD-FULL` …), but the brief only knows the fixture ids `pk1`…`pk6`. A package picked there has been dropped since the catalogue went live, and BTG's copy says "Package: Not sure yet". Fixing it means resolving the key against `GET /public/catalogue/packages` and keeping the name in the draft, which changes what is sent.
- **Tracker:** Polish row `POL-FE-114`, new, Code review, HeckerCreatives, started 2026-11-19. On branch `feat/POL-FE-102-sponsor-account` with that task's work, not committed.
- **Renumbered the same day:** this was logged as item 110 / `POL-FE-110`. A fetch then showed rcfworks had taken 110 to 113 for the upload audit (#481, #483), so it is 114 in `polish.md`, the tracker, this log and the code comments. Nothing had been pushed under the old number.

## POL-FE-115 · the athlete application on its own page (HeckerCreatives) — Code review

- **Why:** owner, 2026-11-19, after the new `/brief`: "same redesign for /join atheletes the landing page part is good but maybe add a button wherein it would go to the next page for the sign up". Polish item 115 has the full description.
- **What:**
  - **`/join` keeps its landing.** The glass panel beside the hero used to hold the whole form. It now holds a start panel: the list of the ten sections, with one button at the top, **Start application** (or **Resume — section N of M** with **Start over**, or **See your application** once sent). The closing panel's button goes to the same place.
  - **`/join/apply` is the application,** on its own page outside the site's header and footer. One section per screen, the steps down the left from 1024px, **Save and finish later** at the top right. Same sections, fields, guardian step, ticks and submit as before.
- **One frame for both wizards:** `components/focus-wizard.tsx` holds the page around the questions (the ground, top bar, progress line, list of steps, the typed-answer line). `/brief` was moved onto it and walked again. `app/brief/brief.css` takes its colour from one variable: orange for the brief, blue with `data-tone="athlete"`.
- **Also changed:**
  - Answers are kept as they are typed, not only on "Save and continue".
  - Messages name the missing answer ("Add date of birth") in place of "Required".
  - An email needs a dot after the @, for the athlete and the guardian.
  - `/join?demo=minor` and `/join?demo=submitted` are sent on to `/join/apply`.
  - A skeleton in the page's shape while `/join/apply` reads the agreement and the rules wording.
- **Help:** "How do I apply" (`lib/help/athlete.ts`) follows the move, and its pictures were re-captured.
- **Found and fixed on the way:** `scripts/help-shots/capture.mjs` photographed public pages while the boot screen was still up, so that article's one picture had been the loading screen since 2026-11-16. The script now waits for the boot screen to go. Only this article has pictures of public pages.
- **Checked:** 2,524 / 2,524 frontend tests (11 new in `tests/join-apply.test.ts`), tsc and eslint clean. Walked on the running dev server at 1440, 1180 and 390 wide and with reduced motion, both `/join` and `/brief`: no console errors, no sideways scroll.
- **Not checked:** a real submission (the walk stopped with Submit armed, so nothing was filed), and `npm run build` (the owner's `next dev` is live).
- **Tracker:** Polish row `POL-FE-115`, new, Code review, HeckerCreatives, started 2026-11-19. Not committed; on branch `feat/POL-FE-102-sponsor-account` with POL-FE-102 and POL-FE-114.
- **A real submit, before the pull request:** one brief and one application were sent through the new screens against the local API (no Zoho or email keys are set locally, so only the local database was written). Both reached their sent screens; the application showed its reference and the live checklist, and the brief's status page answered. Each button was clicked twice in the same instant and exactly one row was filed (`Inquiry` "QA Walk Cafe mwnbifjg", `Athlete` qa.walk+join-mwnbifjg@example.com; both left in the local database).
- **Merged with upstream for the pull request:** `origin/main_development` was 9 commits ahead and had changed `documentation/polish.md` (items 110 to 113), this log and the tracker. All three were merged by hand: rcfworks' entries first, then these. The tracker is rcfworks' copy with rows `POL-FE-102` (status), `POL-FE-114` and `POL-FE-115` (new) put back.

## P9-BE-25 Done and deployed; P9-BE-26 built (rcfworks)
- **P9-BE-25:**
  - Merged in #483, reached main through #482, and deployed (release 94214a77).
  - The Done PRs are #484 (main_development) and #485 (main).
  - The end-of-day #481 conflict was the tracker. I took main_development's copy and re-added the
    Stage Progress rows. 11-19 is 27.5 days left, because the 8 new NEXT tasks joined that day.
- **Disk:** freed for the owner: the npm cache (1.3 GB), the `frontend/.next` build cache and
  `dev` output (1.5 GB), and five old `.claude/worktrees` that held only installed packages (0.8 GB).
  Free space went from 1.4 GB to 4.9 GB. The Playwright browsers (1 GB) were left.
- **P9-BE-26, Code review:** photos, video and ads in the public reader.
  - The owner chose: remove location data from photos and videos (ffmpeg added to the image), draw
    PDF ads as pictures, and no "who's pictured" field.
  - One rule decides both the worker's copies and the reader's links. A minor's piece needs their
    guardian's right.
  - Copies are queued on publish or cancel, and the 10-minute sweep makes missing ones and takes
    down lapsed ones.
  - No signed read is handed out while ffmpeg is missing.
  - Full suite 281 files, 4,011 tests.
- **P9-BE-27, Code review:** each edition's cover image and press PDF.
  - Both upload to private storage and are checked when recorded. A cover must also open as a
    picture.
  - The press PDF is BTG-only, a recorded read, always a download.
  - Once published, the cover's public copy has no metadata. A replaced cover's copy is retaken.
  - The cover appears in the reader and the public edition list.
  - Full suite 282 files, 4,017 tests.
- **P9-BE-28, Code review:** the production board's data. `GET /editions/{id}/production`, BTG only,
  lists every piece with what it still needs in words.
  - It asks the gate's own questions (`rightsGap`, `artworkGap`), and a test proves the two agree.
  - Full suite 283 files, 4,021 tests.
- **POL-BE-110/111, Code review:**
  - A logo or profile photo is saved only once its file has arrived as the right type and size. A
    wrong file is deleted from the public bucket.
  - Every upload now has a real-file test: dispute documents, the two logos and the photo were
    added, and a completeness check fails if a new upload has none.
  - Full suite 285 files, 4,026 tests.
- **POL-BE-112, Code review:** CI's browser tests now upload for real.
  - A MinIO runs in the e2e job, with staging's upload rule (the test site only). The job checks
    the rule, and the e2e helper refuses to fake the upload in CI.
  - Not runnable on this Mac (no Docker), so CI on the PR is the test.
- **POL-BE-113, Code review:** the live storage check.
  - The worker runs it at start (so after every deploy) and every 24 hours, on both buckets: a
    preflight as the website, a signed upload, a read back, a delete.
  - `/health/full` reports it, so the monitor alerts on Slack. The daily deploy waits for a fresh
    pass.
  - Railway's APP_URL matches each environment's upload rule (staging web URL, sponsorx.net).
  - Full suite 286 files, 4,033 tests.

## Upload audit backend: live on staging and production (rcfworks)
- **Merged:** #486, #488, #489, #490, #492 and #493.
  - #484 was closed; its change came in through #486. #485 (main) is still open.
  - #492's first e2e run failed: MinIO's server image is no longer published. CI now uses the e2e
    store in strict mode (staging's upload rule and R2's signed-link checks). It passed.
- **Promoted:** #494, main_development to main. The tracker conflict was resolved by keeping
  main_development's copy, a checked superset.
- **Deployed** (release 1ed6e196). The new after-deploy step passed on both environments: staging
  checked 11:43:43Z, production 11:43:49Z, both ok.
- **Done:** P9-BE-26, 27 and 28, and POL-BE-110, 111, 112 and 113.
- **Reviewed for the owner:** the athlete campaign order template (`documentation/AthleteCampaignReference/`,
  added 19:27) against the build.
  - The legal terms (CAMPAIGN_ORDER.v2) match.
  - Missing order details: order number, prompt (invited orders), deliverable format and length,
    publish window, structured usage rights, paid media, structured exclusivity, disclosure
    (invited orders), sponsor approval yes/no, non-cash consideration.
  - Waiting on the owner: per-campaign payment timing, and a BTG countersignature. No tasks
    raised yet.

## POL-BE-116: every athlete order follows the order template (rcfworks, Code review)
- **The owner's decisions (2026-11-19):**
  - "whenever a create campaign is called, we have a page to build it right, include the details of
    that form";
  - the video form is the base for other media;
  - payment timing is set per campaign;
  - automation rules, no countersignature.
- **Built:**
  - order details on the brief and the campaign: the template's fields and each job's medium;
  - copied onto offers and orders for each job, fixed when sent;
  - order numbers `SX-<code>-<year>-<n>`;
  - the builder's catalogue and code routes;
  - BTG's PUT, locked after the first offer;
  - automation holds: paid media with no pay stops staffing; a minor with paid media or exclusivity
    is skipped;
  - sponsor approval yes/no now decides review routing;
  - the earning's pay-by follows the payment timing;
  - `CAMPAIGN_ORDER.v3` wording.
- **Dropped on reflection:** a sensitive-category hold. Its brief already waits for a person, and an
  existing test expected an approved alcohol campaign to staff automatically.
- **Checked:** full suite 288 files, 4,052 tests.
- **Frontend:** POL-FE-116 (HeckerCreatives) builds the builder page and the athlete's order view.
