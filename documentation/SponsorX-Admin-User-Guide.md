# SponsorX Admin User Guide

| | |
|---|---|
| **Task** | `P8-PMO-02` · Write the admin user guide (§38 deliverable) |
| **Date** | 2026-09-28 |
| **Audience** | BTG operations staff: admins, the athlete network manager, campaign managers, finance and sales. No technical background needed. |
| **Covers** | Every screen under **Admin Portal**, plus a short section on the NEXT advisor desk |
| **Status** | Written against the screens as they are built today. Where something is sample data only, or not on screen yet, this guide says so plainly. |

---

## Part 1 · Before you start

### 1.1 · What the admin portal is for

SponsorX connects sponsors with athletes. In this first phase, **BTG staff
run the marketplace by hand**:

- sponsors send a request (a *brief*)
- you pick the athletes and send them invitations
- you check the content they make
- you set up the fan rewards
- you keep track of what each athlete has earned

Invoices and payments are handled in **Zoho**, not in SponsorX.

Everything you do follows one chain. Keep it in mind — each screen is one
link in it:

> athlete applies → **you approve** → sponsor sends a brief → **you match athletes** →
> **you send invitations** → athlete accepts → **you send the Campaign Order** →
> athlete makes content → **you review it** → athlete publishes → **you verify it** →
> the athlete's earning becomes due → fans redeem rewards → the sponsor gets a report

### 1.2 · Signing in

1. Go to the SponsorX login page and sign in with your BTG email.
2. You land on the **Admin Portal** Dashboard.

If you land somewhere else, your account has not been given a BTG role. Ask a
BTG admin to set it up. Nobody can give themselves a role.

**Known display quirk.** The top-right corner always shows "BTG Operations" and
"BTG_ADMIN", whoever is signed in. It does not reflect your actual role.
What you can actually do depends on your real role (see 1.4).

### 1.3 · Words used in this guide

| Word | What it means |
|---|---|
| **Brief** | A sponsor's request: what they want, their budget, dates, sports, places, and what they won't be associated with. |
| **Campaign** | What a brief becomes once athletes are being signed up for it. |
| **Invitation** | An offer to one athlete to do one job on a campaign. It lasts 7 days. |
| **Campaign Order** | The formal agreement one athlete signs: the job, their pay, usage rights, the due date. Its terms are fixed once sent. |
| **Deliverable** | One piece of content an athlete owes under a Campaign Order. |
| **Earning** | The record of what an athlete is owed for an order, and whether it has been paid. SponsorX tracks the status only — BTG pays outside the system. |
| **Reward** | A fan offer (for example "Free coffee"). Each athlete on the campaign gets their own **QR code** (a *token*), so every scan shows which athlete drove it. |
| **Guardian** | A parent or authorised representative of an athlete under 18. A minor cannot take paid work until their guardian is **verified**. |
| **Conflict** | A product category an athlete refuses to promote (for example alcohol). Athletes with a conflict are left out of matching automatically. |
| **Zoho** | BTG's sales and invoicing system. SponsorX sends it information in the background (see 1.6). |
| **Audit log** | The permanent record of who changed what, and when. |
| **Provenance label** | The small tag beside a number (for example VERIFIED, SELF-REPORTED, POSTGRES, ZOHO BOOKS) that says where the number came from. Never quote a SELF-REPORTED number to a sponsor as if it were measured. |
| **NEXT** | SponsorX NEXT — the student sports-magazine programme with schools. It has its own four admin screens (Part 5). |

### 1.4 · Who can do what

All six BTG roles can open the Admin Portal and see the same menu. **What each
screen lets you do depends on your role.** If your role cannot act on a
screen, you will either see **sample data** (1.5) or a short message saying
the screen belongs to someone else.

| Screen | Admin (BTG Admin / Super Admin) | Athlete Network Manager | Campaign Manager | Finance | Sales |
|---|---|---|---|---|---|
| Applications | Review and decide | **Review and decide** | Sample data only | Sample data only | Sample data only |
| Campaigns and campaign pages | Full | View | **Full** | View (see 8.1) | View (see 8.1) |
| Matching Studio | Full | View and shortlist; **cannot send** invitations | **Full** | Sample data only | Sample data only |
| Approvals (content) | Full | Sample data only | **Full** | Sample data only | Sample data only |
| Rewards | Full | Sample data only | **Full** | Sample data only | Sample data only |
| Analytics | Yes | Yes | Yes | Not available (8.1) | Not available (8.1) |
| Finance | Everything, including invoices | Sample data only | Sample data only | **Earnings only — no invoices** | Sample data only |
| Network | Yes | Yes | Yes | Message: "Network figures are BTG's" | Same message |
| Integrations | Yes | Message only | Message only | Message only | Message only |
| Audit log | Yes | Message only | Message only | Message only | Message only |
| NEXT editions, inventory, rights | Full | Sample data only | Sample data only | Not available | Not available |
| NEXT splits | Full | Sample data only | Sample data only | Not available (8.1) | Not available |

**Two rules that never change, whatever your role:**

- **Sponsors never see what an athlete is paid.**
- **Athletes never see what the sponsor pays.**

The screens are built so you cannot accidentally show either. Don't pass
these numbers on by email either.

### 1.5 · Real data or sample data?

Most screens have two modes:

- **Real data.** What you see is the live system, and your actions are saved.
- **Sample data.** A realistic demo. A banner near the top says so, for example *"Demo data — the live review queue is read by BTG admin and the Network Manager, so every figure below is sample data."* Buttons still work, but a message tells you *"Demo decisions last for this visit only — nothing is saved."* Many sample actions show an **Undo** button. Real actions never do.

**How to tell which mode you're in:**

- The sample-data banner is visible, or
- the web address ends in `?demo=` followed by a word. Remove that part to return to real data.

**The Dashboard is always sample data**, for everyone (Part 2).

### 1.6 · What happens in the background

Many actions send an email or update Zoho. **These do not happen instantly.**
SponsorX puts them in a queue, and a background worker sends them, normally
within a few seconds.

- **If Zoho is down, nothing on your side breaks.** Sponsors can still browse, athletes can still accept, fans can still redeem. The Zoho updates wait in the queue and go through when Zoho is back.
- You can see the queue on the **Integrations** screen (Part 4).
- Every decision you make is written to the **Audit log** at the same moment it is saved.

### 1.7 · Common screen patterns

- **Queues and drawers.** Click a row to open a panel from the side (a *drawer*) with the details and the action buttons. Close it with **Close**, by clicking outside it, or with the Escape key.
- **Tabs, search, filters.** They apply instantly — there is no "Apply" button. **Clear all** removes every filter.
- **Page size.** Long lists offer **12 / page**, **24 / page** or **60 / page**, above and below the list.
- **Something broke.** If a screen shows *"Something broke on our side"*, click **Try again**. If it keeps happening, note the reference code shown and see Part 8.

---

## Part 2 · The daily routine

### Every morning — Athlete Network Manager

1. **Applications** → **Needs review** tab. Start with anything marked *waiting Nd* or in the "waiting over 48 hours" alert.
2. For each application, work through 3.1.
3. Check the **Approved** tab for athletes who are approved but not yet activated (3.1, "To activate an athlete").

### Every morning — Campaign Manager

1. **Approvals** → **Needs review** tab. Clear anything waiting over 24 hours first (3.4).
2. **Campaigns** → look at the **Needs attention** group first (3.2).
3. **Matching Studio** for any brief waiting to be matched (3.3).
4. **Rewards** → check that live rewards have QR codes and are not about to run out (3.5).

### Every morning — Finance

1. **Finance** → **Athlete earnings** table. Look for anything **Eligible** (earned, waiting on your approval), **Held** or **Disputed** (3.7).
2. Admins only: check the **Reconciliation** table for campaigns showing *"$X not invoiced"* (3.7).

### Every morning — Admin

1. **Integrations** → confirm it says **"Everything is healthy"** (4.1).
2. Glance at the **Audit log** if anything unusual was reported (4.2).

### Once a week

- **Network** (3.8) — utilisation, margin by job, and whether reach promises are being kept.
- **Analytics** (3.6) — reward performance for the last 7 or 30 days.

---

## Part 3 · The core workspaces

### 3.1 · Applications — approving athletes into the network

**Menu:** Applications · **Page title:** "Athlete applications"
**Who:** Athlete Network Manager, Admin. Everyone else sees sample data.

New athletes apply through the public join page, and their applications land
here.

**The screen:**

- At the top: how many athletes are waiting, and whether anyone has waited more than 48 hours.
- **Tabs:** **Needs review**, **Approved**, **Rejected**, **All**.
- **Search** by name, sport or region.
- **Filters:** by sport; by **Anything**, **Minor athletes**, **Flagged for review**, **Waiting 48h+**.
- **Sort:** **Waiting longest**, **Newest first**, **Score · high to low**.
- **Row badges:** *Minor*, *Info requested*, flags, *waiting Nd*, a score ring, and the status.

**Application statuses:**

| Status shown | Meaning |
|---|---|
| Draft | The athlete hasn't finished applying. |
| Submitted | New — nobody has started reviewing it. |
| Under review | A reviewer has claimed it. |
| Info requested | Sent back to the athlete with your notes. |
| Approved | Passed review. **Not yet able to take paid work** — needs activating. |
| Active | Live in the network. Can be invited to paid work. |
| Rejected | Final. Re-applying starts a new application. |
| Suspended | Paused — no new work. |

**To review an application:**

1. Click the application to open its drawer.
2. If it says **Submitted**, click **Start review**. This claims it, so two people can't decide the same application. You now see the decision buttons.
3. Read the **score**:
   - Bands: *Strong fit*, *Solid fit*, *Developing*, *Weak fit*.
   - Each factor has a one-line explanation. **"not assessed" means nobody has scored that factor yet — it is not a zero.**
   - *"Not scored yet"* means the whole score is missing.
4. Read **Safeguards**:
   - **Guardian:** *"Adult athlete — no guardian needed."*, *"Guardian verified…"*, *"Guardian linked but not verified…"* or *"Minor with no guardian linked…"*.
   - **Conflicts:** the categories the athlete won't promote. Conflicts are checked again automatically at matching.
   - **Followers:** these are **self-reported** by the athlete, not verified.
5. Decide (next four sections). Every decision is saved, written to the audit log, and **emails the athlete**.

**To approve:**

1. Optionally write a note in **Notes to the athlete**.
2. Click **Approve**. You'll see *"[Name] approved — they're being notified by email. Going live for paid work is a separate activation step."*

A minor with an unverified guardian **can** be approved. They just cannot be
activated yet (next section).

**To activate an athlete (let them take paid work):**

1. Open an **Approved** application. It shows *"Approved. Activating puts this athlete live — sponsors can then invite them to paid work."*
2. Click **Activate athlete**. You'll see *"[Name] is active — live in the network and able to take paid work."* No email is sent for this step.
3. If the button is greyed out, the reason is shown beside it:
   - *"A minor can't go live until a guardian is linked and verified — no guardian is linked yet."* — someone must collect the guardian's details first.
   - *"A minor can't go live until their guardian is verified — the guardian is linked but not verified yet."* — wait for guardian verification.

   Guardian verification is **not on an admin screen yet** (see 8.3).
4. If activation is refused for a minor whose public profile was claimed through NEXT, the guardian's commercial authorisation must be on record first.

**To ask for more information:**

1. Write what you need in **Notes to the athlete**. The athlete receives these words **exactly as you type them**.
2. Click **Request info**. The athlete is emailed and can update and resubmit. It comes back to **Submitted**.

**Request info** stays greyed out until you write a note.

**To reject:**

1. Write the reason in **Notes to the athlete**.
2. Click **Reject**. The button changes to **Confirm reject — final**.
3. Click it again to confirm. **This cannot be undone.**

---

### 3.2 · Campaigns — watching delivery

**Menu:** Campaigns · **Page title:** "Campaigns"
**Who:** all BTG roles can view. Campaign Manager and Admin act.

**The campaign list** groups campaigns into:

- **Needs attention** — something overdue or behind on reach
- **Delivering**
- **Staffing** — athletes still being signed up
- **Closed**

Each card shows:

- the status (DRAFT, STAFFING, APPROVAL, ACTIVE, REPORTING, COMPLETED, CANCELLED)
- badges such as *N overdue* or *Reach short*
- the sponsor and package
- **Deliverables published N / N**
- **Athletes**, **Contracted** and **Ends**

**Where a card takes you:**

- A **Staffing** campaign opens the **Matching Studio** (3.3).
- Any other campaign opens its **campaign page** (below).

**New campaigns.** You don't create a campaign on this screen. An approved
brief becomes a campaign automatically when you send its first invitations
from the Matching Studio. The **+ New campaign** button appears only in
sample-data mode, and nothing it does is saved.

**The campaign page:**

**Delivery**, at the top:

- how many deliverables are verified
- how many are **overdue** (past due and not verified)
- whether **verified reach** is below 70% of what was projected
- how many athletes need attention

**Roster** lists every athlete on the campaign:

- Use **Everyone** / **Needs attention** and the search box.
- Click an athlete to open their order drawer. Its **Where this order is** strip shows *Order sent → Accepted → Delivering → Complete* (or *Declined*).

**Flags on the roster and what to do:**

| Flag | Meaning | What you do |
|---|---|---|
| **Order not drafted** | The athlete accepted the invitation. BTG now owes them a Campaign Order. | Draft and send the order (next section). |
| **Awaiting acceptance** | The order or invitation has been sent; the athlete hasn't answered. | Wait, or chase them by phone or email. The drawer says *"Waiting on [Name] — the Campaign Order is sent / the invitation is open."* |
| **Replacement needed** | The athlete declined. | Click **Find a replacement in the Matching Studio →**. |
| **Under-delivering** | Fewer deliverables published than the schedule calls for. | Click **Open [Name]'s work on the content desk →**, or contact the athlete. |

**To draft and send a Campaign Order:**

1. Open the athlete's drawer (flag **Order not drafted**) and click **Draft the Campaign Order**.
2. Fill in:
   - **Athlete pay ($)** — what the athlete receives
   - **Sponsor price ($)** — what BTG charges for this line. The form shows the minimum: *"The 1.4× floor for $X pay is $Y — the API refuses a lower sponsor price."* A lower price is refused and nothing is created.
   - **Usage rights** — for example "Organic social, 90 days"
   - **Exclusivity (optional)**
   - **Due date**
3. Click **Draft & send order**. You'll see *"Campaign Order sent — [Name] can now read and sign it."*

What happens next:

- **The terms are frozen once sent.** The athlete sees their pay, never the sponsor price.
- If you see *"Drafted, but not sent: …"*, the order was saved as a draft. Open the drawer again and click **Send the drafted order**.

**Sponsor report button.** The campaign page has a **Sponsor report** button,
but it currently opens the sponsor's own portal, which BTG accounts cannot
open. You'll be sent back to the admin Dashboard. See 8.3.

---

### 3.3 · Matching Studio — choosing athletes and sending invitations

**Where:** from a **Staffing** campaign card, or **Campaigns** → a brief · **Page title:** "Matching & roster review"
**Who:** Campaign Manager and Admin can send. The Athlete Network Manager can look and shortlist but **cannot send**.

The studio opens on a brief waiting for matching. If there are several, pick
one from the **Brief:** buttons at the top.

**If it says "No brief is waiting for matching":** a brief must be
**qualified** and **approved** before it can be matched. That step is not on
an admin screen yet (see 8.3).

**Finding athletes:**

- **Filters:** **Sport**, **Tier**, **Minimum score**, and **Eligibility**:
  - **Approved & active only** — contract signed, profile live
  - **Guardian-verified only** — leaves out minors still waiting on a guardian
  - **Incl. not-yet-active**
- **Reset** clears the filters.
- **Search** by name, sport or market.
- **Sort:** **Score, high to low**; **Margin, low to high**; **Athlete cost, low to high**.

**Colours:**

- **Eligible** — can be invited.
- **Guardian pending** — a minor who can't accept until their guardian confirms.
- **Conflict** — the athlete refuses this sponsor's category.
- **Below margin floor** — the sponsor price wouldn't clear BTG's minimum margin.

Athletes with a conflict are never offered. The **Blocked, not hidden** section
explains who was left out and why.

**Missing data is shown honestly:**

- An unscored athlete shows a dashed ring and "—", not 0.
- An athlete with no agreed rate shows **"No rate on file"** and can't be picked.

**To shortlist and send invitations:**

1. Click **Add** beside each athlete you want. **Hold** keeps an athlete in view without adding them.
2. Watch the **Shortlist** panel on the right. It shows:
   - how many slots are filled (*roster complete* or *N to go*)
   - the **Blended margin**
   - any *"Guardian consent outstanding"* warning
3. Optional: click **Compare shortlist factor by factor** to see the athletes side by side.
4. Click **Review N and send invitations**. Read **What sending does**:
   - each athlete gets the job and the offer
   - the invitation window is **7 days**
   - a minor's guardian gets a consent request in parallel
   - the sponsor sees the roster and sell prices only
5. If a line is below the margin floor, you must tick the margin-exception box before you can send.
6. Click **Send N invitations**.

**What happens:**

- If this brief had no campaign yet, one is created now. It appears in the **Staffing** group, and a matching Deal is queued for **Zoho**.
- Each athlete is emailed their invitation (via the queue).
- The result shows *"N of N athletes invited"*. Any athlete who couldn't be invited is listed with the reason.
- The campaign stays in **Staffing** until acceptances come in. Accepted athletes then show **Order not drafted** on the campaign page (3.2).

**Invitations cannot be recalled once sent, and their offers are fixed.**

---

### 3.4 · Approvals — reviewing athletes' content

**Menu:** Approvals · **Page title:** "Content approvals"
This is the **Content Approval** workspace.
**Who:** Campaign Manager and Admin.

**How content moves:**

> **1 Athlete submits** → **2 BTG review** (brand safety and brief fit) → **3 Sponsor review** (the sponsor's final say) → **4 Cleared** → the athlete publishes → you **verify** it

**The screen:**

- **Tabs:** **Needs review**, **Cleared**, **All**.
- **Search** by title, athlete, campaign or sponsor.
- **Filters:** by campaign; by format (**Video** / **Image**).
- **Sort:** **Waiting longest**, **Due soonest**, **Newest first**.
- Items waiting over 24 hours are highlighted.

**Content statuses:** Not started · Draft submitted · BTG review · Sponsor
review · Approved · Published · Verified · Revision requested.

**To review a piece of content:**

1. Click the deliverable to open its drawer.
2. Click **Open vN** to view the upload. It opens in a new tab through a secure, short-lived link.
   - If your browser blocks the tab, allow pop-ups for SponsorX.
   - *"No upload to open yet"* means the athlete hasn't uploaded anything.
3. Use the button the drawer offers. Only the moves that make sense for the current status appear:

| Status | Buttons | What happens |
|---|---|---|
| Draft submitted | **Start BTG review** | Moves to BTG review. *"Review started — it's on the BTG desk now."* |
| BTG review | **Send to sponsor** | Moves to Sponsor review. *"Sent to [sponsor] for their sign-off."* |
| BTG review | **Approve** | Clears it without a sponsor round — use only when the sponsor has already agreed. The athlete is emailed to publish. |
| BTG review | **Request revision** | Sends it back (next section). |
| Sponsor review | **Approve (sponsor signed off)** | Use once the sponsor has confirmed. The athlete is emailed to publish. *"Approved — the athlete has been told to publish."* |
| Sponsor review | **Request revision** | Sends it back. |
| Published | **Verify publication** | Confirms the post is live as agreed. *"Verified — it now counts toward the athlete's earning."* |

**To request a revision:**

1. Click **Request revision**.
2. In **What needs to change?**, write exactly what the athlete should fix. They receive these words word for word.
3. Click **Send revision request**. The athlete is emailed, and their next version comes back to the top of the queue.

**There is no undo.** Every decision is saved, written to the audit log, and
where noted the athlete is emailed.

**Why Verify matters.** When **every** deliverable on an athlete's order is
verified, their earning automatically becomes **Eligible** — owed and ready
for Finance (3.7).

**When there's nothing to do**, the drawer tells you why:

- *"Waiting on the athlete's next version."*
- *"Waiting on the athlete to publish and send the link."*
- *"Verified — nothing left to decide."*

---

### 3.5 · Rewards — fan QR offers

**Menu:** Rewards · **Page title:** "Fan Rewards"
**Who:** Campaign Manager and Admin.

A reward is an offer fans get by scanning a QR code at an event. Every athlete
on the campaign gets **their own QR code**, so every scan shows which athlete
brought the fan in. Fans don't log in.

**What happens on the fan's side:**

> **scan** → reads the offer (**landing**) → **claims** it (gives an email and ticks consent) → shows it at the counter (**redeem**)

**The screen:**

- Totals: **Live rewards**, **Scans**, **Claims**, **Redeemed**.
- **Tabs:** **All**, **Live**, **Draft**, **Paused**, **Ended**.
- **Search** by offer, campaign or sponsor.
- Each card shows:
  - its funnel (scan → landing → claim → redeem)
  - **Tokens**, **Expires**, and **Per fan** (*single use* or *reusable*)
  - who it's for (for example **18+ only**)
  - the **Redemption cap**, for example *"150 of 200 left"*, *"all 200 used"* or *"unlimited"*

**To create a reward:**

1. Click **+ Create reward**. The **Create Fan Reward** panel opens.
2. **Campaign** — only campaigns with signed athletes can take a reward.
3. **Offer — what the fan gets** (for example "Free coffee with any service").
4. **Terms — shown on the fan page** (for example "One per fan. Show this screen at the counter.").
5. **Expiry** — **In 30 days**, **In 60 days**, **In 90 days**, or **When the campaign ends**.
6. **Single use per fan** — leave ticked unless the offer can be used repeatedly.
7. **Who it's for** — **Anyone**, **18+ only**, **21+ only** or **Ticket holders**.
   - **Important:** SponsorX shows this to the fan and to booth staff, but **cannot check it**, because fans don't log in. Staff at the counter must check ID or tickets.
   - **Eligibility note (optional)** is shown to the fan and staff, for example "Show your wristband at the booth".
8. **Redemption cap (blank = unlimited)** — the total number of redemptions across all the reward's QR codes.
   - When it is used up, fans are told the offer has run out.
   - It must be a whole number from 1, or left blank.
9. **Landing page — what the fan reads first:**
   - **Headline** — leave blank for "You've got a reward".
   - **Subhead (optional)**.
10. **Athletes carrying a QR** — tick each signed athlete who should get a code.
11. The fan consent wording is shown for reference. It is the same for every reward and cannot be edited here.
12. Optionally tick **Go live as soon as it's created**.
13. Click **Create reward**. You'll see *"… created and live"* (or *"as a draft"*) with the number of QR codes. The images take a moment to generate.

**Check before you print.** Eligibility, cap, headline and subhead **cannot be
changed after creation** yet. If you get them wrong, end the reward and
create a new one.

**To change a reward's status:**

| Current | Buttons | What fans see afterwards |
|---|---|---|
| Draft | **Go live**, **Archive** | Draft: nothing to claim yet. |
| Live | **Pause**, **End now** | Live: scans, claims and redemptions all count. |
| Paused | **Resume**, **Archive** | Paused: scans still count, but nothing can be claimed. |
| Ended | — | The page tells fans it's over. |

**To download QR codes for printing:**

1. On the reward card, open **QR codes**. There is one row per athlete.
2. Click **Download QR ↗** for each athlete.
   - If you see *"The QR is still being generated — try again shortly"*, wait a minute.
3. Print at poster or table-tent size **with the white border intact**. The border is what lets a phone find the code in a dim venue.

---

### 3.6 · Analytics — how rewards performed

**Menu:** Analytics · **Page title:** "Analytics"
**Who:** Admin, Campaign Manager, Athlete Network Manager.

The page reads as five chapters, top to bottom:

1. **What happened**
2. **The funnel**
3. **Where**
4. **What fans took**
5. **Who drove it**

**To change the period:** click **7d**, **30d** or **90d**.

**The headline numbers:**

- **QR Scans**
- **Offers Claimed**
- **Rewards Redeemed**
- **Claimed, not yet used**

**The athlete table** ranks athletes by **redemptions, not claims**. A claim a
fan never used is not a result.

**Locations** are worked out in the background. A fan's internet address is
never stored.

The **Export report** menu appears only in sample-data mode.

---

### 3.7 · Finance — earnings and invoices

**Menu:** Finance · **Page title:** "Finance"
**Who:** Finance, and Admin. Only Admin sees invoices.

This screen **observes**. SponsorX does not send invoices and does not pay
anyone:

- **Invoices** are raised and paid in **Zoho Books**. SponsorX shows a read-only copy that updates automatically when Zoho changes.
- **Athlete payments** are made outside SponsorX by BTG's normal process.

The screen shows the notice *"Payout actions are blocked on the written Phase
1 payment policy…"* until that policy is signed.

**What you see:**

- Totals: **Invoiced**, **Collected**, **Owed to athletes**, **Needs attention**.
  - Finance sees "—" / *"BTG admin only"* for the invoice totals. This is deliberate: Finance reads earnings, not what the sponsor was billed.
- **Invoice aging** and **Earnings flow**.
- **Reconciliation** (Admin only), per campaign: **Contracted**, **Invoiced**, **Collected**, **Athlete earnings**, **Paid out**, and a **Check** column:
  - **matches** — all good
  - **$X not invoiced** — raise the missing invoice in Zoho Books
  - **invoiced over contract** — check the invoice in Zoho Books
- **Sponsor invoices** (Admin only), with the status as Zoho reports it: draft, sent, paid, overdue, void. *"No invoices synced from Zoho yet"* means none have arrived.
- **Athlete earnings**: athlete, campaign, reference, status, athlete pay, sponsor price, commission.

**Earning statuses:**

| Status | Meaning | What happens next |
|---|---|---|
| Pending | Work not yet verified. Nothing is owed yet. | Happens automatically when content is verified (3.4). |
| Eligible | Every deliverable is verified. The athlete has earned it. | Finance approves it for payout. |
| Approved for payout | Finance has approved payment. | BTG pays outside SponsorX, then marks it Paid. |
| Paid | Paid and recorded. Final. | — |
| Held | Deliberately withheld (a dispute, a compliance question, an unverified guardian). | Resolve the issue, then release. |
| Disputed | The amount or entitlement is contested. | Resolve, then return it to Eligible or Held. |

**Changing an earning's status is not on this screen yet.** Approving for
payout, marking paid, holding, disputing and adjustments all exist in the
system and are audited, but there is no button for them. See 8.3.

---

### 3.8 · Network — how the marketplace is doing

**Menu:** Network · **Page title:** "Network"
**Who:** Admin, Campaign Manager, Athlete Network Manager. Real data only.

**Tiles:**

- **Active athletes**
- **Participation**
- **Utilisation**
- **Gross margin**
- **Earnings raised**
- **Earnings paid**
- **Average job pay**
- **Average sell price**

**Economics by job** shows, for each job type (Story Drop, Sponsored Post,
Athlete Reel, and so on): orders, average sell, average athlete pay and
margin. **Margin rates shown in red are below target** — raise them with
whoever sets prices.

**How well we price reach** compares verified views with the views we
projected when we sold. Below 70% is flagged. Most projections start from
follower counts the athletes typed in themselves, so treat a shortfall as a
pricing lesson, not an athlete failure.

---

## Part 4 · Admin-only workspaces

### 4.1 · Integrations — is everything connected?

**Menu:** Integrations · **Who:** Admin.

**The top card** says **"Everything is healthy"** or **"N things need
attention"**, followed by the list, for example:

- *db unreachable*
- *N webhook deliveries rejected this week*
- *N worker jobs failed this week*
- *outbox work waiting over 15 min*

**Sections:**

- **Zoho sync** — how many records are linked to Zoho, and when they last synced.
- **Inbound webhooks · last 7 days** — updates Zoho sent us: received, applied, rejected. *"bad signature"* means a message failed its security check and was refused. That is correct behaviour, but repeated failures should be reported.
- **Queue:**
  - **Waiting for the worker** — *"Nothing waiting — the worker is keeping up"* is what you want to see.
  - **Worker jobs · last 7 days** — created, retry, active, completed, failed.
  - **Recent failed jobs**.

**What to do:**

| You see | Meaning | Action |
|---|---|---|
| Some work waiting, clearing within minutes | Normal. A queued Zoho sync is healthy, not an outage. | Nothing. |
| *outbox work waiting over 15 min* | The background worker may be stopped. | Report it to engineering (Part 8). Emails and Zoho updates are delayed, not lost. |
| *N worker jobs failed this week* | Some background jobs failed after retrying. | Check **Recent failed jobs** and report it. |
| Webhooks *rejected* | Zoho messages failed checks. | Report it if more than a handful. |

### 4.2 · Audit log — who changed what

**Menu:** Audit log · **Who:** Admin. Read-only — nobody can edit or delete an entry, including admins.

**To find something:**

- Filter by **All record types**.
- Filter by person: **Everyone**, a named person, or **System (worker, webhooks)**.
- Or paste a **Record id** (for example an order or deliverable id).

**Reading an entry:**

- Click a row to see exactly what changed (before → after).
- **Everything this person did →** lists all of one person's actions.
- The record button shows **this record's whole history**.

**Load more** fetches older entries.

---

## Part 5 · SponsorX NEXT workspaces

NEXT is the schools magazine programme. An **edition** is one issue. Its
**slots** are the ad positions sponsors buy. Before an edition can publish,
three conditions must be met:

- **Content ready**
- **Rights cleared** — permission recorded for every article and photo
- **Revenue met** — enough ads sold

**Who:** Admin. Other roles see sample data or a "not your scope" message.

### 5.1 · NEXT editions

**Menu:** NEXT editions · **Page title:** "Editions · SponsorX NEXT"

- Pick the edition from the switcher at the top.
- The badges show its status, when ads close, and the publish target.
- **The gates:** **Content ready**, **Rights cleared**, **Revenue met**, with progress towards the minimum revenue (*"$X of $Y minimum viable — $Z to go"*).
- **The flatplan** is a page-by-page map of the issue. Each slot shows **Sold**, **Reserved** or **Open**.

**To move an edition forward**, use the one button offered:

| Status | Button |
|---|---|
| Planning | **Open for sale** |
| Selling | **Close ads** |
| Closed | **Send to production** |
| In production | **Publish digital** |
| Published digital | **Mark printed** |
| Printed | **Mark distributed** |

- **Publish digital** is refused until rights are cleared.
- **Closing** an edition calculates its revenue split (5.3).

**To mark content ready:** click **Mark content ready**. Use **Mark not
ready** to undo it.

**To book ad positions for a campaign:**

1. The sponsor's campaign must exist, with a NEXT package, as a draft.
2. In **Sell** → **Book a campaign**, pick it and click **Book positions**.
3. You'll see *"Booked P04-…"*.

If you see *"No [kind] left — this package can't be honoured here"*, the
edition has run out of that ad size.

### 5.2 · NEXT inventory — the ad slot ledger

**Menu:** NEXT inventory

- Totals: **Committed**, **Still on the rack**, **Sell-through**, **Full rack value**.
- Search and filter the slot list by state (Sold / Reserved / Open) and kind.

**To add a slot** (only while the edition is planning or selling):

1. Click **Add a slot**.
2. Enter a **Code** (for example "P04-QTR-A"), a **Kind** (full page, half page, quarter, back cover, presenting) and a **Rack $** price.
3. Click **Add**.

### 5.3 · NEXT splits — who gets the edition's revenue

**Menu:** NEXT splits

This shows how a **closed** edition's revenue is divided:

- **SponsorX**
- **The school** — paid to the programme, not a person
- **Student scholarship pool** — funds the points programme; never paid to a student directly
- **Editorial fund** — the newsroom's equipment money

**This is an allocation, not a payment, and never an athlete earning.**
Before the edition closes, the screen shows *"No split until the edition
closes"*.

**Known issue:** the Finance role cannot open this screen yet (see 8.1).

### 5.4 · NEXT rights — permission to publish

**Menu:** NEXT rights · **Page title:** "Rights · SponsorX NEXT"

**Print and digital are separate permissions.** An article cleared for
digital is not automatically cleared for print. The **Clearance queue**
lists every item still missing a permission, and who must grant it.

**To add an item that needs rights:**

1. Click **Add an asset**.
2. Enter a **Title**, a **Kind** (Article, Photo, Photo package, Interview, Video, Ad creative) and a **Source** (Student, Athlete, SponsorX, Third party).
3. Click **Add**. It joins the queue.

**To record a permission:**

1. On the item, click **Record a right**.
2. Enter:
   - the **Grantor** (Student, Athlete, Guardian, SponsorX, Third party) and **Who**
   - the **Signed acceptance id** (from the consent record) or a **Licence reference**
   - **From** and **Until** dates
   - tick what is allowed: **Digital**, **Print**, **Promote**, **Commercial reuse**
3. Click **Record**.
4. If you see *"No signed acceptance with that id…"*, copy the id again from the consent record. Nothing was saved.

The **Rights ledger** at the bottom lists every permission granted.

### 5.5 · The NEXT advisor desk (for reference)

School faculty advisors have their own desk (**NEXT Advisor**). BTG admins can
open it to preview. On it, advisors:

- review student applications: **Start review**, **Approve**, **Request changes**, **Decline**, **Add to the masthead**, **Suspend**, **Reinstate**
- verify **Profile claims** (**Verify** / **Reject**) against the school roster

**Content review** there is not connected yet. **Roster** is marked *soon*.

---

## Part 6 · The Dashboard (sample only)

**Menu:** Dashboard · **Page title:** "Operations Board"

The Dashboard currently shows **sample data only** for everyone: money flow,
campaign pacing, integration health, and the **Needs BTG action** tiles. Use
it as a map of the work, not as live figures.

For real numbers, go to:

| For | Go to |
|---|---|
| Queues | **Applications**, **Approvals**, **Matching Studio** |
| Money | **Finance** |
| System health | **Integrations** |

---

## Part 7 · Quick answers

| Question | Answer |
|---|---|
| An athlete says they never got our email. | Emails go through a queue. Check **Integrations** for waiting or failed jobs. Then ask the athlete to check spam. The **Audit log** shows your decision was saved. |
| I approved an athlete but they can't be invited. | Approval isn't activation. Open the application and click **Activate athlete** (3.1). |
| The Activate button is greyed out. | The athlete is a minor without a verified guardian. The reason is shown next to the button. |
| An athlete doesn't appear in the Matching Studio. | They may not be active, may be a minor waiting on a guardian (try **Incl. not-yet-active**), may have a **conflict** with the sponsor's category (they will never appear), or may have **No rate on file**. |
| The Studio won't let me send. | Read the hint under the button: acknowledge the margin exception, add an athlete, or the brief isn't approved yet. |
| The order form refused my sponsor price. | It is below the 1.4× floor shown on the form. Raise it, or ask for a pricing decision. |
| A fan says the offer "has run out". | The reward's **redemption cap** is used up (the card shows *"all N used"*), or the reward is paused, ended or expired. |
| Can I change a live reward's cap or wording? | Not yet. End it and create a new one. |
| Numbers look different from Zoho. | Zoho is the record for invoices and payments. Check the **Reconciliation** table and the **Zoho sync** section on Integrations. |
| I clicked something by mistake. | Real decisions have no undo. Tell an admin. The Audit log shows exactly what changed, and they can decide the fix. |

---

## Part 8 · When something goes wrong

### 8.1 · Known issues in the current build

- **Finance and Sales may get "Something broke on our side"** on the **Campaigns** list and on **Analytics**. Those screens ask for figures these roles aren't allowed to read. Use the campaign pages or ask an admin.
- **Finance cannot open NEXT splits** ("Editions are outside your role's scope"), even though splits are Finance's to read.
- **The Athlete Network Manager can open the Matching Studio but not send invitations.** Each send is refused. Send through a Campaign Manager or Admin.
- **The "Sponsor report" button** on a campaign page sends BTG staff back to the Dashboard (3.2).
- **The top-right name and role** always show "BTG Operations / BTG_ADMIN".
- **The bell (notifications) and ? (help) icons** do nothing yet.

### 8.2 · Error messages you may see

| Message | Meaning | Do |
|---|---|---|
| *"The API is unreachable — nothing was decided. Try again in a minute."* | SponsorX's server didn't answer. **Nothing was saved.** | Wait a minute and retry. If it persists, report it. |
| *"The decision was not accepted (HTTP 409)."* or similar | Someone else changed this record first, or the move isn't allowed from its current status. | Reload the page and look at the current status. |
| *"Write the athlete a note first — it's what they receive."* | Request info and Reject need a note. | Write the note. |
| *"Queue unavailable (403)"* or a "…is BTG admin's" message | Your role can't read this screen. | Ask an admin. |
| *"Something broke on our side"* | An unexpected error. The rest of the portal still works. | Click **Try again**. If it persists, report it with the **reference code** shown. |

### 8.3 · Not on an admin screen yet

These parts of the process exist in SponsorX but have **no button yet**. Until
the screens are built, ask the engineering team to carry them out. Every one
of them is still recorded in the Audit log.

| Task | Where it would fit |
|---|---|
| Qualifying and approving a sponsor's **brief** (needed before matching) | Matching Studio |
| Moving a **campaign** between statuses (to approval, active, reporting, completed, cancelled) and launching it | Campaign page |
| Changing an **earning's** status (approve for payout, mark paid, hold, dispute) and adjustments | Finance |
| **Verifying a guardian**, and linking a guardian to a minor | Applications |
| Setting an athlete's **tier** and **rates** | Applications / Network |
| **Editing a reward** after it is created | Rewards |
| Reviewing **external property onboarding** applications (Phase 2 — approve, request changes, reject, suspend, reinstate) | a future verification queue screen |
| Opening the **sponsor report** from the admin side | Campaign page |

### 8.4 · Reporting a problem

When you report something, include:

- the screen name
- what you clicked
- the exact message
- the reference code, if one was shown
- the time

Never include an athlete's pay or a sponsor's price in a message to anyone
outside BTG.
