# SponsorX NEXT — rate card and revenue split (P9-PMO-01)

| | |
|---|---|
| **Task** | `P9-PMO-01` · Confirm the NEXT rate card and revenue split |
| **Date** | 2026-09-25 · rcfworks |
| **Status** | **SIMULATED.** These are working numbers, chosen so the build can proceed. BTG replaces them with its own when it prices edition one — change them here, and in `backend/src/domain/sponsor-packages.ts`, in the same pull request. |
| **Acceptance** | Slot prices and the four-way split signed off as numbers, not ranges; the back cover and presenting sponsor recorded as quantity one |

## Why these numbers

The spec's §10 economics assume **20 advertisers × $500** and **2 feature
sponsors × $1,500** per edition, per school. The rate card is built so those
two figures are real products: the half page is $500, and the Local Business
Package is $1,500. The slot prices are the ones the NEXT screens already show
(`SLOT_RACK_CENTS` in the frontend fixtures), so the screens and the catalogue
agree.

## Rate card — per edition, per school

Every price is a single number. A slot's sale value can differ from its rack
price when an add-on is sold with it, but the rack price itself is fixed.

| Code | What the sponsor buys | Price | Quantity per edition |
|---|---|---|---|
| `NEXT-AD-QUARTER` | Quarter-page ad | **$250** | Several |
| `NEXT-AD-HALF` | Half-page ad | **$500** | Several |
| `NEXT-AD-FULL` | Full-page ad | **$800** | Several |
| `NEXT-AD-BACK-COVER` | Back cover ad | **$1,000** | **1** |
| `NEXT-PRESENTING` | Presenting sponsor ("presented by" on the masthead, cover and digital edition) | **$3,000** | **1** |
| `NEXT-LOCAL-1500` | Local Business Package: full-page ad, one sponsored feature, four student-created social posts, and a basic report | **$1,500** | Several |

The back cover and the presenting sponsor are **quantity one**: one per
edition, and unsellable after the edition's close date. The catalogue records
the quantity now. The inventory ledger (`P9-BE-03`) is what will enforce it.

**No athlete is involved in any of these.** The social posts are
student-created (spec §0), so no package has an NIL job line, an athlete
count, or an athlete cost. That is why the margin floor never applies to
them: there is nothing to price against.

## Revenue split — of each edition's revenue

| Payee | Share |
|---|---|
| SponsorX (production, print, sales operations, platform) | **40%** |
| The school's programme | **30%** |
| Student pool (funds the points programme, never paid to a student directly) | **20%** |
| Editorial fund (equipment and section budgets) | **10%** |
| **Total** | **100%** |

This differs from the source document's illustration of 35/25/25/15. It
matches the split the revenue-splits screen (`P1-FE-23`) already shows. It
also gives SponsorX the larger share, because SponsorX carries production and
print cost (spec §5.2 makes production SponsorX's decision).

## The regional (DMV) edition's school share — also SIMULATED

A regional edition draws from several schools. Its **school share** (the
30% above) is divided **50 / 50** into two pools, resolved by formula when
the edition publishes (`P9-BE-14`):

| Pool | Split between schools by |
|---|---|
| **Sales** (50%) | Each school's students' attributed sales in that edition |
| **Content** (50%) | Content units: feature 5, photo package 3, interview 3, video 5 |

A school with no content in the edition gets nothing from the content pool.
Nobody adjusts the result after publication.

## Where this is used

- **`P9-BE-01`**: the six NEXT products above are seeded as catalogue packages.
- **`P9-BE-03`**: the inventory ledger enforces quantity one and the close date.
- **`P9-BE-06`**: the revenue split is attached to each edition.
- **`P9-BE-14`**: the DMV school pools above.
