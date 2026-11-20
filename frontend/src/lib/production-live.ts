/* --------------------------------------------------------------------------
   P9-FE-16 — the production board (/admin/next/production, spec §8), on
   GET /editions/:id/production (P9-BE-28):

     { edition, gates, pieces[{ id, source, title, kind, who, needs[], note, ref }], counts }

   One edition's pieces and what each still needs before it publishes. The
   API asks the same questions as the publishing gate (`rightsGap`,
   `artworkGap`), so nothing is decided here: a piece is ready when `needs`
   is empty, and `needs` are the API's own words, shown as written.

   What this adds is for the person reading: whose move each need is (BTG's,
   or someone BTG is waiting on), where the piece is fixed, the filter the
   URL carries, and the numbers on the cards — every one counted from the
   pieces the API returned whole, never from a page of them. Pure.
   -------------------------------------------------------------------------- */

export type BoardSource = "ASSIGNMENT" | "CONTENT" | "ARTWORK" | "COVER" | "PRESS_PDF";

export type ApiBoardPiece = {
  id: string;
  source: BoardSource;
  title: string;
  kind: string | null;
  /** Who made it or bought it, in words. */
  who: string | null;
  /** What it still needs, in words; empty when ready. */
  needs: string[];
  /** Worth knowing, never blocking. */
  note: string | null;
  /** Where it's fixed. */
  ref: { assignmentId?: string; assetId?: string; slotId?: string; editionId?: string };
};

export type ApiProductionBoard = {
  edition: { id: string; label: string; state: string; publishTarget: string; printDate: string | null };
  gates: { contentReady: boolean; rightsCleared: boolean; artworkApproved: boolean; revenueMet: boolean };
  pieces: ApiBoardPiece[];
  counts: { total: number; ready: number; waiting: number };
};

/* ------------------------------------------------------------- whose move */

export type Turn = "BTG" | "STUDENT" | "ADVISOR" | "SPONSOR";

/** Whose move a need is. BTG's own steps are the default: anything the API
 *  words in a way this doesn't know is shown as waiting on BTG, so a new need
 *  is never hidden behind "waiting on someone else". */
export function needTurn(need: string): Turn {
  if (/^The student's /.test(need)) return "STUDENT";
  if (/^The advisor's /.test(need)) return "ADVISOR";
  if (/^The sponsor's /.test(need)) return "SPONSOR";
  return "BTG";
}

/** The piece's turn: BTG's if any need is BTG's, else whoever it waits on; null when ready. */
export function pieceTurn(p: Pick<ApiBoardPiece, "needs">): Turn | null {
  if (p.needs.length === 0) return null;
  const turns = p.needs.map(needTurn);
  return turns.includes("BTG") ? "BTG" : turns[0]!;
}

const TURN_WORDS: Record<Turn, string> = {
  BTG: "Needs you",
  STUDENT: "Waiting on the student",
  ADVISOR: "Waiting on the advisor",
  SPONSOR: "Waiting on the sponsor",
};

/* ------------------------------------------------------- where it's fixed */

export type PieceLink = { href: string; verb: string };

const q = encodeURIComponent;

/** A need the rights ledger clears ("A digital right", "A print right (…)"). */
export const isRightNeed = (need: string) => /^A (digital|print) right\b/.test(need);

/** Where a piece is fixed, and the word on its button. One link per piece:
 *  the page that clears its FIRST need (the API lists the piece's own step
 *  before its rights), or the page it lives on when it is ready.
 *
 *    ASSIGNMENT   the advisor's Content review, opened on the piece (BTG
 *                 admins review there too — LIVE_REVIEW_ROLES, matrix §15.2)
 *    CONTENT      its file → the rights page's Content list, on its row;
 *                 a right → the rights page's Clearance queue
 *    ARTWORK      a right → the Clearance queue; BTG's review or the
 *                 sponsor's steps → the approvals desk's Edition ad artwork;
 *                 no artwork sent yet → the edition's Ad artwork list
 *    COVER, PRESS_PDF   the editions page's Cover and press PDF
 *    anything else      the edition itself, so a new source still has a way in */
export function pieceLink(p: ApiBoardPiece, editionId: string): PieceLink {
  const ready = p.needs.length === 0;
  const first = p.needs[0] ?? "";
  const edition = `/admin/next/editions?edition=${q(editionId)}`;
  const rights = `/admin/next/rights?edition=${q(editionId)}`;
  switch (p.source) {
    case "ASSIGNMENT":
      return { href: `/advisor/review?open=${q(p.ref.assignmentId ?? p.id)}`, verb: needTurn(first) === "ADVISOR" ? "Review" : "Open" };
    case "CONTENT":
      if (!ready && isRightNeed(first)) return { href: `${rights}#clearance`, verb: "Record a right" };
      return { href: `${rights}#piece-${q(p.ref.assetId ?? p.id)}`, verb: ready ? "Open" : first === "Its file" ? "Add its file" : "Open" };
    case "ARTWORK":
      if (!ready && isRightNeed(first)) return { href: `${rights}#clearance`, verb: "Record a right" };
      /* No artwork yet: nothing is on the approvals desk — the slot is listed on the edition. */
      if (!p.ref.assetId) return { href: `${edition}#ad-artwork`, verb: "Open" };
      return { href: "/admin/approvals#edition-artwork", verb: !ready && needTurn(first) === "BTG" ? "Review" : "Open" };
    case "COVER":
    case "PRESS_PDF":
      return { href: `${edition}#files`, verb: ready ? "Open" : "Upload" };
    default:
      return { href: edition, verb: "Open" };
  }
}

/* ------------------------------------------------------------------- rows */

export const SOURCE_WORDS: Record<BoardSource, string> = {
  ASSIGNMENT: "Student piece",
  CONTENT: "Content",
  ARTWORK: "Ad artwork",
  COVER: "Cover",
  PRESS_PDF: "Press PDF",
};

const KIND_WORDS: Record<string, string> = {
  ARTICLE: "Article", INTERVIEW: "Interview", PHOTO: "Photo", PHOTO_PACKAGE: "Photo package", VIDEO: "Video", DESIGN: "Design",
  AD_CREATIVE: "Ad creative", QUARTER: "Quarter page", HALF: "Half page", FULL: "Full page", BACK_COVER: "Back cover", PRESENTING: "Presenting sponsor",
};

export type BoardRowView = {
  key: string;
  source: BoardSource;
  sourceWord: string;
  title: string;
  /** "Article · Jo S." — the kind and who made or bought it. */
  sub: string;
  needs: string[];
  note: string | null;
  ready: boolean;
  /** BTG's move: the row's orange edge and its orange button. */
  mine: boolean;
  pill: { tone: "green" | "amber" | "cyan" | "muted"; act: boolean; label: string };
  href: string;
  verb: string;
};

export function boardRowView(p: ApiBoardPiece, editionId: string): BoardRowView {
  const turn = pieceTurn(p);
  const link = pieceLink(p, editionId);
  const kind = p.kind ? KIND_WORDS[p.kind] ?? p.kind.replace(/_/g, " ").toLowerCase() : null;
  return {
    key: `${p.source}:${p.id}`,
    source: p.source,
    sourceWord: SOURCE_WORDS[p.source] ?? p.source,
    title: p.title,
    sub: [kind, p.who].filter(Boolean).join(" · "),
    needs: p.needs,
    note: p.note,
    ready: turn === null,
    mine: turn === "BTG",
    pill: turn === null
      ? { tone: "green", act: false, label: "Ready" }
      : turn === "BTG"
        ? { tone: "amber", act: true, label: TURN_WORDS.BTG }
        : { tone: "cyan", act: false, label: TURN_WORDS[turn] },
    href: link.href,
    verb: link.verb,
  };
}

/* ----------------------------------------------------------------- filter */

export type BoardShow = "waiting" | "ready" | "all";
export type BoardFilter = { show: BoardShow; source: BoardSource | ""; q: string };

export const BOARD_TABS: readonly { key: BoardShow; label: string }[] = [
  { key: "waiting", label: "Still needs something" },
  { key: "ready", label: "Ready" },
  { key: "all", label: "All pieces" },
];

export const SOURCE_OPTIONS: { value: BoardSource; label: string }[] = [
  { value: "ASSIGNMENT", label: "Student pieces" },
  { value: "CONTENT", label: "Content" },
  { value: "ARTWORK", label: "Ad artwork" },
  { value: "COVER", label: "Cover" },
  { value: "PRESS_PDF", label: "Press PDF" },
];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** The filter the URL carries: `show` (what still needs something, by default), `source`, `q`. */
export function boardParams(sp: Record<string, string | string[] | undefined>): BoardFilter {
  const show = one(sp.show);
  const source = one(sp.source);
  return {
    show: show === "ready" || show === "all" ? show : "waiting",
    source: SOURCE_OPTIONS.some((s) => s.value === source) ? (source as BoardSource) : "",
    q: one(sp.q).trim().slice(0, 100),
  };
}

/** The URL patch for a tab or kind change — always explicit; the default tab leaves no param. */
export function boardPatch(f: Pick<BoardFilter, "show" | "source">, change: { show?: BoardShow; source?: string }): Record<string, string | null> {
  const show = change.show ?? f.show;
  const source = change.source !== undefined ? change.source : f.source;
  return { show: show === "waiting" ? null : show, source: source || null };
}

/** The rows the filter leaves, BTG's moves first, then what waits on others, then what is ready. */
export function filterRows(rows: BoardRowView[], f: BoardFilter): BoardRowView[] {
  const needle = f.q.toLowerCase();
  const rank = (r: BoardRowView) => (r.mine ? 0 : r.ready ? 2 : 1);
  return rows
    .filter((r) => (f.show === "all" ? true : f.show === "ready" ? r.ready : !r.ready))
    .filter((r) => !f.source || r.source === f.source)
    .filter((r) => !needle || `${r.title} ${r.sub} ${r.sourceWord} ${r.needs.join(" ")}`.toLowerCase().includes(needle))
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .map((x) => x.r);
}

/** What an empty list says, most specific reason first. */
export function boardEmpty(f: BoardFilter, total: number): { title: string; hint: string; good: boolean } {
  if (f.q) return { title: `No pieces match “${f.q}”`, hint: "Try another title or name, or clear the search.", good: false };
  if (total === 0) return { title: "No pieces yet", hint: "Pieces appear as students are assigned work, content is added and ads are sold.", good: false };
  const kind = SOURCE_OPTIONS.find((s) => s.value === f.source)?.label.toLowerCase();
  if (f.show === "waiting") {
    return kind
      ? { title: `No ${kind} need anything`, hint: "Every one of them is ready. Switch to All pieces to see them.", good: true }
      : { title: "Every piece is ready", hint: "Nothing here stands between this edition and publishing. Switch to All pieces to see them.", good: true };
  }
  if (f.show === "ready") return { title: kind ? `No ${kind} are ready yet` : "Nothing is ready yet", hint: "A piece moves here once it needs nothing more.", good: false };
  return { title: `No ${kind ?? "pieces"} on this edition`, hint: "Clear the filter to see every piece.", good: false };
}

/* ------------------------------------------------------------------ cards */

export type BoardStat = { key: "mine" | "others" | "ready"; label: string; value: number; sub: string; alert: boolean; share: number | null };

/** The three number cards. `mine` and `others` split the API's `waiting` by
 *  whose move it is; they always add up to it. */
export function boardStats(b: Pick<ApiProductionBoard, "pieces" | "counts">): BoardStat[] {
  const turns = b.pieces.map(pieceTurn);
  const mine = turns.filter((t) => t === "BTG").length;
  const others = turns.filter((t) => t !== null && t !== "BTG").length;
  const total = b.counts.total;
  const waitingOn = (["STUDENT", "ADVISOR", "SPONSOR"] as const)
    .map((t) => [t, turns.filter((x) => x === t).length] as const)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${t === "STUDENT" ? (n === 1 ? "student" : "students") : t === "ADVISOR" ? "advisor" : n === 1 ? "sponsor" : "sponsors"}`);
  return [
    {
      key: "mine", label: "Needs you", value: mine, alert: mine > 0, share: null,
      sub: mine ? "A file, a right, a review, the cover or the press PDF." : "Nothing is waiting on BTG.",
    },
    {
      key: "others", label: "Waiting on others", value: others, alert: false, share: null,
      sub: others ? `On ${waitingOn.join(", ")}.` : "No one else holds a piece.",
    },
    {
      key: "ready", label: "Ready", value: b.counts.ready, alert: false, share: total ? b.counts.ready / total : null,
      sub: total ? `of ${total} piece${total === 1 ? "" : "s"}` : "No pieces yet.",
    },
  ];
}

export type GateRow = { key: keyof ApiProductionBoard["gates"]; label: string; pass: boolean };

/** The four conditions production asks for (spec §5.2), as the API answers them. */
export function gateRows(g: ApiProductionBoard["gates"]): GateRow[] {
  return [
    { key: "contentReady", label: "Content ready", pass: g.contentReady },
    { key: "rightsCleared", label: "Rights cleared", pass: g.rightsCleared },
    { key: "artworkApproved", label: "Ad artwork approved", pass: g.artworkApproved },
    { key: "revenueMet", label: "Revenue met", pass: g.revenueMet },
  ];
}

/** "publishes Nov 1 · prints Dec 1" / "publishes Nov 1 · digital only". Read in UTC so server and browser agree. */
export function boardDates(e: Pick<ApiProductionBoard["edition"], "publishTarget" | "printDate">): string {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `publishes ${day(e.publishTarget)} · ${e.printDate ? `prints ${day(e.printDate)}` : "digital only"}`;
}
