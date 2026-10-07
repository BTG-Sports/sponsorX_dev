# Admin Operations Board — "Mission Control" stage (P1-ART-14)

**Date:** 2026-10-05 · **Raised by:** programme owner · **Scope:** `/admin` (the
Operations Board, P7-FE-06) only. The admin shell and the other admin desks
are unchanged.

## Goal

Redesign `/admin` in the visual language of the landing, /packages, /join and
/login: a fixed-dark heads-up-display stage with motion, so the first screen
BTG staff see has the same wow factor as the public site. No new figures; every
number stays one of the three live reads the page makes today.

Approved direction: **A · Mission Control**, **full bleed** (mockups in
`.superpowers/brainstorm/`, `direction.html`, `framing.html`, `design-v1.html`).

## Layout

The stage cancels the shell's `<main>` padding (`-mx-6 -my-6`) and fills the
content column edge to edge, at least the viewport height under the 62px
header. It is fixed-dark in both themes (the `--sx-on-media` rule, as on
/login): inks are `on-media` or fixed-dark literals, never themed tokens.

Back to front:

1. **Ground**: brand glows (blue top-left, orange bottom-right), a light
   that follows the pointer (`--px`/`--py`), a receding floor grid that drifts
   and leans against the pointer (`--tx`), rising motes, a slow scan sweep, a
   faint outlined `OPS` wordmark. All `aria-hidden`, all `pointer-events-none`.
2. **Hero** (two columns from lg; ring beside headline, smaller, below lg):
   - eyebrow: live dot · `BTG · OPERATIONS · LIVE` (scrambled in) ·
     provenance pill `POSTGRES · READ {time}`;
   - headline, masked line wipes: "**{N} things need / BTG's hand today.**"
     with "BTG's hand" in `.sx-hero-gradient` + shimmer and "today." in
     `.sx-hero-gradient-accent`;
   - dek: "Every figure on this board is a live read. Each panel opens the
     desk it counts.";
   - **action ring**: SVG, one arc per visible queue, length ∝ count, 4px gaps,
     colours by queue (applications `#2e9bf5`, approvals `#9be0ff`, briefs
     `#fb923c`, finance `#f97a1f`), arcs draw in staggered; centre shows the
     total (count-up) over "ACTIONS WAITING"; a slow dashed orbit ring.
3. **Needs BTG action**: one chamfered glass card per queue the role reads
   (unchanged `queueCards` + `mayUse` filter). Card: big count-up number,
   index `01..04`, label, hint, existing chips, arrow; a 3px foot strip in the
   queue's ring colour. Hover/focus: brackets grow and light, outline
   spotlight follows the pointer, card lifts 4px. No tilt (click targets).
   4 columns from xl, 2 below.
4. **Lower row** (`1fr | 380px` from lg, stacked below):
   - **Live campaigns · {total}** + "All campaigns →": chamfered glass panel,
     one row per campaign line: monogram in a chamfered orange chip, name,
     `{n} overdue` chip, glowing progress bar that grows in (with a bright
     head), "x of y deliverables done · Ends …", big `%` done. Empty state:
     "No live campaigns yet" + "Open Briefs →". Outside role: one line.
   - **Systems** + "Integrations →": one row per `healthRows` entry with a
     status LED (Operational green, breathing; Syncing blue; Degraded amber,
     faster; Down red, fastest), name, detail, mono status label; the Zoho
     note as the panel foot. Outside role: one line.

## Copy and states

Two pure helpers in `lib/ops-board-live.ts`, unit-tested:

- `boardHeadline(total)` → `{ lead, hand, tail }` pieces:
  0 → "All clear." variant ("Nothing needs / BTG's hand right now."),
  1 → "1 thing needs", n → "n things need".
- `ringSegments(cards, gapLen, circumference)` → per card `{ key, len,
  offset }`; cards with count 0 get no arc; total 0 → no segments (the ring
  shows a calm full track with a ✓ in the centre).

Role variants: no `board` read → no hero total/ring (headline "Operations,
live."), no cards section. Delivery or integration health null → that panel is
replaced by its existing "outside your role" line. Non-OK reads still throw to
`admin/error.tsx`.

## Architecture

- `app/(app)/admin/(board)/page.tsx`: the page, moved into a route group so it
  gets its own `loading.tsx` (a dark skeleton of the stage) without changing
  the loading screen of the other desks. Reads, `requirePortalAccess`, and
  the `mayUse` filter are unchanged.
- `app/(app)/admin/(board)/loading.tsx`: dark stage skeleton.
- `components/ops-stage.tsx`: server components: `OpsGround`, `OpsHero`,
  `ActionRing`, `QueueDeck`, `CampaignPanel`, `SystemsPanel`.
- `components/ops-fx.tsx`: client islands:
  - `OpsStage`: root. On mount sets `data-armed` then `data-in` on the next
    frame (the portal has no boot screen, so it can't wait for
    `html[data-sx-loaded]`); writes `--px/--py/--tx/--ty` with a fine pointer,
    one write a frame; writes `--mx/--my` onto the hovered `[data-spot]` card.
  - `OpsCount`: count-up on `data-in` (ease-out, ~1.3s), final value under
    reduced motion; the real number is server-rendered so no-JS shows it.
  - `ScrambleText` gets an optional `immediate` prop so the eyebrow scrambles
    without the landing flag.
- CSS: one scoped `.sx-ops` block in `globals.css`. Entrance rules apply only
  under `[data-sx-ops][data-armed]`, so without JS nothing is hidden. Under
  `prefers-reduced-motion`: no entrance, sweep, drift, motes, pulses or
  pointer effects.

## Accessibility

Headline is one `<h1>` whose text reads naturally ("23 things need BTG's
hand today."). Decorative layers `aria-hidden`. The ring is `role="img"` with
an `aria-label` listing each queue's count. Cards keep visible focus
(`focus-visible` lights the brackets like hover). Contrast: body text ≥ 4.5:1
on the darkest ground.

## Verification

- Unit tests for `boardHeadline` and `ringSegments` in
  `frontend/tests/gap-screens-live.test.ts`; existing P7-FE-06 tests stay green.
- `npm run build`, lint and frontend tests in a detached worktree.
- Browser walk as BTG_ADMIN and FINANCE, light and dark, 1440 and 390 wide,
  plus a reduced-motion pass; no horizontal overflow at 390.
