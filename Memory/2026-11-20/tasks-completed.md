# 2026-11-20 · tasks completed

## main_development pulled; every startable frontend task built (HeckerCreatives) — Code review

- **Pulled:** `main_development` at `bffe5856` (43 commits: `POL-BE-116`, the upload audit `P9-BE-25…28` and `POL-BE-110…113`, the CI store). Six new migrations applied locally (`migrate deploy`, `prisma generate`). Branch `feat/POL-FE-103-104-107-116-P9-FE-13-16-2S4-FE-10`.
- **Built, nine tasks, all now Code review:** `POL-FE-103`, `POL-FE-104`, `POL-FE-107`, `POL-FE-116`, `P9-FE-13`, `P9-FE-14`, `P9-FE-15`, `P9-FE-16`, `2S4-FE-10`. What each does, its files and its walk are in `documentation/polish.md` (the four POL items) and below (the rest).
- **Not done: `5S1-FE-02`** (footer links on certified-recruiting.com). It is a GoDaddy site-editor task, not code, and unassigned; it needs whoever holds that login.
- **Checked:** `npm run build` (frontend) clean, with the four new routes; 218 / 218 test files, 2,718 tests; eslint clean apart from one unused-variable warning in a test. Walked live on the local servers at 1280 and 390 wide; no sideways scroll on any new page.

### P9-FE-13 · file picker on the rights page's "Add content"
- Any format up to 2 GB, straight to storage on a signed PUT with progress and Cancel; the piece is saved once the file has arrived; a refusal is shown in the API's words. A new Content list opens each file on a short signed link, or offers "Add its file". The student's draft picker takes any format up to 2 GB too. Every PUT carries the Content-Type the grant answered (`lib/direct-upload.ts`).
- **Walked:** an `.indd` file the browser can't name went to local storage as `application/octet-stream`, was added and listed, and "Open file" downloaded it. A published edition offers no file field, matching the backend's `CONTENT_FINAL_STATES`.

### P9-FE-14 · pictures, video, ads and the cover in the public reader
- `/next/[school]/[edition]`: the cover beside the masthead (above on a phone), each piece's photo or video, each sponsor's ad with its position; any of them null draws the piece as before. Plain `<img>`/`<video>`, lazy, http(s) only. Shapes in `lib/edition-reader.ts`.
- **Walked:** `qa-northside-high/qa_nx_ed_pub` loads at both widths. The local editions hold no pictures, so the pictures themselves were checked by tests only.

### P9-FE-15 · cover and press PDF on the editions page
- Upload and replace both, with a progress bar; the cover previews on a signed link; "Open the press PDF" downloads it by its name; a cancelled edition takes no file.
- **Walked:** a text file named `.png` was refused with "That cover couldn't be opened as a picture, so it was removed."; a real PNG uploaded and its preview loaded; a PDF uploaded and downloaded as `walk-press.pdf`. Put back afterwards.

### P9-FE-16 · the production board
- `/admin/next/production` (BTG admins): Needs you / Waiting on others / Ready / the four gates, tabs, List/Cards, search, edition and kind pickers, all in the URL. Each piece shows its needs in the API's words and one button to where it is fixed (advisor review, the rights row or the Clearance queue, approvals' edition artwork, the editions page's files).
- **Decisions:** not server-paged (the API returns one edition whole); artwork links land on the section, not the exact item; student pieces open in `/advisor/review`, where BTG admins may already review.
- **Walked:** every tab and the loading skeleton at both widths; the rights walk's piece showed "A digital right → Record a right" and the missing cover "Upload".

### 2S4-FE-10 · Deal Chat on the socket service
- `lib/deal-live.ts` holds the rules; `deal-socket.ts` is rewritten on them. Passes come from `POST /live-passes` (the old socket ticket and `/api/v1/socket` are gone, and `API_PUBLIC_URL` is out of `.env.example`). One connection per tab, only while a chat or the Messages list is open and the tab visible; join and leave per chat; `chat:*` events re-read; `session:renew` reconnects; `access:ended` stops; 503 / 409 / 403 and an unreachable service fall back to the existing refresh.
- **Decision:** the Messages button follows the inbox on every portal page (the plan's item 3), so its count is live; the stricter reading ("nothing connects unless the list is open") is a one-line change in `chat-dock.tsx`.
- **Also:** `frontend/next.config.ts` content security policy (report-only) now names `wss://socketservice.sponsorx.net` and `wss://socketservice-staging.sponsorx.net`.
- **Not checkable locally:** the staging criteria (a message on the other side within a second; a held message reaching BTG only). Locally the API answers 503 ("Live updates aren't switched on here"), so the walk saw only the fallback.

### For rcfworks / the owner
- **Every 503 from `POST /live-passes` is logged as an `[error …]` line by the API** — one per portal page load while live updates are off. Expected behaviour, noisy log.
- **BTG has no editor for a campaign's order** (`PUT /campaigns/{id}/order-details` exists; no task covers its screen).
- **The local Docker worker image is from 2026-11-16**, older than this week's backend; brief approval and anything the worker does may lag the code until it is rebuilt.
- **Tracker:** the nine rows set to Code review, HeckerCreatives, started 2026-11-20. `POL-FE-102`, `114` and `115` moved to Done (2026-11-19): merged by #487 and on `main` / `release`.
