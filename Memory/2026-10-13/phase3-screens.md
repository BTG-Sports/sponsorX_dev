# 2026-10-13

## HeckerCreatives — Phase 3 frontend: 3S0-FE-01 (Code review) and the ten Phase 3 screens (In progress)

Branch `feature/3S-FE-phase3-screens`, cut from `main_development` at e6bb8a8 (after rcfworks' 3S1-DATA-02 landed).

**The owner's decision: "FE only, honest empty states."** The ten Phase 3 screens each read an engine that the backend chain (rcfworks) has not built yet. They are built as live code against a proposed contract, and until an engine's route is mounted the screen says so — naming the engine and the tasks it waits on — and shows **no number at all**. A placeholder figure would break the "every stat needs a real source" rule. The other options were rejected: building thin engines ourselves (would collide with rcfworks' chain) and Phase-1-style fixtures (numbers with no source).

- **3S0-FE-01 · reward venue — Code review.**
  - The venue (city and US state) is on the **live** creator in `live-rewards-desk.tsx`, which is what calls `createRewardAction`. `reward-creator.tsx` is only the demo wizard; it got the same field through the shared `reward-venue-fields.tsx`.
  - Half a venue is refused in the form and again in the action. Each reward shows "City, ST" or "Online only".
  - The state list mirrors the backend's `US_STATES` (50 + DC). Test: `tests/reward-venue.test.ts`.
- **The foundation:**
  - `lib/intelligence.ts` — the engine registry (`ENGINES`, one per screen: what it waits on, what will appear, a plain sentence for sponsors and properties), `ModelStamp` and confidence bands, the four attribution classes, `routeMissing`.
  - `server/engine.ts`:
    - `readEngine` returns live, pending, or throws;
    - `readEngineItem` adds "absent" for a mounted route's own 404, on detail pages;
    - `writeEngine` makes the writes;
    - `wantsSample` handles `?demo=sample`, which works **outside production only**.
  - `components/engine-pending.tsx` — `EnginePending` (staff see the tasks and the route; sponsors and properties see one plain sentence) and `SampleBanner`.
  - **"Pending" means only** the API's catch-all `404 {error:{code:"not_found"}}` with no message, or a `501`. Every other failure is a real error. An outage never reads as "coming soon".
- **The screens** (admin nav: a new **Intelligence** group, roles per desk in `lib/admin-access.ts`):

  | Task | Route | Waits on |
  |---|---|---|
  | 3S2-FE-01 | `/admin/intelligence/pricing` (+ `/[inventoryId]`) | 3S2-BE-02 |
  | 3S3-FE-01 | `/admin/intelligence/matching` — brief picker reads the live `GET /briefs` | 3S3-BE-02 |
  | 3S4-FE-01 | `/admin/intelligence/forecasts` (+ `/[campaignId]`) | 3S4-BE-01 |
  | 3S5-FE-01 | `/admin/intelligence/make-goods` | 3S5-BE-01 |
  | 3S6-FE-01 | `/admin/intelligence/attribution` | 3S6-BE-02 |
  | 3S7-FE-01 | `/sponsor/intelligence` (Stadium Board kit, sponsor wording) | 3S7-BE-02 |
  | 3S7-FE-02 | `/property/intelligence` | 3S7-BE-02 |
  | 3S7-FE-03 | `/admin/intelligence/scenarios` | 3S7-BE-01 |
  | 3S8-FE-01 | `/admin/intelligence/anomalies` | 3S8-DATA-01 |
  | 3S8-FE-02 | `/admin/intelligence/models` (BTG admins only) | 3S8-BE-01 |

- **For rcfworks: `documentation/SponsorX-Phase3-Screen-Contracts.md`** lists every endpoint, shape and role the screens expect. Mount a route and its screen lights up; answer 501 to keep it dark on purpose. If a shape moves, change the screen's `lib/*-live.ts` and the doc in the same pull request. Decisions in there that need a backend or policy answer:
  - pricing: an override reason of 10–500 characters, refused below the floor; a small sample is under 10 sales;
  - every model-registry write carries a `reason`;
  - only a *validated* version can be activated, and only a *retired* one rolled back to — the screen's reading of 3S0-PMO-02, which isn't written yet;
  - make-good approve answers 409 when an option fails a check.
- **Raised: 3S7-BE-02 · Serve sponsor and property intelligence** (Order 30.5, 3d, Blocked on 3S1-DATA-02 and 3S2-BE-02). Both hubs depend on warehouse facts, but no task served them. Added to the plan doc, the tracker (Dashboard, autofilter, conditional formatting and validation extended to row 56) and the screens' dependencies.
- **Why the ten are "In progress", not Done:** their acceptance criteria need engine data. Each closes when its engine lands and the screen is walked against it.
- **Verified** (worktree, while the owner's dev tree was untouched):
  - `next build` green, all 12 new routes listed;
  - `tsc` clean, `eslint . --max-warnings=0` clean;
  - vitest **138 files / 1516 tests**;
  - new test files: `intelligence`, `reward-venue`, `pricing-live`, `match-explorer-live`, `scenarios-live`, `forecast-live`, `makegood-live`, `attribution-live`, `anomalies-live`, `models-live`, `intelligence-hubs`.
- **Not yet done: a browser walk.** Docker and the API weren't running. Every page needs a signed-in user and `/me`.
- **Stage Progress:** the 2026-10-13 row is appended. The figures are unchanged from the 12th, because no Phase 1 task moved today.
