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
