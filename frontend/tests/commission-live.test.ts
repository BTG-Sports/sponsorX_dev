import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
/* The rule dialog's ComboBox lives in place-dialog.tsx, whose server actions reach
   server/api (server-only) — mocked, as the editor's own actions are. */
vi.mock("../src/app/(app)/admin/new-signups/rules/actions", () => ({ setAgeRowAction: async () => ({ ok: false, message: "n/a" }), removeAgeRowAction: async () => ({ ok: false, message: "n/a" }) }));

import {
  groupRules, isCommissionAdmin, kindSummary, parseDollars, parsePercent, rateLabel, scopeLabel, toPreviewLines, toRuleInput, type ApiRule,
} from "../src/lib/commission-live";

/* 2S5-FE-01 — "Rules can be created, versioned and previewed against a
   sample order." The API computes the split and owns the versions; this is
   the screen's half: what an admin types becomes what the API takes, the
   rules are shown in the order the API applies them, and only BTG admin
   gets the screen. */

const rule = (o: Partial<ApiRule>): ApiRule => ({
  id: "r", ruleKey: "k", version: 1, kind: "PLATFORM_FEE", scope: "GLOBAL", scopeRef: null, bps: 1500, fixedCents: 0,
  priority: 0, effectiveFrom: "2026-09-01T00:00:00Z", effectiveTo: null, note: null, ...o,
});

describe("2S5-FE-01 · the commission editor", () => {
  it("turns what an admin types into basis points and cents — and refuses what isn't a rate", () => {
    expect(parsePercent("15")).toBe(1500);
    expect(parsePercent("2.9%")).toBe(290);
    expect(parsePercent("0")).toBe(0);
    expect(parsePercent("101")).toBeNull();
    expect(parsePercent("2.955")).toBeNull();
    expect(parsePercent("abc")).toBeNull();
    expect(parseDollars("$0.30")).toBe(30);
    expect(parseDollars("1,200")).toBe(120_000);
    expect(parseDollars("")).toBe(0);
    expect(parseDollars("1.234")).toBeNull();
  });

  it("builds a rule the API accepts, and says what is wrong with one it wouldn't", () => {
    expect(toRuleInput({ kind: "PROCESSING", scope: "GLOBAL", scopeRef: "", percent: "2.9", fixed: "0.30", priority: "0", note: "" }))
      .toEqual({ ok: true, rule: { kind: "PROCESSING", scope: "GLOBAL", scopeRef: null, bps: 290, fixedCents: 30, priority: 0, note: null } });
    expect(toRuleInput({ kind: "PLATFORM_FEE", scope: "PROPERTY_KIND", scopeRef: "SCHOOL", percent: "10", fixed: "", priority: "5", note: " Schools " }))
      .toMatchObject({ ok: true, rule: { scope: "PROPERTY_KIND", scopeRef: "SCHOOL", bps: 1000, priority: 5, note: "Schools" } });
    expect(toRuleInput({ kind: "RESERVE", scope: "GLOBAL", scopeRef: "", percent: "10", fixed: "1", priority: "0", note: "" }))
      .toEqual({ ok: false, message: expect.stringMatching(/Only the platform fee and processing/) });
    expect(toRuleInput({ kind: "REFERRAL", scope: "PROPERTY", scopeRef: " ", percent: "2", fixed: "", priority: "0", note: "" }))
      .toEqual({ ok: false, message: expect.stringMatching(/which property type, property or sponsor/) });
    expect(toRuleInput({ kind: "REFERRAL", scope: "GLOBAL", scopeRef: "", percent: "2", fixed: "", priority: "high", note: "" }).ok).toBe(false);
  });

  it("shows rules in the order the API applies them, with every earlier version kept", () => {
    const groups = groupRules([
      rule({ id: "g", priority: 0 }),
      rule({ id: "t2", ruleKey: "team", version: 2, scope: "PROPERTY_KIND", scopeRef: "TEAM", bps: 1100, priority: 5 }),
      rule({ id: "t1", ruleKey: "team", version: 1, scope: "PROPERTY_KIND", scopeRef: "TEAM", bps: 1200, priority: 5, effectiveTo: "2026-09-20T00:00:00Z" }),
      rule({ id: "res", kind: "RESERVE", bps: 1000 }),
    ]);
    const platform = groups.find((g) => g.kind === "PLATFORM_FEE")!;
    expect(platform.current.map((r) => r.id)).toEqual(["t2", "g"]); // priority 5 before 0
    expect(platform.history.team!.map((r) => r.id)).toEqual(["t1"]);
    expect(groups.find((g) => g.kind === "MANAGEMENT_FEE")!.current).toEqual([]);
    expect(groups.map((g) => g.kind)).toEqual(["PLATFORM_FEE", "MANAGEMENT_FEE", "PROCESSING", "REFERRAL", "RESERVE", "TEAM_SHARE"]);
    expect(rateLabel(rule({ bps: 290, fixedCents: 30 }))).toBe("2.9% + $0.30");
    expect(scopeLabel(rule({ scope: "PROPERTY_KIND", scopeRef: "SCHOOL" }))).toBe("All schools");
  });

  it("builds the sample order the preview sends", () => {
    expect(toPreviewLines([{ label: "Banner", amount: "1200", propertyKind: "TEAM", athleteItem: false, teamShare: "" },
      { label: "", amount: "500", propertyKind: "TEAM", athleteItem: true, teamShare: "20" }])).toEqual({ ok: true, lines: [
      { label: "Banner", grossCents: 120_000, propertyKind: "TEAM", athleteItem: false, teamShareBps: null },
      { label: "Line 2", grossCents: 50_000, propertyKind: "TEAM", athleteItem: true, teamShareBps: 2000 },
    ] });
    expect(toPreviewLines([{ label: "x", amount: "", propertyKind: "TEAM", athleteItem: false, teamShare: "" }]).ok).toBe(false);
  });

  it("is BTG admin's alone — the page and the nav both check, before anything is fetched", () => {
    expect(isCommissionAdmin(["BTG_ADMIN"])).toBe(true);
    expect(isCommissionAdmin(["SUPER_ADMIN"])).toBe(true);
    for (const role of ["FINANCE", "SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "SPONSOR_ADMIN"]) expect(isCommissionAdmin([role])).toBe(false);
    const page = readFileSync(new URL("../src/app/(app)/admin/commission/page.tsx", import.meta.url), "utf8");
    expect(page.indexOf("isCommissionAdmin(actor.roles)")).toBeGreaterThan(-1);
    expect(page.indexOf("isCommissionAdmin(actor.roles)")).toBeLessThan(page.indexOf('apiFetch("/commission-rules")'));
    const layout = readFileSync(new URL("../src/app/(app)/admin/layout.tsx", import.meta.url), "utf8");
    /* The nav filter also applies the per-desk access map (check pass C-1);
       commission stays BTG-admin only inside it. */
    expect(layout).toMatch(/NAV\.filter\(\(n\) => mayUse\(n\.href, actor\.roles\) && \(n\.href !== "\/admin\/commission" \|\| isCommissionAdmin\(actor\.roles\)\)\)/);
  });
});

describe("2S5-FE-01 · the editor renders the rules, the forms and the preview", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CommissionEditor } = await import("../src/components/commission-editor");
  const none = async () => ({ ok: false as const, message: "n/a" });

  /* P1-ART-19 — the desk: the split strip, the picked kind's table, the sample order. */
  it("shows the split strip, the picked kind's rules with version, what applies first and the history link, and the sample order", () => {
    const html = renderToStaticMarkup(createElement(CommissionEditor, {
      rules: [
        rule({ id: "t2", ruleKey: "team", version: 2, scope: "PROPERTY_KIND", scopeRef: "TEAM", bps: 1100, priority: 5 }),
        rule({ id: "t1", ruleKey: "team", version: 1, scope: "PROPERTY_KIND", scopeRef: "TEAM", bps: 1200, priority: 5, effectiveTo: "2026-09-20T00:00:00Z" }),
        rule({ id: "g", bps: 1500 }),
        rule({ id: "p", kind: "PROCESSING", bps: 290, fixedCents: 30 }),
      ],
      actions: { create: none, revise: none, preview: none },
    }));
    /* the strip: every kind, in the ledger's order, the rate for everyone as its headline */
    expect(html).toContain('aria-label="Platform fee: 15%, everyone · 1 override"');
    expect(html).toContain('aria-label="Processing: 2.9% + $0.30, everyone · since');
    expect(html).toContain("no rule · adds nothing");
    expect(html).toMatch(/Platform fee[\s\S]*Management fee[\s\S]*Processing[\s\S]*Referral[\s\S]*Reserve[\s\S]*Property/);
    /* the first kind with a rule is picked, and its table is the API's order */
    expect(html).toContain('aria-pressed="true" aria-label="Platform fee');
    expect(html).toMatch(/All teams[\s\S]*11%[\s\S]*Everyone[\s\S]*15%/);
    expect(html).toContain("v2");
    expect(html).toContain("applies first");
    expect(html).toContain("1 earlier");
    expect(html).toContain("Revise");
    expect(html).toContain("+ Add a rule");
    /* the sample order beside it */
    expect(html).toContain("Try a sample order");
    expect(html).toContain("Work out the split");
    /* nothing of the old always-open forms */
    expect(html).not.toContain("Rules in effect");
    expect(html).not.toContain("Save rule");
  });

  it("opens on an empty desk with the first kind and one honest line", () => {
    const html = renderToStaticMarkup(createElement(CommissionEditor, { rules: [], actions: { create: none, revise: none, preview: none } }));
    expect(html).toContain('aria-pressed="true" aria-label="Platform fee: no rate for everyone, no rule · adds nothing"');
    expect(html).toContain("No platform fee rule");
    expect(html).toContain("Add one");
  });
});

describe("P1-ART-19 · the split strip's tile for a kind", () => {
  const rule = (over: Partial<ApiRule>): ApiRule => ({
    id: "r", ruleKey: "k", version: 1, kind: "PLATFORM_FEE", scope: "GLOBAL", scopeRef: null, bps: 1500, fixedCents: 30,
    priority: 0, effectiveFrom: "2026-09-12T00:00:00.000Z", effectiveTo: null, note: null, ...over,
  });
  it("headlines the rate for everyone and counts the overrides", () => {
    const s = kindSummary({ current: [rule({ id: "t", scope: "PROPERTY_KIND", scopeRef: "TEAM", bps: 1000, priority: 5 }), rule({ id: "g" })] });
    expect(s.headline).toBe("15% + $0.30");
    expect(s.overrides).toBe(1);
    expect(s.caption).toBe("everyone · 1 override");
    expect(s.empty).toBe(false);
  });
  it("says since when, when there is only the rule for everyone", () => {
    expect(kindSummary({ current: [rule({})] }).caption).toMatch(/^everyone · since Sep 1[12], 2026$/);
  });
  it("is honest when rules exist but none for everyone, and when there is no rule", () => {
    const scoped = kindSummary({ current: [rule({ scope: "SPONSOR", scopeRef: "s1" }), rule({ id: "2", scope: "PROPERTY", scopeRef: "p1" })] });
    expect(scoped.headline).toBe("—");
    expect(scoped.caption).toBe("2 scoped rules · none for everyone");
    expect(scoped.empty).toBe(false);
    const none = kindSummary({ current: [] });
    expect(none).toMatchObject({ headline: "—", caption: "no rule · adds nothing", empty: true, overrides: 0 });
  });
});
