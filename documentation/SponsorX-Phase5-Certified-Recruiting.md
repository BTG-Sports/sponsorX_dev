# SponsorX — Phase 5 · Certified Recruiting Partnership

**BTG SPORTS GROUP · SPONSORX · PHASE 5 · CERTIFIED RECRUITING PARTNERSHIP**

| | |
|---|---|
| **Goal** | Athletes on SponsorX find Certified Recruiting's recruiting support, a BTG partner. |
| **Tasks** | 1 · 1 person-day |
| **Timeline** | Now |
| **Depends on** | Nothing: [certified-recruiting.com](https://www.certified-recruiting.com/) is built and live |
| **Source** | The user, 2026-10-27, from a partnership plan for Certified Recruiting, BTG Sports Group and SponsorX |

> **Why this phase exists (user, 2026-10-27).** Certified Recruiting's site,
> [certified-recruiting.com](https://www.certified-recruiting.com/), is already built on GoDaddy
> and is the partnership's main page. BTG's website already links to it: the "Recruiting" item in
> its menu. What is missing is a way in from SponsorX. The INFINEX game, Phase 5 until this date,
> is now Phase 6.

### The six phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 72 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md)  | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md) | 47 | 18–22 weeks |
| 5 | [`SponsorX-Phase5-Certified-Recruiting.md`](./SponsorX-Phase5-Certified-Recruiting.md) **← you are here** | 1 | not in the blueprint |
| 6 | [`SponsorX-Phase6-INFINEX-Game.md`](./SponsorX-Phase6-INFINEX-Game.md) | 7 | after the game's staging world exists |

Tracking, task fields and categories are the same as Phase 4's
([`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md)).
IDs are `5S{sprint}-{CAT}-{nn}`.

**One rule for anything SponsorX says about Certified Recruiting.** Scholarships, roster spots,
media coverage and sponsorships are potential opportunities, never promised, and nothing implies
that Certified Recruiting is affiliated with a college.

---

# The tasks

## Sprint 1 · Partner links

*A way from SponsorX to certified-recruiting.com.*

*1 task · 1 person-day*

### ▶ `5S1-FE-01` · Certified Recruiting card on SponsorX

**Order** 1 · **FE** · **Where:** Code · **1d** · **Ready**

A partner card that sends athletes to certified-recruiting.com, in two places:

1. **The home page** (`sponsorx.net`), in the "For athletes" section (`#for-athletes`).
2. **The athlete dashboard** (`/athlete`), below the existing sections.

The card carries Certified Recruiting's logo, from certified-recruiting.com, and this text:

- **Heading:** "Preparing for your next athletic opportunity?"
- **Line:** "Explore recruiting guidance through Certified Recruiting, a BTG partner."
- **Button:** **Explore Recruiting Support** → `https://www.certified-recruiting.com/`, opening in a new tab.

Use the existing card styles on each page. Fixed content only: no API call and no new route.

- **Depends on:** nothing
- **Done when:** Card shows on both pages, opens certified-recruiting.com, works on phone and desktop
- **Reference:** the partnership plan, 2026-10-27; certified-recruiting.com

---

*Plan of record for Phase 5 · Certified Recruiting Partnership. Daily tracking happens in `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (sheet `Phase 5`).*
