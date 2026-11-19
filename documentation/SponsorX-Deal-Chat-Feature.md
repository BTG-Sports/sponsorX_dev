# SponsorX — Deal Chat

**A feature of Phase 2, Sprint 4 (Cart, reservations & orders).** Tasks
`2S4-BE-14` … `2S4-BE-17` (backend, rcfworks) and `2S4-FE-07` … `2S4-FE-09`
(frontend, HeckerCreatives), defined in
[Phase 2](SponsorX-Phase2-Marketplace-Commerce.md#sprint-4--cart-reservations--orders).

Raised and decided by the programme owner on 2026-11-17, reviewing the sponsor
order page on staging (`/sponsor/orders/:id`).

---

## 1. The problem

When a sponsor buys an athlete's service today:

- **The sponsor only agrees with BTG.** At checkout they accept BTG's
  Marketplace Order Terms. Nothing is agreed between the sponsor and the
  athlete.
- **The athlete is usually not asked.** Only a listing set to "ask for
  approval" waits for the athlete (`2S4-BE-09`), and even then it is a yes / no
  click, not an agreement. Every other order goes straight to the Pay button.
- **They cannot talk.** There is no messaging between a sponsor and an athlete
  anywhere in SponsorX.

So a sponsor can pay for a deal whose details (how the content may be used,
for how long, exclusivity, approvals) were never discussed with the person
delivering it.

## 2. What Deal Chat does

Between placing an order and paying for it, the sponsor and the seller talk in
a chat, settle the details with ready-made questions and free-text offers, and
sign one agreement that the chat fills in. **Only then does the Pay button
(Stripe) appear.**

```
 Order placed ─► Deal Chat ─► Agreement form ─► Both sign ─► Pay (Stripe) ─► Delivery
                  │ make or break: either side can call the deal off,
                  │ the order is cancelled and nothing is charged
```

**The seller** is whoever sells the item:
- an independent adult athlete;
- **the guardian** for a minor (the guardian sees every message, and only the
  guardian can accept offers, sign or call the deal off);
- **the team manager** for a team (property) listing.

**One chat per seller.** An order that buys from two sellers has two chats,
and each must end in a signed agreement before the order can be paid.

## 3. The chat, step by step

### 3.1 The chat opens

The moment the order is placed, a chat opens on the sponsor's order page and
on the seller's Orders page. Both are emailed a link.

### 3.2 The deal checklist

At the top of the chat is a checklist of the questions that matter for what
was bought. Each row shows whether it is agreed, open, or waiting on someone:

```
┌─ Deal checklist ─────────────────────── 4 of 6 agreed ─┐
│ ✓ Sponsor approves content before posting    Yes       │
│ ✓ Sponsor may reuse it on its own channels   Yes       │
│ ✗ Use in paid ads           Sponsor: Yes · Athlete: No │
│ … How long the sponsor may use it            waiting   │
│ ✓ Exclusivity in category                    No        │
│ ✓ One round of changes                       Yes       │
└────────────────────────────────────────────────────────┘
```

### 3.3 Question cards: ready-made questions, selectable answers

Each checklist row is a **question card** in the chat, with answers to pick.

- **A card is agreed when both sides pick the same answer.**
- Until then either side can change their pick. **Once both picks match, the
  answer is locked** and neither side can change it (owner, 2026-11-18).

The cards depend on the kind of item bought (see §5).

### 3.4 Offers: free text, Reply / Accept / Decline

When the two picks on a card differ, **either side can type an offer.** The
offer is plain text: SponsorX does not assume what it is, and there is no price
or option field in it. Money, conditions, anything, goes in the words.

The other side answers with one of three buttons:

| Button | What happens |
|---|---|
| **Reply** | They are now negotiating. Their reply goes back with the same three buttons, for as many rounds as it takes. |
| **Accept** | They agree to the exchange as it stands. |
| **Decline** | The offer ends; the card is open again. Either side can pick again, start a new offer, or call the deal off. |

**The exchange is agreed when both sides have pressed Accept on its latest
message.** A new reply after one side accepted clears both accepts.

Once agreed, **the whole exchange (the offer and every reply) is copied word
for word into the written agreement** as a special term. Both sides then pick
the card's matching answer, so the card's line in the agreement stays the
approved wording.

```
 Athlete ▸ OFFER  "Yes to paid ads, but only Instagram, and $200 more."
                   Sponsor: [ Reply ] [ Accept ] [ Decline ]
 Sponsor ▸ REPLY  "Instagram only is fine. Can we do $150?"
 Athlete ▸ REPLY  "$150 works if I approve each ad first."
 Sponsor ▸ Accept ✓    Athlete ▸ Accept ✓   → into the agreement, word for word
```

Ordinary messages sit alongside cards and offers. **They are not part of the
agreement**; only agreed offer exchanges and agreed card answers are.

### 3.5 Calling the deal off

**This stage makes or breaks the deal.** Until the order is paid, either side
can call the deal off, with a reason the other side reads. The order is
cancelled, nothing is charged and the stock is released. With two sellers, one
calling off cancels the whole order (the same rule as a seller declining
today).

### 3.6 The agreement form

**The form appears only when every card on the checklist is agreed.** It is
posted into the chat already filled in from the chat:

1. **The order:** what was bought, the dates.
2. **The agreed answers** from each question card.
3. **Special terms agreed between you:** every agreed offer exchange, word for
   word.
4. **Required confirmations,** which each side ticks (see §5.1).
5. **The final amount** (§3.7).

Each side signs. A minor's form is signed by the guardian.

**Nothing on the form can change after it is out**: agreed answers are locked
(§3.3). **Right before each signature the server checks again that everything
is green**: every card agreed, no offer open, nothing waiting for BTG (owner,
2026-11-18).

### 3.7 The final amount

The system cannot read a price out of free text, so the amount is confirmed
separately, by both sides, on the form:

```
 Final amount
 Original amount: $1,000
 Amount to pay:   [ $1,000      ]   ← pre-filled; type over it if it changed

 You: $1,150 ✓    Athlete: $1,150 ✓   → amounts match, ready to sign
```

- **The box is pre-filled with the original amount** and each side confirms or
  types over it. It is agreed in the chat, before the form is posted, and is
  locked once the two match (decision 14).
- **Neither can sign until the two amounts match.** If they differ, both see
  "Your amounts don't match" and settle it in the chat.
- **The matched amount becomes the order's price.** Any buyer fee is worked out
  again on it and shown to the sponsor; Stripe charges the new total.
- With several lines from one seller, the amount is spread across them in
  proportion to their original prices, so payouts and line refunds stay
  per line.
- If the agreed exchanges mention a dollar figure and someone confirms the
  original amount unchanged, the form shows a nudge (§6). It never changes the
  amount itself.

### 3.8 Signed by both: the Pay button opens

When both sides have signed:

- the final amount is checked against the sponsor's spending limit
  (`2S4-BE-09`): within it the order is approved and awaits payment; above it,
  the order is held for BTG with the reason;
- the sponsor's order page shows **Pay** (Stripe), and the 3-day payment window
  (`2S4-BE-10`) starts;
- the seller sees "Signed by both: waiting for the sponsor's payment".

### 3.9 After payment

The checklist and agreement are locked. The chat stays open for delivery:
times, places, drafts. It becomes read-only when the order closes or is
cancelled.

**The agreement is downloadable at any time by both sides** (and by BTG), as a
PDF: the form as posted while it waits for signatures, and the signed copy
after. The download sits on the sponsor's order card and on the athlete's or
team's item card (owner, 2026-11-17).

## 4. Time limits and reminders

| What | Rule |
|---|---|
| Signing | The agreement must be signed by both **within 10 working days** of the order being placed, or the order is cancelled and both sides are emailed. A setting; rcfworks' recommendation, which the owner left to us (2026-11-17). Both sides get a last warning 2 working days before. |
| Reminders | Whoever's turn it is gets an email after every **2 working days** without a reply, until the agreement is signed (owner, 2026-11-17). |
| Unread messages | Emailed after 15 minutes, collected into one email, not one per message. |
| Payment | Unchanged: 3 days from both signing, reminders at 1 and 2 days (`2S4-BE-10`). |

## 5. The agreement forms and question cards

**SponsorX provides the forms.** Sponsors and athletes never write or upload
their own contracts: every deal is on BTG-approved wording, the forms are
versioned like the other agreements (`backend/agreements/<KIND>.v<n>.txt`,
`AgreementAcceptance` with the hash of the exact text), and we always know
what was signed.

Three forms cover the marketplace's nine kinds of item. A **package** gets one
form made of the sections for the items inside it.

| Form | Item kinds | Adds |
|---|---|---|
| **Content** | Social post, Video | what is posted, where and when, how long it may be used |
| **In person** | Appearance, Autograph session, Camp or clinic | date, place, length, travel, filming |
| **Placement** | Signage, Tickets, Other | what is placed or given, and for how long |

The wording says the special terms are agreed between the sponsor and the
seller, and that BTG runs the platform but does not enforce them.

### 5.1 Required confirmations (on every form)

Each must be ticked before that side can sign:

- The athlete will tag the sponsor and label every post as an ad.
- The athlete has checked their school, league and local rules allow this deal
  (`P0-LEG-06`: the athlete's responsibility).
- The sponsor's product is not in a restricted category (alcohol, tobacco or
  vaping, cannabis, gambling, firearms, adult content) unless BTG approved the
  deal. A deal in one of them goes to a BTG person.
- For a minor: the guardian consents to this deal.

### 5.2 Question cards (first draft, for the owner's approval)

| Form | Card | Answers |
|---|---|---|
| All | Sponsor approves the content or the appearance plan before it goes live? | Yes / No |
| All | Exclusivity: no competing brand in the same category during the deal? | Yes / No |
| Content | Sponsor may reuse it on its own channels? | Yes / No |
| Content | Sponsor may use it in paid ads? | Yes / No |
| Content | How long may the sponsor use it? | 30 days / 90 days / 1 year |
| Content | Which platforms? | Instagram / TikTok / X / YouTube (tick all that apply) |
| Content | One round of changes included? | Yes / No |
| In person | Sponsor covers travel? | Yes / No |
| In person | Sponsor may photograph or film it? | Yes / No |
| In person | How long? | 1 hour / 2 hours / Half day |
| Placement | Sponsor supplies the artwork or materials? | Yes / No |
| Placement | Placement period as listed? | Yes / No |

Any card can be settled by an offer (§3.4) when the picks differ.

## 6. What the system watches

| It watches for | It does |
|---|---|
| Where the deal stands | Shows both sides which cards are agreed, which offers are open and whose turn it is. |
| Dollar figures in agreed exchanges | Nudges at the final amount: "Your agreed terms mention $150. Is $1,000 still right?" Never changes the amount. |
| Contact details: a phone number, email address, social handle or outside payment link | Holds the message or offer for BTG before the other side sees it. Keeps the deal and the payment on SponsorX. |
| BTG's restricted-words list (`2S1-BE-18`) | Holds the message or offer for BTG. |
| Silence | Sends the reminders in §4 and cancels at the time limit. |

The checks are plain rules, not an AI service: quick to build, no new vendor,
easy to test. They can be upgraded later.

## 7. Safety: what never gives

- **Minors.** The guardian is in the chat, and only the guardian accepts
  offers, confirms the amount, signs or calls the deal off. A minor never signs
  (`assertMayCommit`, §4 of the blueprint).
- **Price floor.** A final amount below the athlete's listed price is **held
  for BTG** with the reason (the existing floor in `availability.ts`), not
  refused and not let through.
- **Spending limit.** A final amount above the sponsor's limit is held for BTG
  (`2S4-BE-09`).
- **Tenant scope.** Only the people on that order read or write its chat:
  the sponsor's users, and the seller's (athlete, guardian or team manager).
  Cross-tenant and role tests are acceptance criteria (§26, §30).
- **BTG oversight.** BTG admins can read every chat. Either side can report a
  message; a report goes to BTG.
- **Record.** Every message, pick, offer, accept, signature and amount is
  kept and audited; nothing is edited or deleted after it is sent.
- **Payment.** The server refuses payment until both have signed. Hiding the
  button is not the gate.
- **No new stored data of the forbidden kinds.** No tax ID, no bank or card
  numbers. Contact details typed in the chat are held, not published.

## 8. How it fits the order flow

- **Replaces the seller's accept / decline step** (`2S4-BE-09`) for every
  order, not only listings that ask for approval. Signing the agreement is the
  seller's acceptance; calling the deal off is the decline.
- **A new order state for the chat stage**, between placing and approval, so a
  sponsor and BTG can tell "talking" from "waiting for payment". The spending
  limit check and `AWAITING_PAYMENT` follow the second signature.
- **The order's figures** can change only through §3.7, and only before
  approval; from approval on they stay fixed
  (`marketplace_order_immutable.sql`).
- **Behind a switch** (`DEAL_CHAT`, recorded in
  [SponsorX-Switches.md](SponsorX-Switches.md) when built). Off: today's flow.
- **Orders already placed** when it ships keep today's flow.

## 8a. Live updates (owner, 2026-11-19)

The first version had no sockets: the chat asked for news every few seconds. The owner asked for a socket on
all of the messages functionality, then decided where it lives: **its own Railway service, `socketservice`**,
shared with the INFINEX game later, at `socketservice.sponsorx.net` (`2S4-BE-18`). The design, the pass and
every event are in [SponsorX-Socket-Service.md](SponsorX-Socket-Service.md). In short:

- **What is live:** messages, answers, offers and their Reply / Accept / Decline, the final amount, the form,
  each signature, the order's moves, calling off and the chat closing, held and released messages, the unread
  markers, and BTG's desk.
- **What travels:** ids and states only, never a message, an answer, an amount or a name. Whoever hears it reads
  the chat again through the API, where every rule in §7 applies. A held message's notice goes only to the
  sender's side and BTG.
- **Who connects, and when:** only when a chat (or the Messages list) is open or visible, with a 60-second,
  single-use pass for that one channel. The API issues the pass after checking, then and there, that the person
  may read the chat and that it has begun and not ended. A connection renews every 15 minutes.
- **Not a requirement:** with the service off or down, every screen keeps asking on its own beat, as before.
- **The first version** (socket.io inside the API at `/api/v1/socket`, `DEAL_CHAT_SOCKET`) is removed.

## 9. Not in this feature

- Attachments in the chat (text only first).
- Price or option fields inside an offer: by the owner's decision the offer is
  text only.
- AI reading of the chat.
- Changing an order's items or dates through the chat: that is a new order.

## 10. Decisions (programme owner, 2026-11-17)

1. An agreement between sponsor and athlete comes **before** the Stripe step.
2. The chat comes **first**; the form is introduced only once both are in
   agreement through the chat.
3. The chat has **ready-made questions with selectable answers**.
4. **This stage makes or breaks the deal:** breaking it cancels the order.
5. When picks differ, the **offer is free text**. SponsorX does not assume what
   it is. The other side can **Reply** (negotiate), **Accept** or **Decline**.
   When both accept, the exchange becomes part of the written agreement.
6. **No price field in the offer.** At the end, both sides type the final
   amount, pre-filled with the original, and it must match. That becomes the
   final amount.
7. **SponsorX provides the agreement forms**; rcfworks drafts the wording, and
   the owner approves it.
8. Deal Chat is a **feature**, not a polish item.
9. **The wording is approved** as drafted (2026-11-17,
   [deal-chat/SponsorX-Deal-Agreement-Forms-Draft.md](deal-chat/SponsorX-Deal-Agreement-Forms-Draft.md)):
   2 working days to approve content or ask for changes, posts up 30 days,
   firearms and adult content restricted, no further cards.
10. **Reminders every 2 working days** of silence, to whoever's turn it is,
    until the agreement is signed.
11. **The agreement is downloadable at any time by both sides**, from the
    order card and the item card.
12. **An answer cannot be changed once both sides agreed it** (2026-11-18).
13. **The server checks that everything is green right before each
    signature** (2026-11-18). "As simple as that."
14. **The final amount is agreed like a question card** (rcfworks, 2026-11-18,
    following decisions 12 and 13). It is pre-filled with the original amount,
    and each side confirms it or types over it. Once the two match it is
    locked, and the form is posted only after that, so the form never changes
    once it is out. The amount still appears on the form (§3.6).

15. **The chat is live over a socket** (owner, 2026-11-19: "add socket on all of the messages functionality").
    It replaces the first version's "refreshes every few seconds", which stays only as the fallback. The socket
    is its own Railway service, `socketservice`, with per-connection passes (option B). See §8a.

## 11. Tasks

| ID | Side | Task | Weight |
|---|---|---|---|
| `2S4-BE-14` | BE | The agreement forms and question cards: three forms' wording (draft for approval), the card catalogue per item kind, the filled-in form and the signatures | 3d |
| `2S4-BE-15` | BE | The order flow: the chat stage state, calling off, the final amount, the payment gate, the 10-working-day limit and reminders | 5d |
| `2S4-BE-16` | BE | The chat: messages, cards, offers with Reply / Accept / Decline, deal status, the money nudge, held messages, reporting, BTG's read access, unread email | 5d |
| `2S4-BE-17` | BE | Tests (tenant, role, minor, concurrency) and the `DEAL_CHAT` switch | 3d |
| `2S4-FE-07` | FE | The sponsor's side: the chat on the order page, the form, the final amount, signing, the Pay button opening | 5d |
| `2S4-FE-08` | FE | The seller's side, the guardian's and the team manager's: the same chat and form from the Orders page | 4d |
| `2S4-FE-09` | FE | BTG's view: read any chat, held messages and reports | 3d |

Order: `2S4-BE-14` first (its wording needs the owner's approval), then
`2S4-BE-16` and `2S4-BE-15`, then `2S4-BE-17`. The frontend tasks start once
the API contracts of `2S4-BE-15` and `2S4-BE-16` are in OpenAPI.
