# SponsorX — the live socket service

`2S4-BE-18` · decided by the programme owner on 2026-11-19 · built by rcfworks.

The socket service runs in its own Railway service, `socketservice`. It is the one place SponsorX
pushes live updates to a browser: Deal Chat now, the INFINEX game later. It replaces the first
version, which ran socket.io inside the API at `/api/v1/socket`.

## 1. Decisions (owner, 2026-11-19)

1. **Its own Railway service.** "We need a solid socket environment because this will not only be
   used in chat, this will be used also for the game."
2. **Its own address, with no "chat" in it:**
   - production `socketservice.sponsorx.net`;
   - staging `socketservice-staging.sponsorx.net`.
3. **Its own connection pipeline, with option B passes.** A person inside the site has already signed
   in. When a chat is open or visible, the API checks access then and there and issues a short pass
   for that one channel. There is no long-lived login token for the socket.

## 2. How it fits together

```
 browser ──(1) POST /api/v1/live-passes ──▶ web server ──▶ API  checks access, signs a pass (private key)
    │                                                         │
    │◀──────────────── { url, path, channel, pass } ──────────┘
    │
    └──(2) WebSocket wss://socketservice.sponsorx.net/ws  { pass } ──▶ socketservice  checks the pass (public key)
                                                                          ▲
 database ──(3) trigger: NOTIFY sx_live, inside the writing transaction   │
    │                                                                     │
    └──▶ API relay (LISTEN) ──(4) POST /internal/publish, private network ┘ ──▶ the channel's browsers
```

- **The socket service knows nothing.** It has no database, no Clerk, no business rules and no
  message text. It checks passes and forwards notices to the channels they name.
- **Events are raised by the database.** Each change a person should see live is a row change, so a
  trigger raises it in the same transaction (migration `20261119120000_live_events`). A notice exists
  only once its change has committed, wherever the change came from:
  - a route;
  - the worker's timed sweep;
  - a payment;
  - BTG's desk;
  - a cancellation.
- **Losing a notice is harmless.** A notice only says "read again". A browser re-reads when it
  (re)connects, and the few-second refresh stays as a fallback.

## 3. The pass (option B)

`POST /api/v1/live-passes` takes `{ kind: "chat", chatId }` or `{ kind: "inbox" }`. The browser asks
only when that chat, or the Messages list, is open or visible.

**What the API checks for a chat pass:**
- the person may read the chat, by the same rule as opening it (a minor's chat is the guardian's);
- the chat has begun and not ended: it is `OPEN`, and its order isn't cancelled, closed or refunded.

The person's side picks the channel: `chat:<id>:sponsor`, `chat:<id>:seller`, or `chat:<id>:btg` for
BTG staff who may read it.

**What the API checks for an inbox pass:** the person's own party has a chat in progress. The
channel is one of:
- `inbox:sponsor:<sponsorId>`;
- `inbox:athlete:<athleteId>` (the athlete, or the guardian acting for them);
- `inbox:property:<propertyId>`;
- `inbox:btg:<tenantId>` (BTG's desk).

**The pass itself:** `v1.<payload>.<signature>`.
- The payload is `{ aud: "socketservice", sub: <userId>, ch: <channel>, iat, exp, jti }`.
- The signature is Ed25519, made with the private key only the API holds.
- It is good for 60 seconds and once.

**What the socket service checks:**
- the signature, with the public key only;
- the audience and the times;
- that the pass hasn't been used before;
- that the browser's origin is one of our own websites.

**When the connection ends:**
- after 15 minutes the service sends `session:renew` and closes, so the browser fetches a fresh pass
  and the API checks access again;
- a login switched off is cut at once;
- a chat that ends takes everyone off its channels.

**Why not a token issued at login:**
- A login token lives for the whole session and opens every chat. A pass opens one channel for 60
  seconds, once.
- With a login token, the socket service would need the database to check each chat. With passes,
  it holds no permissions at all.
- The socket service can check passes but never make them, so even a break-in there forges nothing.

## 4. Connecting

```js
const s = io(pass.url, { path: "/ws", transports: ["websocket"], auth: { pass: pass.pass } });
// another chat on the same connection — a fresh pass for it:
s.emit("join", { pass: other.pass }, (r) => r.ok /* { ok, channel } */);
s.emit("leave", { channel: "chat:<id>:seller" });
```

Each connection joins its pass's channel plus the person's own `user:<userId>`. It holds at most 24
channels. A browser can't publish: anything else it sends is ignored.

## 5. Every event

**To the browser.** Every payload carries `chatId` and `orderId`. None ever carries a message's
words, an answer, an amount or a name.

| Event | Payload extras | Raised when (trigger) | Channels |
|---|---|---|---|
| `chat:opened` | — | a chat is created when the order is placed (`DealChat` insert) | all sides |
| `chat:changed` | `what: "message"` | a message or offer is sent and shown (`DealChatMessage` insert, VISIBLE) | all sides |
| `chat:changed` | `what: "held"` | a message is held for BTG (insert, HELD) | the sender's side and BTG only |
| `chat:changed` | `what: "released"` | BTG releases a held message | all sides |
| `chat:changed` | `what: "kept-back"` | BTG keeps a message back | the sender's side and BTG only |
| `chat:changed` | `what: "reported"` / `"report-cleared"` | a message is reported / the report is cleared | BTG only |
| `chat:changed` | `what: "pick"` | an answer is picked or changed (`DealChatPick`) | all sides |
| `chat:changed` | `what: "offer"` | an offer is accepted, declined or agreed (`DealChatExchange`) | all sides |
| `chat:changed` | `what: "amount"` | a side confirms or types the final amount | all sides |
| `chat:changed` | `what: "read"` | a side reads up to now | all sides |
| `chat:changed` | `what: "warning"` | the last warning before the signing limit | all sides |
| `chat:form` | — | the agreement form goes out (everything green) | all sides |
| `chat:signed` | `by: "sponsor" \| "seller"` | a signature lands (`DealAgreement`) | all sides |
| `chat:order` | `state`, `cancelReason` | the order moves: BTG's decision, payment, the payment window lapsing, the signing limit, any cancellation | all sides of every chat on the order |
| `chat:closed` | `why` | the chat ends: called off, not signed in time, the order ended; everyone leaves its channels | all sides |
| `access:ended` | — | the login is switched off (`User.disabledAt`); the person's connections close | `user:<id>` |
| `session:renew` | — | 15 minutes are up; the browser fetches a new pass and reconnects | that connection |

"All sides" means `chat:<id>:sponsor`, `chat:<id>:seller` and `chat:<id>:btg`, plus the sponsor's,
the seller's and BTG's inbox channels.

**From the browser:**
- `join { pass }` (with an acknowledgement);
- `leave { channel }`.

**Inside the system:**
- Postgres `NOTIFY sx_live` carries the notice as JSON.
- `POST /internal/publish` carries `{ notices: [{ channels, event, data }] }`. It answers only on
  Railway's private host, and only with `SOCKETSERVICE_PUBLISH_SECRET`.

## 6. One instance

- **One service, one process:** the `socketservice` Railway service runs one replica, so there is one
  socket server per environment.
- **One listener in the API:** each API process keeps one listening database connection, and
  production runs one API process.
- **Single-use passes are remembered in memory.** That's correct with one replica. A second replica
  would need a shared store first: Redis, which today is cache and rate-limit only (stack decision
  A3/B4). That's a decision for the owner at that point.

## 7. Settings

All are recorded in [SponsorX-Switches.md](SponsorX-Switches.md).

| Service | Setting | What |
|---|---|---|
| api | `SOCKETSERVICE_PASS_PRIVATE_KEY` | Ed25519 private key (PEM, or the PEM base64 on one line). Signs passes. |
| api | `SOCKETSERVICE_PUBLIC_URL` | `https://socketservice.sponsorx.net` (staging: `https://socketservice-staging.sponsorx.net`), handed to browsers with each pass. |
| api | `SOCKETSERVICE_INTERNAL_URL` | `http://socketservice.railway.internal:<PORT>`: where the relay posts. |
| api, socketservice | `SOCKETSERVICE_PUBLISH_SECRET` | At least 32 random characters; the same on both. |
| socketservice | `SOCKETSERVICE_PASS_PUBLIC_KEY` | The matching Ed25519 public key. |
| socketservice | `SOCKETSERVICE_ALLOWED_ORIGINS` | Comma list of our web origins: staging `https://web-staging-904a.up.railway.app`; production `https://sponsorx.net,https://www.sponsorx.net`. |
| socketservice | `SOCKETSERVICE_SESSION_MINUTES` | Default 15. |

Retired with this change: `DEAL_CHAT_SOCKET` and `API_PUBLIC_URL`.

## 8. Rollout (staging first)

1. Create the `socketservice` Railway service from this repo. Set the root directory to
   `socketservice/`; it uses `socketservice/railway.json`. One replica.
2. Generate a key pair and a publish secret, and set the settings in §7 on api and socketservice.
3. Add the custom domain `socketservice-staging.sponsorx.net` in Railway, and the CNAME Railway gives
   in Cloudflare DNS.
4. Deploy. Check that `/health` answers 200.
5. Walk through it: open one chat as sponsor and athlete in two browsers. A message shows on the other
   side within a second, and a held message reaches BTG and not the other side.
6. Repeat for production with `socketservice.sponsorx.net`.

The web app's side of the connection is `2S4-FE-10` (HeckerCreatives):
- fetch a pass from `POST /live-passes` when a chat or the Messages list is open or visible;
- connect to the pass's `url` and `path`;
- `join` a pass for each further chat;
- handle the events in §5.

## 9. Code

- **The service:** `socketservice/` is a standalone package with its own lockfile.
  - `src/server.ts`: the service;
  - `src/pass.ts`: checking a pass;
  - `tests/`.
- **In the API:**
  - `backend/src/realtime/pass.ts`: signing;
  - `backend/src/realtime/relay.ts`: the relay;
  - `backend/src/domain/live-pass.ts`: the access checks;
  - `backend/src/routes/v1/live-passes.ts`: the route.
- **The triggers:** `backend/prisma/migrations/20261119120000_live_events/migration.sql`.
- **Tests:**
  - `socketservice/tests/socketservice.test.ts`;
  - `backend/tests/live-events.test.ts`.
