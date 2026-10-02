/* --------------------------------------------------------------------------
   Page transition (P1-ART-12) — the pure parts: which navigations get the
   transition, what the destination is called, and the X geometry.

   The public site has two loading screens. The first (P1-ART-11,
   components/landing-loader.tsx) is the boot screen: it plays once per
   document, on a hard load or refresh of any public page. The second
   (components/page-transition.tsx) plays on every client-side move between
   public pages: the brand's X grows out of the click point in three layers
   (orange, blue, ink) until it covers the screen, the destination's name
   rises in, and then an X-shaped hole tears open in the middle and widens
   until the new page is all there is.

   Both shapes are `clip-path: polygon()` lists with a fixed point count so
   the Web Animations API can interpolate them: 12 points for the X, and for
   the hole the viewport rectangle, a zero-width bridge and the same 12
   points under `evenodd`.
   -------------------------------------------------------------------------- */

/** Route prefixes of the public site — the (home) and (public) route groups,
 *  plus sign-in (/login, outside both groups but on the same stage since its
 *  2026-10-02 redesign, so moving between it and the site plays the
 *  transition both ways). A navigation gets the transition only when both
 *  ends are on this list; the portals and the fan QR page keep plain
 *  navigation, so signing in (/login → /portal) does too. */
export const SITE_PREFIXES = [
  "/login",
  "/packages",
  "/join",
  "/next",
  "/athletes",
  "/properties",
  "/map",
  "/brief",
  "/onboarding",
  "/s",
] as const;

export function isSitePath(pathname: string): boolean {
  if (pathname === "/") return true;
  return SITE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The destination's name, shown large while the page loads. */
const LABELS: ReadonlyArray<readonly [string, string]> = [
  ["/login", "Login"],
  ["/packages", "For Sponsors"],
  ["/join", "For Athletes"],
  ["/next", "SponsorX NEXT"],
  ["/athletes", "Athlete"],
  ["/properties", "Properties"],
  ["/map", "The Map"],
  ["/brief", "Your Brief"],
  ["/onboarding", "Onboarding"],
  ["/s", "SponsorX"],
];

export function routeLabel(pathname: string): string {
  if (pathname === "/") return "Home";
  for (const [prefix, label] of LABELS) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return label;
  }
  return "SponsorX";
}

export type Point = readonly [number, number];

/** Arm half-width of the X as a share of its half-size. 0.2 keeps the
 *  silhouette an X while it grows — thicker and the arms read as slabs. */
export const ARM = 0.2;

/**
 * The 12-point outline of an X centred on (cx, cy): half-size `r` (the arm
 * tips sit on the corners of a 2r square), turned by `theta` radians.
 * `a` is how far a notch's apex sits from the centre along an axis — the
 * arms' perpendicular half-width times √2.
 */
export function xPoints(cx: number, cy: number, r: number, theta = 0): Point[] {
  const a = r * ARM * Math.SQRT2;
  const raw: Point[] = [
    [-r + a, -r],
    [0, -a],
    [r - a, -r],
    [r, -r + a],
    [a, 0],
    [r, r - a],
    [r - a, r],
    [0, a],
    [-r + a, r],
    [-r, r - a],
    [-a, 0],
    [-r, -r + a],
  ];
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return raw.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as const);
}

/**
 * The smallest half-size at which an upright X centred on (cx, cy) covers
 * the whole w×h viewport. A point (dx, dy) from the centre is inside one of
 * the arms when ||dx| − |dy|| ≤ a, so the worst points are straight out
 * along an axis: `a` must reach the farthest edge. The tips must also clear
 * the corners, which that `r` already does with ARM < 0.5.
 */
export function coverRadius(cx: number, cy: number, w: number, h: number): number {
  const reach = Math.max(cx, w - cx, cy, h - cy);
  return (reach / (ARM * Math.SQRT2)) * 1.04 + 2;
}

/** Is (px, py) inside the X of `xPoints(cx, cy, r, 0)`? For the tests. */
export function insideX(px: number, py: number, cx: number, cy: number, r: number): boolean {
  const a = r * ARM * Math.SQRT2;
  const diff = Math.abs(px - cx - (py - cy));
  const sum = Math.abs(px - cx + (py - cy));
  // each arm: within `a` of its diagonal, and short of its cut tips
  return (diff <= a && sum <= 2 * r - a) || (sum <= a && diff <= 2 * r - a);
}

const fmt = ([x, y]: Point) => `${x.toFixed(1)}px ${y.toFixed(1)}px`;

export function xPolygon(points: readonly Point[]): string {
  return `polygon(${points.map(fmt).join(", ")})`;
}

/** The viewport with an X-shaped hole. The bridge from the rectangle's
 *  corner to the X and back is zero-width, so only the hole shows. */
export function holePolygon(w: number, h: number, points: readonly Point[]): string {
  const pad = 4;
  const rect: Point[] = [
    [-pad, -pad],
    [w + pad, -pad],
    [w + pad, h + pad],
    [-pad, h + pad],
    [-pad, -pad],
  ];
  return `polygon(evenodd, ${[...rect, ...points, points[0]].map(fmt).join(", ")})`;
}

/**
 * Keyframes for an X growing from nothing to `rEnd`, turning from `turn`
 * radians to upright on the way — it twists into place as it swells.
 * Interpolation between keyframes is linear, so the effect's easing applies
 * to the whole growth; enough steps keep the turn looking like a turn.
 */
export function growFrames(
  cx: number,
  cy: number,
  rEnd: number,
  turn: number,
  toClip: (pts: Point[]) => string,
  steps = 14,
): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    frames.push({ offset: p, clipPath: toClip(xPoints(cx, cy, rEnd * p, turn * (1 - p))) });
  }
  return frames;
}

/* ---------------------------------------------------------------- safety
   The three ways a transition used to strand the visitor (P1-ART-12 audit,
   2026-10-02), each decided here so it can be tested without a browser. */

/** The attribute the transition's scroll lock sets on <html>; globals.css
 *  holds `html[data-sx-scroll-lock] { overflow: hidden }`.
 *
 *  It used to save `html.style.overflow` and put it back. The boot screen
 *  (landing-loader.tsx) locks the same property the same way, so a link
 *  followed while the boot screen was still up saved ITS "hidden" — and the
 *  reveal restored "hidden" after the boot screen had already let go: the
 *  page stayed locked for good. An attribute owned by the transition alone
 *  composes with the boot screen's inline lock instead of overwriting it. */
export const SCROLL_LOCK_ATTR = "sxScrollLock";

type Dataset = { dataset: Record<string, string | undefined> };

export function lockScroll(html: Dataset): void {
  html.dataset[SCROLL_LOCK_ATTR] = "1";
}

export function unlockScroll(html: Dataset): void {
  delete html.dataset[SCROLL_LOCK_ATTR];
}

/** Is the page locked, by either owner — the boot screen's inline style or
 *  the transition's attribute? Mirrors what the browser applies. */
export function scrollLocked(html: Dataset & { style: { overflow: string } }): boolean {
  return html.style.overflow === "hidden" || html.dataset[SCROLL_LOCK_ATTR] !== undefined;
}

/** What the cover does once it has grown. If the address changed while it
 *  grew — the visitor pressed back — pushing the clicked link would send
 *  them forward to a page they just left; open up where they are instead. */
export function afterCover(fromPath: string, currentPath: string): "push" | "stay" {
  return currentPath === fromPath ? "push" : "stay";
}

/** The longest a cover or reveal may take before it is moved on regardless.
 *  Their animations' `finished` promises reject if an animation is ever
 *  cancelled, and used to be swallowed — the phase never ended: covered for
 *  good, or every later public link cancelled and dropped. Generous: the
 *  real animation plus its three-layer stagger, plus two seconds. */
export function phaseDeadlineMs(phase: "cover" | "reveal", reduced: boolean, t: {
  coverMs: number; revealMs: number; staggerMs: number; titleLeadMs: number;
}): number {
  const slack = 2_000;
  if (reduced) return 280 + slack;
  return phase === "cover"
    ? t.coverMs + 2 * t.staggerMs + slack
    : t.titleLeadMs + t.revealMs + 2 * t.staggerMs + slack;
}
