# SponsorX Virtual World Taxonomy

**Task `4S0-PMO-02` · Version 1.0 · 2026-10-16 · Phase 4, Sprint 0**

**What this is.** The names for the parts of a virtual world, and the
SponsorX records each one becomes. Getting the vocabulary right once saves
renaming the inventory model later. The rules a world must follow (stable IDs,
environments, anonymous players) are
[`SponsorX-INFINEX-World-Contract.md`](./SponsorX-INFINEX-World-Contract.md)
(`4S0-PMO-01`).

## 1 · Five levels

| Level | What it is | Example |
|---|---|---|
| **World** | One virtual place players visit, in one environment | "INFINEX Arena" (production) |
| **District** | A large area of a world | "North Plaza" |
| **Venue** | A building or ground inside a world or district | "Main Stadium" |
| **Zone** | A part of a venue (or of a district) where people gather | "East Stand", "Tunnel B" |
| **Surface** | One place a sponsor's brand can appear | "Scoreboard LED, East Stand" |

**Not every world uses every level.**
- **What a world can skip:** a small world can put venues straight under the
  world, or zones straight under a venue.
- **What it can't do:** nest a level inside a lower one (a district inside a
  venue, for example).
- **Allowed parents:**

| Level | Its parent can be |
|---|---|
| District | the world |
| Venue | a district, or the world |
| Zone | a venue, a district, or the world |
| Surface | a zone, a venue, a district, or the world |

## 2 · Three tables, not five

| Table | Holds | Task |
|---|---|---|
| `VirtualWorld` | the world, in its environment: owner, external ID, name, environment (`STAGING` / `PRODUCTION`), `runtime` and `runtimeVersion`, status (`ACTIVE` / `RETIRED`) | `4S1-BE-01` |
| `VirtualZone` | districts, venues and zones in one table: world, parent (another zone, or none for the world), `level` (`DISTRICT` / `VENUE` / `ZONE`), external ID, name, status | `4S1-BE-01` |
| `VirtualPlacement` | the surfaces: where they sit, kind, specs, viewability rule, capacity, price, availability, test status, state | `4S1-BE-02` |

**Why one table for three levels:** a world that adds or renames a level
changes data, not the database.

## 3 · Surfaces: placement kinds

| Kind | What it is | Creative it takes |
|---|---|---|
| `BILLBOARD` | A static board or poster | image |
| `LED_SCREEN` | A screen or ribbon board that can play motion | image or video |
| `NAMING_RIGHTS` | The name of a venue or zone ("The Brand X Arena") | logo image and name text |
| `BRANDED_ROOM` | A room or lounge dressed in a sponsor's brand | images (a set) |
| `COURT` | A playing surface or court marking | image (logo) |
| `TUNNEL` | A walkway or entrance players pass through | image or video |
| `KIOSK` | A stand players can walk up to and use | image, and an activation (`4S6-*`) |

**Every surface states its specs.** The creative check (`4S2-BE-02`) refuses
anything outside them:
- **size:** width and height in pixels, and the aspect ratio;
- **creative types allowed:** `IMAGE` (PNG / JPEG / WebP), `VIDEO` (MP4,
  H.264), `LOGO` (PNG with transparency);
- **limits:** the largest file, and the longest video;
- **capacity:** how many sponsors can share it at once (1 for most; a
  rotating screen may take more);
- **its viewability rule:** what counts as "seen" (for example 50% of it on
  screen for 1 second). Rules are versioned (`6S5-BE-01`).

## 4 · How each part maps to SponsorX

| World part | SponsorX record | State |
|---|---|---|
| The company that runs a world | `Property` of kind `VIRTUAL`, signed up through onboarding like any team or school | **exists** |
| World | `VirtualWorld`, owned by that property | `4S1-BE-01` |
| District, venue, zone | `VirtualZone` | `4S1-BE-01` |
| Surface | `VirtualPlacement` | `4S1-BE-02` |
| A surface for sale | an `InventoryItem` of kind `VIRTUAL_PLACEMENT`, owned by the world's property, with the surface's price and dates, one buyer per period, created and switched off automatically with the surface | `4S1-BE-03` |
| A booked week on a surface | `PlacementWindow`, inside a `Campaign`. The database refuses a second booking that overlaps. | `4S1-BE-04` |
| The sponsor's creative | `DeploymentAsset` (versioned) and `CreativeDeployment` (what shows where, when) | `4S2-*` |
| An in-world challenge | `Activation`, which points at an existing `Reward` | `4S6-*` |

**A campaign can hold virtual and real-world inventory together** (athletes,
ad slots, rewards and surfaces). Each part keeps its own status underneath the
one campaign (`4S7-BE-01`).

## 5 · Approval

**Approved 2026-10-16 by the user,** under the programme owner's delegated
authority, when the plan for it was approved. A change to these names is a
pull request to this file.
