# Who Can See What in SponsorX

| | |
|---|---|
| **Date** | 2026-09-14 |
| **Author** | rcfworks |
| **Task** | `P0-PMO-07` · Author the RBAC matrix — **drafted, awaiting sign-off** |
| **Audience** | Anyone who needs to understand or approve these rules. Written to be read without technical background. |
| **Not this document** | [`SponsorX-RBAC-Matrix.md`](./SponsorX-RBAC-Matrix.md) is the full table — every role against every record, plus the test cases. If you are building or testing, read that. This explains what it decides and what still needs answering. |
| **What is needed from you** | **Five decisions.** They are in section 4, each with a proposed default. If you agree with all five, that is the whole review. |

---

## 1 · What this is

A written answer to a question the software cannot guess: **who is allowed to
see and do what.**

SponsorX has twelve kinds of user — athletes, parents of young athletes,
sponsors, property managers, and six kinds of BTG staff. Each of them will look
at the same system and must see a different slice of it. This document set
decides those slices.

At the moment nothing is enforced. The demo screens send different people to
different starting pages, but anyone typing a web address can reach anything.
That is expected at this stage. What matters is that the rules are decided by
people, in writing, before anyone writes the code that enforces them —
otherwise each screen gets built with its own slightly different idea of who
should see what, and they quietly contradict each other.

## 2 · Why it matters more than it sounds

**It is the single biggest unblocker in the plan.** 106 of the remaining tasks
are waiting on it. Almost anything behind a login needs to know the answer.

**It becomes the tests.** Each line of the table turns into an automated check —
*"an athlete tries to open another athlete's earnings and is refused"* — that
runs every time anyone changes the code. Get the table right and the safety net
builds itself. Leave it vague and there is nothing to check against.

**Two rules in it protect the business, not just privacy.**

The first is the **margin**. BTG buys athlete time at one price and sells
sponsorship at another, and that difference is the business. So the rules block
it from both directions: an athlete never sees what the sponsor paid, and a
sponsor never sees what the athlete was paid. This is easy to break by accident
— both people look at the same campaign screen, and one careless column exposes
it.

The second is **contact details**. Sponsors do not get an athlete's personal
email or phone number. Partly privacy — but mainly because a sponsor holding an
athlete's mobile number does not need BTG for the next campaign.

**And one rule protects people who never signed up.** When a fan scans a QR code
and claims a coupon, they hand over contact details. Those go to nobody — not
even the sponsor who paid for the reward. The fan agreed to a coupon, not to
being passed to a brand.

## 3 · What was actually decided

Most of it was deduction, not invention. The twelve roles come straight from the
Master Blueprint, which describes what each one is for. Working out that a
finance user can mark earnings payable, or that a sponsor analyst is read-only,
is reading rather than deciding.

Two things were genuine work:

**Ownership had to be added.** The original task described a simple grid — roles
down one side, records across the top. That cannot express the rules that
actually matter. A property manager may look at athletes **on their own roster**
and must not look at another property's. Same role, same kind of record,
opposite answers — the difference is whose it is. The task description has been
corrected to match.

**Sensitive fields had to be treated separately.** Sometimes the answer is not
"can they see this record" but "can they see this *column*". An athlete should
see the campaign they are working on, but not its budget. That is one record and
two different answers, and it is where most of the real protection lives.

## 4 · The five decisions

Everything else follows from the blueprint. These five do not, and each changes
what gets built.

### D1 · Can a parent accept a Campaign Order for their child, or only view it?

**The blueprint deliberately does not say** — it reads "access dependent on
policy". Elsewhere it requires the *athlete* to accept before work begins. If a
parent can accept instead, that changes the whole approval flow for minors.

*Proposed: both. The parent authorises, the young athlete still accepts.*

This one also connects to the unresolved legal question about whether a parent's
click is enough or a real signature is needed.

### D2 · Can an athlete see the price the sponsor paid for their job?

*Proposed: no.* That gap is BTG's margin.

Worth knowing honestly: package prices are published in sponsor-facing
materials, so an athlete can already do the arithmetic. These rules stop
SponsorX *showing* them the number; they cannot make it a secret.

### D3 · Can a property manager see earnings for athletes on their roster?

A school or club may feel entitled to know what its athletes are paid — and some
may have a contract saying so. **This is a legal question as much as a
permission.**

*Proposed: no — they see campaign activity, never individual pay.*

### D4 · Can sales staff see athlete rates when quoting?

Quoting without knowing athlete cost risks selling below margin. The alternative
is that sales quote from fixed package prices and a campaign manager works out
the athlete cost afterwards.

*Proposed: no — sales quote from the package catalogue.*

### D5 · Can an athlete see their own performance score?

The score sets their tier and therefore their pay rate, so there is a fair claim
to it. But it includes a BTG reviewer's judgement of their content quality, and
reviewers score differently when they know the person will read it.

*Proposed: show the tier, not the individual scores behind it.*

---

## 5 · Where this leaves the task

**Drafted, not finished.** The task is complete when the table is *agreed*, and
five answers are outstanding. It sits at Code review.

Once those five are answered the table is final, and the 106 tasks behind it can
proceed.

## 6 · One thing found along the way, worth fixing separately

The twelve roles live in a table in section 8 of the Master Blueprint. **That
table is missing from the searchable copy of the blueprint held in this
repository** — and so are the others: sponsor packages, job rates, the Zoho
object list, the database tables, the state diagrams. The conversion that
produced that copy kept the paragraphs and dropped every table.

This matters beyond this task, because that copy is what gets searched when
anyone asks a question about the blueprint. Searching it for the roles returns
nothing, which is what happened here before the original was read directly. It
is worth redoing that conversion properly — as its own task, not folded into
this one.
