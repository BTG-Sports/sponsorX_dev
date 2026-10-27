# SponsorX — Phase 5 · Certified Recruiting Partnership

**BTG SPORTS GROUP · SPONSORX · PHASE 5 · CERTIFIED RECRUITING PARTNERSHIP**

| | |
|---|---|
| **Goal** | Give Certified Recruiting a landing page inside BTG's website, so athletes on BTG's pathway find recruiting support, with BTG Sports Group and SponsorX shown as partners. |
| **Tasks** | 2 · 2 person-days |
| **Timeline** | Now; publishing waits for Certified Recruiting's approved services |
| **Depends on** | Certified Recruiting's logo files and approved services (`5S1-PMO-01`), and editor access to BTG's WordPress |
| **Source** | The user, 2026-10-27: a partnership plan written outside the team, step 1 of 4 |

> **Why this phase exists (user, 2026-10-27).** Certified Recruiting already has its own site,
> [certified-recruiting.com](https://www.certified-recruiting.com/), built on GoDaddy. The partnership
> plan has four steps: (1) a main landing page on BTG's website, (2) links to it from BTG's menu,
> homepage, Athletes page and inquiry form, (3) a Certified Recruiting partner card on SponsorX, and
> (4) one shared inquiry form that records which site the athlete came from. The user chose step 1
> first. Steps 2–4 are raised as tasks when the user starts them. The INFINEX game, Phase 5 until
> this date, is now Phase 6.

### The six phase documents

| Phase | File | Tasks | Timeline |
|---|---|---|---|
| 1 | [`SponsorX-Phase1-Managed-Marketplace.md`](./SponsorX-Phase1-Managed-Marketplace.md)  | 186 | 14–18 weeks |
| 2 | [`SponsorX-Phase2-Marketplace-Commerce.md`](./SponsorX-Phase2-Marketplace-Commerce.md)  | 72 | 16–20 weeks |
| 3 | [`SponsorX-Phase3-Intelligence-Attribution.md`](./SponsorX-Phase3-Intelligence-Attribution.md)  | 44 | 18–22 weeks |
| 4 | [`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md) | 47 | 18–22 weeks |
| 5 | [`SponsorX-Phase5-Certified-Recruiting.md`](./SponsorX-Phase5-Certified-Recruiting.md) **← you are here** | 2 | not in the blueprint |
| 6 | [`SponsorX-Phase6-INFINEX-Game.md`](./SponsorX-Phase6-INFINEX-Game.md) | 7 | after the game's staging world exists |

Tracking, task fields and categories are the same as Phase 4's
([`SponsorX-Phase4-INFINEX-Integration.md`](./SponsorX-Phase4-INFINEX-Integration.md)).
IDs are `5S{sprint}-{CAT}-{nn}`.

**One rule for every page in this phase.** Scholarships, roster spots, media coverage and
sponsorships are described as potential opportunities, never promised, and nothing implies that
Certified Recruiting is affiliated with a college. Each service is labelled free, paid or
application-based.

---

# The tasks

## Sprint 1 · Landing page

*Certified Recruiting's main page on BTG's website, built now and published once its services are confirmed.*

*2 tasks · 2 person-days*

### ▶ `5S1-PMO-01` · Get Certified Recruiting's inputs

**Order** 1 · **PMO** · **Where:** Document · **1d** · **Ready**

Ask Certified Recruiting for what the page cannot publish without, and record the answers here:

- logo files and any co-branding rules;
- the final list of services at launch, each marked free, paid or application-based;
- who receives athlete inquiries, and how quickly they reply.

It blocks publishing `5S1-FE-01`, not building it.

- **Depends on:** nothing
- **Done when:** Inputs received and written into this document
- **Reference:** the partnership plan, 2026-10-27

### ▶ `5S1-FE-01` · Certified Recruiting page on BTG site

**Order** 2 · **FE** · **Where:** Vendor console · **1d** · **Ready**

A new WordPress page on btgsportsgroup.com at `/certified-recruiting`. Certified Recruiting's branding
leads; BTG Sports Group and SponsorX appear in an "In partnership with" strip under the hero. Use
the logo from certified-recruiting.com until `5S1-PMO-01` brings the final files.

1. **Hero.** Headline "Your Talent. Your Story. Your Next Opportunity." Intro "Explore recruiting
   guidance, athlete exposure, media development, and brand readiness through Certified
   Recruiting's partnership with BTG Sports Group and SponsorX." Main button **Request a Recruiting
   Review** → `https://www.certified-recruiting.com/recruiting-review` (until the shared form of
   step 4 exists). Smaller links **Explore BTG Events** → `https://btgsportsgroup.com/events/` and
   **Discover SponsorX** → `https://sponsorx.net`.
2. **Services.** Six cards, each with a title, one line from the matching card on
   certified-recruiting.com, a "Led by" tag and a price label:

   | Service | Led by | Label |
   |---|---|---|
   | Recruiting readiness review and action plan | Certified Recruiting | Paid |
   | Athlete recruiting profile and college outreach preparation | Certified Recruiting | Free to submit |
   | Highlight films, interviews and athlete storytelling | BTG | To be confirmed |
   | Showcase and event opportunities | BTG | Application-based |
   | Athlete branding and sponsor readiness | SponsorX | To be confirmed |
   | Parent education and recruiting workshops | Joint | To be confirmed |

3. **Disclaimer,** word for word, under the services: "Opportunities described — including
   scholarships, roster spots, media coverage and sponsorships — represent potential outcomes. No
   specific results are guaranteed. Certified Recruiting is not affiliated with any college or
   university."
4. **Closing band.** "Ready to take the next step?" with the **Request a Recruiting Review** button.

Not in this task: BTG's menu, homepage and Athletes page (step 2), any form (step 4), and any
statistic Certified Recruiting has not confirmed.

- **Depends on:** 5S1-PMO-01, to publish only
- **Done when:** Built, works on phone and desktop, links work, preview link shared; published once `5S1-PMO-01` is done
- **Reference:** the partnership plan, 2026-10-27; certified-recruiting.com

---

*Plan of record for Phase 5 · Certified Recruiting Partnership. Daily tracking happens in `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (sheet `Phase 5`).*
