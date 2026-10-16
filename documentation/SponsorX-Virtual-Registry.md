# SponsorX Virtual Registry

**Tasks `4S1-BE-01`, `4S1-BE-02`, `4S1-BE-03`, `4S1-BE-04` · Version 1.1 · 2026-10-16 · Phase 4, Sprint 1**

This is how SponsorX records virtual worlds and their surfaces, and puts a
surface on sale. The names come from
[`SponsorX-Virtual-Taxonomy.md`](./SponsorX-Virtual-Taxonomy.md) and the rules
any world follows from
[`SponsorX-INFINEX-World-Contract.md`](./SponsorX-INFINEX-World-Contract.md).

## 1 · Worlds and zones (`4S1-BE-01`)

**A world** belongs to a property of kind `VIRTUAL` (a world operator, signed
up through onboarding).
- **One record per environment,** `STAGING` or `PRODUCTION`, under the
  owner's external ID.
- **The same ID** can be used once in each environment.
- **Runtime fields:** `runtime` and `runtimeVersion` describe it for people.
- **Retiring a world** retires its zones and takes its placements off sale.
  It is final.

**Zones** (districts, venues and zones) arrive in one call:
`PUT /virtual/worlds/{worldId}/zones`.
- **How the call works:** it upserts by external ID, which is how a world's
  map is imported and kept up to date.
- **New zones** are created under an allowed parent (the taxonomy's §1),
  parents first, whatever order they are sent in.
- **Known zones** can be renamed or retired. A zone's level and parent never
  change; a zone somewhere else is a new zone with a new ID.
- **All or nothing:** one problem refuses the whole call, and every problem
  is listed.

## 2 · Placements (`4S1-BE-02`)

**A placement** (a surface) is registered in a world, optionally in a zone,
as a **draft**:
- its kind;
- its size in pixels, and the creative types it takes (each kind takes its
  own);
- the largest file, and the longest video (only for a placement that takes
  video);
- its capacity (sponsors at once, 1 for most);
- its **list price per week**: a booked window costs this × days ÷ 7 (§4);
- its **viewability rule** (a versioned rule with a default per kind, for
  example `video-50pct-2s@1`: half of it on screen for 2 seconds);
- the dates it is available.

**It also carries a test status,** `UNTESTED` until Phase 5's staging test
(`5S1-QA-01`).

**What can change, and when:**
- **The name, price, capacity and dates:** any time until it retires.
- **The specs** (size, creative types, limits, rule): only while it is a
  draft, because sponsors buy against them.

## 3 · On sale (`4S1-BE-03`)

**Putting it on sale:** `POST /virtual/placements/{placementId}/publish`.

**When it may go on sale:**
- it is a draft;
- its world is a **production** world, and active;
- its zone is active;
- BTG has approved the world's owner to sell (onboarding).

Otherwise the request is refused with every reason.

**Going on sale, in one step:**
- **One inventory item is created:** kind `VIRTUAL_PLACEMENT`, owned by the
  world's property, at the placement's price and dates, described with its
  specs, and limited to one buyer per period when the capacity is 1.
- **The placement becomes `AVAILABLE`,** linked to that item.

**SponsorX keeps the item in step with the placement:**
- a price or date change on the placement updates the item;
- retiring the placement switches the item off.

**The owner cannot change the item, or list it on the marketplace.** A
placement is booked by the week inside a campaign (§4).

## 4 · Booking windows (`4S1-BE-04`)

**Done when:** overlapping purchases of the same placement are rejected.

**A window books an on-sale placement for whole days** (midnight UTC to
midnight UTC) inside a campaign:
- **the campaign:** a draft, the same rule as for magazine ad slots;
- **the days:** within the campaign's dates (its last day counts) and the
  placement's availability; 1 to 365 days;
- **the price, frozen at booking:** the list price per week × days ÷ 7, to
  the cent;
- **the slot:** one of the placement's capacity slots, the first free for
  every day of the window.

**The overlap rule is the database's.** An exclusion constraint
(`PlacementWindow_no_overlap`) refuses a second booked window on the same
placement and slot over any shared day. So the same billboard is never sold
twice for the same week, even when two bookings race. The one that loses
gets 409.
- **Days are half-open:** a week ending as the next begins is not an overlap.
- **A campaign cannot hold the same placement twice** on the same days.

**Giving days back:**
- **while the campaign is a draft:** release the window, with a reason;
- **when the campaign is cancelled:** all its windows are released in the
  same step that cancels it;
- **after that** (once the campaign has moved on), it keeps its placements.

A released window stays, marked with when and why.

**Retiring:** a placement, or a world, with booked days still to come cannot
be retired. Release the windows, or cancel their campaigns, first.

**Who:** whoever may write the campaign (campaign managers and BTG admins)
books and releases. Whoever may read the placement sees its windows. Every
booking and release is audited.

**Not yet in the money ledger.** A booking isn't recorded as a sale fact yet,
so it doesn't appear in the campaign's figures, the sponsor report or the
nightly fact check. Virtual inventory joins the campaign's reporting in
`4S7-BE-01` / `4S7-DATA-01`.

## 5 · Fixed IDs, held by the database

A trigger (`virtual_ids_are_fixed`) refuses:
- changing an external ID;
- moving a world to another owner or environment;
- moving a zone to another level or parent;
- moving a placement;
- bringing a retired placement back;
- deleting anything. A retired row stays, so its ID is never reused.

CHECK constraints hold the vocabulary:
- the environments, levels, kinds, states and creative types;
- the ID format;
- video length only with video;
- positive sizes and prices;
- an `AVAILABLE` placement always has its inventory item.

## 6 · Who

`virtualWorld`, RBAC matrix §37 (booking follows campaign write, §4):
- **BTG admins** register, change, put on sale and retire.
- **Campaign managers and Sales** read.
- **A world's owner** reads its own worlds.

Every write is audited (`virtual.*`).

## 7 · Endpoints

| Method + path | What it does |
|---|---|
| `GET /virtual/worlds` | the worlds the caller may see, with zone and placement counts |
| `POST /virtual/worlds` | register a world |
| `GET /virtual/worlds/{worldId}` | a world, its zones and its placements |
| `PATCH /virtual/worlds/{worldId}` | rename, record its runtime, or retire |
| `PUT /virtual/worlds/{worldId}/zones` | upsert its zones |
| `POST /virtual/worlds/{worldId}/placements` | register a placement (draft) |
| `GET /virtual/placements/{placementId}` | one placement |
| `PATCH /virtual/placements/{placementId}` | change a placement |
| `POST /virtual/placements/{placementId}/publish` | put it on sale |
| `POST /virtual/placements/{placementId}/retire` | retire it |
| `GET /virtual/placements/{placementId}/windows` | its booked (and released) windows, and its capacity |
| `POST /virtual/placements/{placementId}/windows` | book it for days inside a campaign |
| `POST /virtual/windows/{windowId}/release` | give a window's days back |

## 8 · Where it lives

- `backend/src/domain/virtual-rules.ts`: the vocabulary and its rules (pure).
- `backend/src/domain/virtual-registry.ts`: worlds, zones, placements, on
  sale.
- `backend/src/domain/virtual-bookings.ts`: booking windows; released on
  campaign cancel (`campaign-stages.ts`).
- `backend/src/routes/v1/virtual.ts`, `backend/src/contracts/virtual.ts`.
- **Migrations:** `20261016150000_virtual_registry`,
  `20261016170000_placement_windows`.
- **Proof:** `backend/tests/virtual-registry.test.ts` and
  `backend/tests/virtual-bookings.test.ts`.
