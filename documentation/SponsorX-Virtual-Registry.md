# SponsorX Virtual Registry

**Tasks `4S1-BE-01`…`04` (Sprint 1), `4S2-BE-01`…`03` (Sprint 2) · Version 1.2 · 2026-10-16 · Phase 4**

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

**It also carries a test status,** `UNTESTED` until Phase 6's staging test
(`6S1-QA-01`).

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

**In the money ledger (`4S7-BE-01`).** A booking is a `PLACEMENT_WINDOW_BOOKED`
fact on its campaign, at its frozen price, beside the campaign's orders and
ad slots; giving the days back reverses it on the release day. So it counts
once in the campaign's figures, the nightly fact check, the sponsor's spend
and the sponsor report (its `virtualPlacements`). A window belongs to a real
campaign (a foreign key). A campaign holding only INFINEX placements has
nothing to staff, so it may go DRAFT → APPROVAL as an ad-only one does; a
campaign with athlete work is still staffed. Counting a fan once across
channels is `6S7-DATA-01`.

## 5 · Creative, checked against the placement (`4S2-BE-02`)

**Done when:** an asset failing the placement's technical constraints is
rejected at upload.

**How creative arrives:**
- A campaign's booked window (§4) takes the sponsor's creative. The file goes
  straight to the private bucket, the same way deliverables and ad-slot
  artwork do.
- The upload is signed for one file type (PNG, JPEG, WebP or MP4) and one
  exact size, up to the placement's largest file.
- Registering it is the confirm step:
  - the stored file must be what the upload was signed for, or it is deleted
    and refused (`storage.checkPrivateUpload`);
  - it then becomes the window's next **version**.

**What is checked, against the placement:**
- a creative type the placement takes, and a matching file type (a logo is a
  PNG);
- **exactly** the placement's pixels;
- no bigger than its largest file;
- a video no longer than its longest video.

**SponsorX reads the stored file rather than trusting what the uploader
says:** its size, its checksum (SHA-256) and, for an image, its real pixels
and format. An image's declared size is ignored, and a JPEG sent as a PNG is
caught.
- **A video's pixels and length are as declared.** The API has no video
  reader, and adding one would be a new dependency.

**A version that fails** is `REJECTED`, with every reason. It is kept as a
record (the API answers 422), its file is deleted, and it can never be
deployed. One that passes is `VALIDATED`.

## 6 · Deployments (`4S2-BE-01`)

**Done when:** a deployment record ties campaign, placement, asset version
and schedule.

**What a deployment is:** the campaign's booked window, one `VALIDATED`
creative version, and the dates it runs. By default those are the window's
dates; narrower ones must fall inside it.

**Its states:** `DRAFT` → `APPROVED` → `ENDED`, and, since `4S2-BE-05`,
`PAUSED` and `ROLLED_BACK`.

**Approving checks everything again, at that moment:**
- the window is still booked;
- the placement is on sale;
- the world is active;
- the campaign is not cancelled;
- the creative is validated.

**One creative at a time on a window:** the database refuses two approved
deployments on the same window at overlapping times
(`CreativeDeployment_no_overlap`).

**Every change of state:**
- bumps the deployment's `sequence` and its world's `manifestVersion`;
- is audited.

**A window given back** (released, or its campaign cancelled) ends its
deployments, with the reason. What was already rolled back stays as it was.

### 6.1 · Pause, resume and roll back (`4S2-BE-05`)

**Done when:** creative can be paused or rolled back from SponsorX without
redeploying the INFINEX application. The manifest shows only `APPROVED`
deployments, so each of these takes effect on the world's next poll (its
`ttlSeconds` is 60). Each bumps the world's `manifestVersion`, so the ETag
changes, and each is audited.

- **Pause** (`APPROVED` → `PAUSED`, with the reason): off the world. No new
  download link is handed out for it. A link already handed out lapses within
  15 minutes (§7). `pausedAt` and `stateReason` say when and why.
- **Resume** (`PAUSED` → `APPROVED`): checked again as an approval is. It is
  refused if another approved deployment has taken those days meanwhile
  (the database's one-at-a-time rule).
- **Roll back** (per window, with the reason): the running or paused
  deployment becomes `ROLLED_BACK`. An earlier `VALIDATED` version (the one
  named, or else the newest older than the running one) goes on the world,
  approved, from now to the old end, in one transaction. The old one records
  `rolledBackAt`, `stateReason` and `replacedById`. Naming a newer version
  rolls forward the same way.
- **Refused:** pausing what isn't approved, resuming what isn't paused,
  rolling back with nothing running or no earlier version, or to the version
  already running, and ending a rolled-back deployment (end its replacement
  instead).
- **The database** requires a paused deployment to carry when and why, and a
  rolled-back one when, why and what replaced it
  (`CreativeDeployment_pause_rollback_check`).

## 7 · The manifest (`4S2-BE-03`)

**Done when:** the manifest returns only approved, in-window deployments for
the requested world and time.

**Where:** `GET /virtual/worlds/{worldId}/manifest?at=` (default: now).

**It returns only deployments that are all of these:**
- `APPROVED`, and inside their dates at `at`;
- on a booked window;
- on a placement that is on sale;
- showing validated creative;
- in an active world.

**Each entry carries:**
- the placement's external ID;
- the deployment and its `sequence`;
- the campaign;
- the creative's ID, version, file type, checksum and pixels;
- its dates.

**The manifest carries the world's `manifestVersion` and an ETag.**
- A world sends the ETag back as `If-None-Match`.
- While nothing it would show has changed, the answer is 304.
- A world takes the latest manifest; it never needs the history.

**Download links (`4S2-BE-04`).** Each file comes with `url`, a signed link
to the private bucket, and `urlExpiresAt`.
- **Short-lived:** a link lives 15 minutes, the storage-wide maximum.
- **Stepped:** links are signed at the start of each 5-minute step, so every
  link a world is handed is good for at least 10 minutes, and every link
  minted in one step is the same string.
- **Fits the ETag:** the ETag covers what the world shows and the step. A
  poll inside one step that changes nothing gets 304, and nothing is signed;
  the step turning hands out fresh links before the old ones lapse.
- **Can't be lifted:** a link fetches only its own file, and only until it
  expires.
- **Audited:** one `virtual.creativeLinksGrant` row per grant, naming the
  keys, never the links (they are the credential).
- **Served by Cloudflare R2.** The links point at R2 directly; they are not
  cached at the edge. If the load test (`6S4-OPS-02`) shows that is too slow,
  a caching layer in front is a separate task.

**Still to come:**
- **The game's own call** needs its machine login (`4S0-SEC-01`). Until then
  BTG staff, a world's owner and the stand-in world read the manifest through
  `virtualWorld`.

**Who** uploads creative and deploys it: whoever may write the campaign (BTG
admins, campaign managers). Sales and sponsors may not yet; a sponsor's own
upload is a later step.

## 8 · Fixed IDs, held by the database

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

## 9 · Who

`virtualWorld`, RBAC matrix §37 (booking, creative and deployments follow campaign write, §4–§6):
- **BTG admins** register, change, put on sale and retire.
- **Campaign managers and Sales** read.
- **A world's owner** reads its own worlds.

Every write is audited (`virtual.*`).

## 10 · Endpoints

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
| `POST /virtual/windows/{windowId}/assets/uploads` | a direct upload of the window's creative |
| `POST /virtual/windows/{windowId}/assets` | register it as the next version, checked against the placement |
| `GET /virtual/windows/{windowId}/assets` | the window's creative versions and deployments |
| `POST /virtual/windows/{windowId}/deployments` | deploy a validated version (draft) |
| `POST /virtual/deployments/{deploymentId}/approve` | approve it: into the manifest for its dates |
| `POST /virtual/deployments/{deploymentId}/end` | end it, with the reason |
| `POST /virtual/deployments/{deploymentId}/pause` | pause it, with the reason: off the world on the next poll (`4S2-BE-05`) |
| `POST /virtual/deployments/{deploymentId}/resume` | resume it, checked again (`4S2-BE-05`) |
| `POST /virtual/windows/{windowId}/rollback` | roll the window back to an earlier version, with the reason (`4S2-BE-05`) |
| `GET /virtual/worlds/{worldId}/manifest` | what the world shows at a given time |

## 11 · Where it lives

- `backend/src/domain/virtual-rules.ts`: the vocabulary and its rules (pure).
- `backend/src/domain/virtual-registry.ts`: worlds, zones, placements, on
  sale.
- `backend/src/domain/virtual-bookings.ts`: booking windows; released on
  campaign cancel (`campaign-stages.ts`).
- `backend/src/domain/virtual-creative.ts`: creative, deployments, the
  manifest.
- `backend/src/routes/v1/virtual.ts`, `backend/src/contracts/virtual.ts`.
- **Migrations:** `20261016150000_virtual_registry`,
  `20261016170000_placement_windows`, `20261016190000_creative_deployments`.
- **Proof:** `backend/tests/virtual-registry.test.ts`,
  `backend/tests/virtual-bookings.test.ts` and
  `backend/tests/virtual-creative.test.ts`.
