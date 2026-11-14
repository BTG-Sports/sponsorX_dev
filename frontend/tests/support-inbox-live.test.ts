import { describe, expect, it } from "vitest";

import { ADMIN_NAV, navFor } from "@/lib/admin-nav";
import {
  PROBLEM_TAG, SUPPORT_TABS, caseParam, casesSummary, emptyInboxTitle, problemTag, recordKind, replyProblem, statusBadge, supportNavCount,
  supportTab, supportWriteRefusal, topicParam,
} from "@/lib/support-inbox-live";

/* POL-FE-41 — BTG's support inbox: the tabs, the filter, the menu's count,
   the reply's checks and refusals, and the problem tags shared with POL-FE-42. */

describe("the inbox's tabs and filter", () => {
  it("New, Answered, Closed — New by default and for anything unknown", () => {
    expect(SUPPORT_TABS.map((t) => [t.key, t.status])).toEqual([["new", "NEW"], ["answered", "ANSWERED"], ["closed", "CLOSED"]]);
    expect(supportTab(undefined).status).toBe("NEW");
    expect(supportTab("closed").status).toBe("CLOSED");
    expect(supportTab(["answered", "closed"]).status).toBe("ANSWERED");
    expect(supportTab("deleted").status).toBe("NEW");
  });

  it("keeps a topic only when it is one of the eight, and a case only when shaped like one", () => {
    expect(topicParam("PAYMENT")).toBe("PAYMENT");
    expect(topicParam("payment")).toBe("");
    expect(topicParam("BILLING")).toBe("");
    expect(caseParam(" acc-30 ")).toBe("ACC-30");
    expect(caseParam("ACC-3")).toBe("");
    expect(caseParam("ACC-30; DROP")).toBe("");
  });

  it("says why a tab is empty, filtered or not", () => {
    expect(emptyInboxTitle("NEW", false)).toBe("No new support messages");
    expect(emptyInboxTitle("CLOSED", true)).toBe("No messages match this filter");
  });

  it("sums a row's cases: the first in words, then how many more; a retired one by its ID", () => {
    expect(casesSummary([])).toBe("—");
    expect(casesSummary([{ id: "ACC-30", topic: "ACCOUNT", text: "I didn't get the confirmation email", retired: false }])).toBe("ACC-30 · I didn't get the confirmation email");
    expect(casesSummary([
      { id: "ACC-09", topic: null, text: null, retired: true },
      { id: "ACC-30", topic: "ACCOUNT", text: "x", retired: false },
    ])).toBe("ACC-09 (retired) +1 more");
  });

  it("badges each status", () => {
    expect(statusBadge("NEW")).toEqual({ label: "New", tone: "warn" });
    expect(statusBadge("ANSWERED")).toEqual({ label: "Answered", tone: "accent" });
    expect(statusBadge("CLOSED")).toEqual({ label: "Closed", tone: "neutral" });
  });
});

describe("the menu's Support entry and its count", () => {
  it("is in Accounts, for BTG admins and super admins only", () => {
    expect(ADMIN_NAV.find((n) => n.href === "/admin/support")).toMatchObject({ label: "Support", group: "Accounts" });
    expect(navFor(["BTG_ADMIN"]).some((n) => n.href === "/admin/support")).toBe(true);
    expect(navFor(["SUPER_ADMIN"]).some((n) => n.href === "/admin/support")).toBe(true);
    for (const role of ["FINANCE", "SALES", "CAMPAIGN_MGR", "NETWORK_MGR"]) expect(navFor([role]).some((n) => n.href === "/admin/support"), role).toBe(false);
  });

  it("carries counts.NEW, and nothing when it is zero or unreadable", () => {
    expect(supportNavCount({ messages: [], counts: { NEW: 3, ANSWERED: 1, CLOSED: 9 } })).toBe(3);
    expect(supportNavCount({ counts: { NEW: "3" } })).toBeNull();
    expect(supportNavCount(null)).toBeNull();
  });

  it("the admin layout hands the count to the shell beside the unchanged nav, and the shell puts it on that item only", async () => {
    const { readFileSync } = await import("node:fs");
    const layout = readFileSync(new URL("../src/app/(app)/admin/layout.tsx", import.meta.url), "utf8");
    expect(layout).toMatch(/nav=\{navFor\(actor\.roles\)\}/);
    expect(layout).toMatch(/counts=\{\{ "\/admin\/support": await newSupportCount\(actor\.roles\) \}\}/);
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NavCount } = await import("@/components/portal-nav");
    expect(renderToStaticMarkup(createElement(NavCount, { count: 3, label: "Support" }))).toContain("3 waiting on Support");
    expect(renderToStaticMarkup(createElement(NavCount, { count: 120, label: "Support" }))).toContain(">99+<");
    expect(renderToStaticMarkup(createElement(NavCount, { count: 0, label: "Support" }))).toBe("");
  });
});

describe("replying", () => {
  it("needs some text, under 5,000 characters", () => {
    expect(replyProblem("   ")).toBe("Write your reply first.");
    expect(replyProblem("Thanks — we've resent your link.")).toBeNull();
    expect(replyProblem("x".repeat(5001))).toMatch(/under 5,000 characters \(it is 5,001\)/);
  });

  it("says why the API refused, in its words when it gives them", () => {
    expect(supportWriteRefusal(403, null)).toMatch(/only BTG admins answer support/);
    expect(supportWriteRefusal(409, { error: { message: "This message is still uploading its files." } })).toBe("This message is still uploading its files.");
    expect(supportWriteRefusal(409, null)).toMatch(/waiting for its files/);
    expect(supportWriteRefusal(500, null)).toMatch(/HTTP 500\). Nothing was sent/);
  });
});

describe("This person on SponsorX", () => {
  it("names each kind of record, and an athlete a guardian looks after", () => {
    expect(recordKind({ kind: "SPONSOR_REQUEST", relation: "SELF" })).toBe("Sponsor request");
    expect(recordKind({ kind: "ATHLETE", relation: "WARD" })).toBe("Athlete they look after");
    expect(recordKind({ kind: "SOMETHING_NEW", relation: "SELF" })).toBe("SOMETHING_NEW");
  });

  it("tags each problem type in its own words and colour; an unknown type still shows, in grey", () => {
    expect(Object.keys(PROBLEM_TAG)).toEqual(["UPLOAD_MISMATCH", "COULDNT_READ", "MISSING", "EMAIL_NOT_CONFIRMED", "ALREADY_REGISTERED", "TECHNICAL_DECISION"]);
    expect(problemTag("UPLOAD_MISMATCH")).toEqual({ word: "Upload doesn't match", tone: "danger" });
    expect(problemTag("MISSING").tone).toBe("warn");
    expect(problemTag("COULDNT_READ").tone).toBe("neutral");
    expect(problemTag("TECHNICAL_DECISION").word).toBe("Technical Decision");
    expect(problemTag("SOMETHING_NEW")).toEqual({ word: "Something new", tone: "neutral" });
  });
});
