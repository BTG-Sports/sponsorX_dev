import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { accessFor } from "../src/lib/admin-access";
import { ADMIN_NAV } from "../src/lib/admin-nav";
import {
  boardDates, boardEmpty, boardParams, boardPatch, boardRowView, boardStats, filterRows, gateRows, needTurn, pieceLink, pieceTurn,
  type ApiBoardPiece, type ApiProductionBoard, type BoardSource,
} from "../src/lib/production-live";

/* --------------------------------------------------------------------------
   P9-FE-16 — the production board (/admin/next/production) on
   GET /editions/:id/production (P9-BE-28):

     { edition, gates, pieces[{ id, source, title, kind, who, needs[], note, ref }], counts }

   The pieces below are the backend's own fixture (backend/tests/
   p9-be-28-production-board.test.ts), as the API words them: every need the
   domain can say (backend/src/domain/edition-production.ts) appears once.
   -------------------------------------------------------------------------- */

const ED = "ed_1";
const piece = (p: Partial<ApiBoardPiece> & Pick<ApiBoardPiece, "id" | "source" | "title">): ApiBoardPiece => ({
  kind: null, who: null, needs: [], note: null, ref: {}, ...p,
});

const PIECES: ApiBoardPiece[] = [
  piece({ id: "a1", source: "ASSIGNMENT", title: "Not started", kind: "ARTICLE", who: "Jo S.", needs: ["The student's draft"], ref: { assignmentId: "a1" } }),
  piece({ id: "a2", source: "ASSIGNMENT", title: "Sent back", kind: "INTERVIEW", who: "Jo S.", needs: ["The student's changes (the advisor asked for some)"], ref: { assignmentId: "a2" } }),
  piece({ id: "a3", source: "ASSIGNMENT", title: "With the advisor", kind: "PHOTO", who: "Jo S.", needs: ["The advisor's approval"], ref: { assignmentId: "a3" } }),
  piece({ id: "c1", source: "CONTENT", title: "Title only", kind: "PHOTO", who: "BTG", needs: ["Its file", "A digital right", "A print right (for the printed edition)"], ref: { assetId: "c1" } }),
  piece({ id: "c2", source: "CONTENT", title: "No right", kind: "PHOTO", who: "BTG", needs: ["A digital right", "A print right (for the printed edition)"], ref: { assetId: "c2" } }),
  piece({ id: "c3", source: "CONTENT", title: "Ready", kind: "PHOTO", who: "BTG", needs: [], note: "Not on the web yet: This photo is over 50 MB, so it can't be shown on the web.", ref: { assetId: "c3" } }),
  piece({ id: "slotA", source: "ARTWORK", title: "EPB-A ad", kind: "QUARTER", who: "Joe's Deli", needs: ["The sponsor's artwork"], ref: { slotId: "slotA" } }),
  piece({ id: "slotB", source: "ARTWORK", title: "EPB-B ad", kind: "HALF", who: "Bakery", needs: ["The sponsor's sign-off", "A print right (for the printed edition)"], ref: { slotId: "slotB", assetId: "artB" } }),
  piece({ id: "slotC", source: "ARTWORK", title: "EPB-C ad", kind: "FULL", who: "Gym", needs: ["A print right (for the printed edition)"], ref: { slotId: "slotC", assetId: "artC" } }),
  piece({ id: "slotD", source: "ARTWORK", title: "EPB-D ad", kind: "BACK_COVER", who: "Garage", needs: ["BTG's review of the artwork"], ref: { slotId: "slotD", assetId: "artD" } }),
  piece({ id: `${ED}:cover`, source: "COVER", title: "Cover", needs: ["A cover"], ref: { editionId: ED } }),
  piece({ id: `${ED}:press-pdf`, source: "PRESS_PDF", title: "Press PDF", needs: ["The press PDF (for the printed edition)"], ref: { editionId: ED } }),
];

const BOARD: ApiProductionBoard = {
  edition: { id: ED, label: "Fall 2026", state: "PRODUCTION", publishTarget: "2026-11-01T00:00:00.000Z", printDate: "2026-12-01T00:00:00.000Z" },
  gates: { contentReady: true, rightsCleared: false, artworkApproved: false, revenueMet: true },
  pieces: PIECES,
  counts: { total: PIECES.length, ready: 1, waiting: PIECES.length - 1 },
};

const by = (title: string) => PIECES.find((p) => p.title === title)!;

describe("whose move a need is", () => {
  it("names the student, the advisor and the sponsor from the API's words; everything else is BTG's", () => {
    expect(needTurn("The student's draft")).toBe("STUDENT");
    expect(needTurn("The student's changes (the advisor asked for some)")).toBe("STUDENT");
    expect(needTurn("The advisor's approval")).toBe("ADVISOR");
    expect(needTurn("The sponsor's artwork")).toBe("SPONSOR");
    expect(needTurn("The sponsor's sign-off")).toBe("SPONSOR");
    for (const n of ["Its file", "A digital right", "A print right (for the printed edition)", "BTG's review of the artwork", "A cover", "The press PDF (for the printed edition)"]) {
      expect(needTurn(n)).toBe("BTG");
    }
  });

  it("a need the board doesn't know yet is shown as BTG's, never hidden as someone else's", () => {
    expect(needTurn("Something new the API asks")).toBe("BTG");
  });

  it("a piece is BTG's when any need is; else whoever it waits on; ready when it needs nothing", () => {
    expect(pieceTurn(by("EPB-B ad"))).toBe("BTG"); /* the sponsor's sign-off AND a print right */
    expect(pieceTurn(by("EPB-A ad"))).toBe("SPONSOR");
    expect(pieceTurn(by("With the advisor"))).toBe("ADVISOR");
    expect(pieceTurn(by("Ready"))).toBeNull();
  });
});

describe("where each piece is fixed", () => {
  const link = (title: string) => pieceLink(by(title), ED);

  it("a student's piece opens on the advisor's Content review", () => {
    expect(link("Not started")).toEqual({ href: "/advisor/review?open=a1", verb: "Open" });
    expect(link("With the advisor")).toEqual({ href: "/advisor/review?open=a3", verb: "Review" });
  });

  it("content: its file on its row of the rights page's Content list; a right in the Clearance queue; ready opens its row", () => {
    expect(link("Title only")).toEqual({ href: `/admin/next/rights?edition=${ED}#piece-c1`, verb: "Add its file" });
    expect(link("No right")).toEqual({ href: `/admin/next/rights?edition=${ED}#clearance`, verb: "Record a right" });
    expect(link("Ready")).toEqual({ href: `/admin/next/rights?edition=${ED}#piece-c3`, verb: "Open" });
  });

  it("ad artwork: a right in the Clearance queue; BTG's review on the approvals desk; no artwork yet on the edition's slot list", () => {
    expect(link("EPB-C ad")).toEqual({ href: `/admin/next/rights?edition=${ED}#clearance`, verb: "Record a right" });
    expect(link("EPB-D ad")).toEqual({ href: "/admin/approvals#edition-artwork", verb: "Review" });
    expect(link("EPB-B ad")).toEqual({ href: "/admin/approvals#edition-artwork", verb: "Open" });
    expect(link("EPB-A ad")).toEqual({ href: `/admin/next/editions?edition=${ED}#ad-artwork`, verb: "Open" });
  });

  it("the cover and the press PDF are uploaded on the editions page", () => {
    expect(link("Cover")).toEqual({ href: `/admin/next/editions?edition=${ED}#files`, verb: "Upload" });
    expect(link("Press PDF")).toEqual({ href: `/admin/next/editions?edition=${ED}#files`, verb: "Upload" });
    expect(pieceLink(piece({ id: "p", source: "PRESS_PDF", title: "Press PDF", note: "Only needed if the edition is printed." }), ED).verb).toBe("Open");
  });

  it("a source the board doesn't know yet still opens the edition", () => {
    const odd = piece({ id: "x", source: "PODCAST" as BoardSource, title: "Episode 1", needs: ["Its audio"] });
    expect(pieceLink(odd, ED)).toEqual({ href: `/admin/next/editions?edition=${ED}`, verb: "Open" });
    const row = boardRowView(odd, ED);
    expect(row.sourceWord).toBe("PODCAST");
    expect(row.mine).toBe(true);
  });

  it("every link points at an anchor that exists on its page", () => {
    const read = (p: string) => readFileSync(new URL(`../src/app/(app)/admin/${p}`, import.meta.url), "utf8");
    expect(read("next/rights/live-rights.tsx")).toMatch(/id="clearance"/);
    expect(read("next/rights/live-rights.tsx")).toMatch(/id=\{`piece-\$\{p\.id\}`\}/);
    expect(read("next/rights/live-rights.tsx")).toMatch(/id="content"/);
    expect(read("next/editions/live-editions.tsx")).toMatch(/id="files"/);
    expect(read("next/editions/live-editions.tsx")).toMatch(/id="ad-artwork"/);
    expect(read("approvals/page.tsx")).toMatch(/id="edition-artwork"/);
  });

  it("ids are encoded into the links", () => {
    expect(pieceLink(piece({ id: "a b", source: "ASSIGNMENT", title: "t", ref: { assignmentId: "a b" } }), "e/1").href).toBe("/advisor/review?open=a%20b");
    expect(pieceLink(piece({ id: "c", source: "COVER", title: "Cover" }), "e/1").href).toBe("/admin/next/editions?edition=e%2F1#files");
  });
});

describe("rows", () => {
  it("each row says what it is, whose move it is, and keeps the API's needs word for word", () => {
    const r = boardRowView(by("Title only"), ED);
    expect(r).toMatchObject({
      key: "CONTENT:c1", sourceWord: "Content", sub: "Photo · BTG", ready: false, mine: true,
      pill: { tone: "amber", act: true, label: "Needs you" }, needs: by("Title only").needs,
    });
    expect(boardRowView(by("EPB-A ad"), ED)).toMatchObject({ sub: "Quarter page · Joe's Deli", mine: false, pill: { tone: "cyan", label: "Waiting on the sponsor" } });
    expect(boardRowView(by("Ready"), ED)).toMatchObject({ ready: true, pill: { tone: "green", label: "Ready" }, note: by("Ready").note });
    expect(boardRowView(by("Cover"), ED).sub).toBe("");
  });
});

describe("the filter the URL carries", () => {
  it("defaults to what still needs something; ignores what it doesn't know", () => {
    expect(boardParams({})).toEqual({ show: "waiting", source: "", q: "" });
    expect(boardParams({ show: "all", source: "ARTWORK", q: "  deli " })).toEqual({ show: "all", source: "ARTWORK", q: "deli" });
    expect(boardParams({ show: "nope", source: "PODCAST" })).toEqual({ show: "waiting", source: "", q: "" });
    expect(boardParams({ show: ["ready", "all"] }).show).toBe("ready");
  });

  it("the default tab leaves no param; the kind is cleared with an empty value", () => {
    const f = boardParams({ show: "ready", source: "COVER" });
    expect(boardPatch(f, { show: "waiting" })).toEqual({ show: null, source: "COVER" });
    expect(boardPatch(f, { source: "" })).toEqual({ show: "ready", source: null });
  });

  it("BTG's moves come first, then what waits on others, then what is ready", () => {
    const rows = PIECES.map((p) => boardRowView(p, ED));
    const all = filterRows(rows, { show: "all", source: "", q: "" });
    expect(all).toHaveLength(PIECES.length);
    const firstOther = all.findIndex((r) => !r.mine);
    expect(all.slice(0, firstOther).every((r) => r.mine)).toBe(true);
    expect(all.at(-1)!.title).toBe("Ready");
    expect(filterRows(rows, { show: "waiting", source: "", q: "" }).some((r) => r.ready)).toBe(false);
    expect(filterRows(rows, { show: "ready", source: "", q: "" }).map((r) => r.title)).toEqual(["Ready"]);
    expect(filterRows(rows, { show: "all", source: "ARTWORK", q: "" })).toHaveLength(4);
    expect(filterRows(rows, { show: "all", source: "", q: "deli" }).map((r) => r.title)).toEqual(["EPB-A ad"]);
    expect(filterRows(rows, { show: "all", source: "", q: "print right" }).length).toBeGreaterThan(0);
  });
});

describe("the number cards", () => {
  it("Needs you and Waiting on others split the API's waiting count, and add up to it", () => {
    const [mine, others, ready] = boardStats(BOARD);
    expect(mine).toMatchObject({ key: "mine", value: 7, alert: true });
    expect(others).toMatchObject({ key: "others", value: 4, sub: "On 2 students, 1 advisor, 1 sponsor." });
    expect(mine!.value + others!.value).toBe(BOARD.counts.waiting);
    expect(ready).toMatchObject({ key: "ready", value: 1, sub: `of ${PIECES.length} pieces` });
    expect(ready!.share).toBeCloseTo(1 / PIECES.length);
  });

  it("an empty edition: zeros, no share bar, and nothing alarming", () => {
    const empty = { pieces: [], counts: { total: 0, ready: 0, waiting: 0 } };
    expect(boardStats(empty).map((s) => [s.key, s.value, s.alert, s.share])).toEqual([
      ["mine", 0, false, null], ["others", 0, false, null], ["ready", 0, false, null],
    ]);
    expect(boardStats(empty)[2]!.sub).toBe("No pieces yet.");
  });

  it("the four gates, as the API answers them", () => {
    expect(gateRows(BOARD.gates).map((g) => [g.label, g.pass])).toEqual([
      ["Content ready", true], ["Rights cleared", false], ["Ad artwork approved", false], ["Revenue met", true],
    ]);
  });

  it("the edition's dates, read in UTC", () => {
    expect(boardDates(BOARD.edition)).toBe("publishes Nov 1 · prints Dec 1");
    expect(boardDates({ publishTarget: "2026-11-01T00:00:00.000Z", printDate: null })).toBe("publishes Nov 1 · digital only");
  });
});

describe("empty lists", () => {
  it("says the most specific reason first", () => {
    expect(boardEmpty({ show: "waiting", source: "", q: "deli" }, 5).title).toBe("No pieces match “deli”");
    expect(boardEmpty({ show: "waiting", source: "", q: "" }, 0)).toMatchObject({ title: "No pieces yet", good: false });
    expect(boardEmpty({ show: "waiting", source: "", q: "" }, 4)).toMatchObject({ title: "Every piece is ready", good: true });
    expect(boardEmpty({ show: "waiting", source: "ARTWORK", q: "" }, 4).title).toBe("No ad artwork need anything");
    expect(boardEmpty({ show: "ready", source: "", q: "" }, 4).title).toBe("Nothing is ready yet");
  });
});

describe("the route", () => {
  it("is BTG admins' only, like the edition write the API asks", () => {
    expect(accessFor("/admin/next/production")?.roles).toEqual(["SUPER_ADMIN", "BTG_ADMIN"]);
  });

  it("is in the NEXT menu", () => {
    expect(ADMIN_NAV.find((n) => n.href === "/admin/next/production")).toMatchObject({ label: "Production", group: "NEXT" });
  });
});
