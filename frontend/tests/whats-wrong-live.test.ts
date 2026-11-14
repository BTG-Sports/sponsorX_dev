import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ProblemTags, WhatsWrongPanel } from "@/components/problem-tags";
import { streamRowView, type ApiStreamRow } from "@/lib/new-signups-live";
import { DOCUMENTS_ANCHOR, docAnchor, problemTarget, type ApiProblem } from "@/lib/support-inbox-live";

/* POL-FE-42 — "What's wrong" at a glance. Done when: a held record shows
   each problem as a tag on its list row and at the top of its page; a
   record with no problems shows none; the tags match the stored reasons
   exactly. (The reasons → problems mapping is the API's, tested in
   backend/tests/hold-problems.test.ts and whats-wrong.test.ts.) */

/* The 2026-11-12 tester's held athlete, as GET /signups/athletes/:id answers. */
const ATHLETE: ApiProblem[] = [
  { code: "DOC_WRONG_KIND", type: "UPLOAD_MISMATCH", label: "Document check — Athlete's government ID: It doesn't read like a government ID", document: "Athlete's government ID", field: null },
  { code: "EMAIL_HAS_LOGIN", type: "ALREADY_REGISTERED", label: "Their email already has a SponsorX login", document: null, field: "email" },
];
const ORG: ApiProblem[] = [
  { code: "MISSING_DOCUMENT", type: "MISSING", label: "Missing document: Business registration", document: "Business registration", field: null },
  { code: "DOC_UNREADABLE", type: "COULDNT_READ", label: "Document check — W-9: No words could be read on it — check it by eye", document: "W-9", field: null },
  { code: "RESTRICTED_WORDS", type: "TECHNICAL_DECISION", label: "Restricted words in their description: \"casino\"", document: null, field: "description" },
];

describe("a tag jumps to the document it is about", () => {
  it("to the row whose name the reason names — the longest that fits", () => {
    const docs = [{ id: "d1", name: "School ID" }, { id: "d2", name: "Government ID" }, { id: "d3", name: "ID" }];
    expect(problemTarget(ATHLETE[0]!, docs)).toBe(`#${docAnchor("d2")}`);
    expect(problemTarget(ORG[1]!, [{ id: "w9", name: "W-9" }, { id: "br", name: "Business registration" }])).toBe("#doc-w9");
  });

  it("to the Documents section when no row matches (a missing one), and nowhere when it isn't about a document", () => {
    expect(problemTarget(ORG[0]!, [{ id: "w9", name: "W-9" }])).toBe(`#${DOCUMENTS_ANCHOR}`);
    expect(problemTarget(ATHLETE[1]!, [{ id: "d2", name: "Government ID" }])).toBeNull();
  });

  it("keeps an anchor safe whatever the id", () => {
    expect(docAnchor("satt_9f\"><x")).toBe("doc-satt_9fx");
  });
});

describe("the panel at the top of a review page", () => {
  it("shows every problem as a tag: its type, then the reason word for word, a document's tag a link", () => {
    const html = renderToStaticMarkup(createElement(WhatsWrongPanel, { problems: ORG, documents: [{ id: "w9", name: "W-9" }] }));
    expect(html).toContain("What&rsquo;s wrong · 3".replace("&rsquo;", "’"));
    for (const p of ORG) expect(html).toContain(p.label.replace(/"/g, "&quot;"));
    expect(html).toContain('href="#doc-w9"');
    expect(html).toContain('href="#documents"');
    expect(html.match(/<a /g)?.length).toBe(2); // the restricted words aren't about a document
    expect(html).toContain("Technical Decision");
    expect(html).toContain("Couldn&#x27;t read");
  });

  it("isn't drawn for a record with no problems", () => {
    expect(renderToStaticMarkup(createElement(WhatsWrongPanel, { problems: [] }))).toBe("");
    expect(renderToStaticMarkup(createElement(ProblemTags, { problems: [] }))).toBe("");
  });

  it("a list row's tags are short — the type — with the reason on hover and for screen readers", () => {
    const html = renderToStaticMarkup(createElement(ProblemTags, { problems: ATHLETE, compact: true }));
    expect(html).toContain(`title="${ATHLETE[1]!.label}"`);
    expect(html).toContain('<span class="sr-only">: Their email already has a SponsorX login</span>');
    expect(html).toContain("Upload doesn&#x27;t match");
  });
});

describe("New sign-ups rows", () => {
  const row = (over: Partial<ApiStreamRow>): ApiStreamRow => ({
    kind: "ATHLETE", id: "a1", name: "Serena Kay", sub: "Softball · MD", signedUpAt: "2026-11-12T10:00:00Z", state: "NEEDS_REVIEW",
    reasons: ATHLETE.map((p) => p.label), flags: [], problems: ATHLETE, ...over,
  });

  it("a held row carries its problems, matching the stored reasons", () => {
    const v = streamRowView(row({}));
    expect(v.problems.map((p) => p.label)).toEqual(v.reason.split(" · "));
  });

  it("any other row carries none, and an older API without problems still shows the reason line", () => {
    expect(streamRowView(row({ state: "AUTO_APPROVED", reasons: [], problems: [] })).problems).toEqual([]);
    const old = streamRowView(row({ problems: undefined }));
    expect(old.problems).toEqual([]);
    expect(old.reason).toContain("Their email already has a SponsorX login");
  });
});
