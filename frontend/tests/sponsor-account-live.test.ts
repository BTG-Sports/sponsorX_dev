import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SponsorAccountChangeInput, SponsorCompanyInput, SponsorMeInput } from "../../backend/src/contracts/sponsor-account";
import { groupNav } from "../src/lib/nav-groups";
import {
  CATEGORY_OPTIONS, LOGO_MAX_BYTES, SPONSOR_EMAIL_EVENTS, accountRefusal, categoriesLine, categoryWord, changeAsks, changeNotice, companyInitials, sponsorPrefs, validateChange,
  validateCompany, validateLogoFile, validateMe, websiteOf,
  type ApiAccountChange, type ApiSponsorAccount,
} from "../src/lib/sponsor-account-live";
import { SPONSOR_NAV, sponsorNavFor } from "../src/lib/sponsor-nav";

/* POL-FE-102 — the sponsor's Account page: what a form checks before it asks,
   and what the page says about a name or category change. Every input a form
   lets through is one the API's own contract (POL-BE-102) accepts. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-19T15:00:00.000Z");

const change = (over: Partial<ApiAccountChange> = {}): ApiAccountChange => ({
  id: "sac_1", status: "PENDING", name: null, categories: ["EDUCATION", "ALCOHOL"], holdReasons: ["Alcohol is a sensitive category: a BTG person approves it."],
  autoApproved: false, reason: null, requestedAt: "2026-11-18T10:00:00.000Z", decidedAt: null, ...over,
});
const account = (over: Partial<ApiSponsorAccount> = {}): ApiSponsorAccount => ({
  company: { id: "sp_1", name: "Bluefin Tutoring", categories: ["EDUCATION"], logoUrl: null, website: null, address: null, billingContact: { name: null, email: null, phone: null } },
  me: { name: null, jobTitle: null, email: "isaiah@bluefin.example", signIn: "CLERK" },
  canEdit: true, pendingChange: null, lastDecision: null, notificationPreferences: [], ...over,
});

describe("words", () => {
  it("names a category in plain words, and shows one it doesn't know as it is", () => {
    expect(categoryWord("ENERGY_DRINK")).toBe("Energy drink");
    expect(categoryWord("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(categoriesLine(["APPAREL", "FOOTWEAR"])).toBe("Apparel, Footwear");
    expect(categoriesLine([])).toBe("None on file");
  });
  it("offers every category once, A to Z by its label", () => {
    const labels = CATEGORY_OPTIONS.map((o) => o.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
    expect(new Set(CATEGORY_OPTIONS.map((o) => o.value)).size).toBe(CATEGORY_OPTIONS.length);
    expect(CATEGORY_OPTIONS.length).toBeGreaterThan(20);
  });
  it("gives a company with no logo two letters", () => {
    expect(companyInitials("Bluefin Tutoring")).toBe("BT");
    expect(companyInitials("Nike")).toBe("NI");
    expect(companyInitials(" - ")).toBe("?");
  });
  it("says what a change asked for", () => {
    expect(changeAsks({ name: "Bluefin Learning", categories: null })).toBe("the name “Bluefin Learning”");
    expect(changeAsks({ name: null, categories: ["EDUCATION", "FITNESS"] })).toBe("the categories Education, Fitness");
    expect(changeAsks({ name: "Bluefin Learning", categories: ["FITNESS"] })).toBe("the name “Bluefin Learning” and the categories Fitness");
  });
});

describe("the notice about the name and categories", () => {
  it("nothing waiting and nothing decided: nothing to say", () => {
    expect(changeNotice(account(), NOW)).toBeNull();
  });
  it("a change waiting for BTG says so, with why it waits, and wins over an older answer", () => {
    const n = changeNotice(account({ pendingChange: change(), lastDecision: change({ status: "REJECTED", reason: "No." }) }), NOW)!;
    expect(n).toMatchObject({ tone: "wait", title: "Waiting for BTG", reasons: ["Alcohol is a sensitive category: a BTG person approves it."] });
    expect(n.text).toContain("the categories Education, Alcohol");
    expect(n.text).toContain("keeps what is on file");
  });
  it("a rejection is always shown, with BTG's reason", () => {
    const old = change({ status: "REJECTED", reason: "Alcohol needs a signed age policy first.", decidedAt: "2026-06-01T10:00:00.000Z" });
    expect(changeNotice(account({ lastDecision: old }), NOW)).toMatchObject({ tone: "late", title: "BTG didn’t approve your change", reasons: ["Alcohol needs a signed age policy first."] });
  });
  it("an approval is announced for two weeks, and says whether it went through by itself", () => {
    const auto = change({ status: "APPROVED", autoApproved: true, holdReasons: [], decidedAt: "2026-11-18T10:00:05.000Z" });
    expect(changeNotice(account({ lastDecision: auto }), NOW)).toMatchObject({ tone: "live", title: "Your change is in effect", reasons: [] });
    expect(changeNotice(account({ lastDecision: { ...auto, autoApproved: false } }), NOW)!.title).toBe("BTG approved your change");
    expect(changeNotice(account({ lastDecision: { ...auto, decidedAt: "2026-10-30T10:00:00.000Z" } }), NOW)).toBeNull();
  });
});

describe("the details that save at once", () => {
  const draft = { website: "", address: "", billingName: "", billingEmail: "", billingPhone: "" };
  it("takes a website typed without its https://, and nothing that isn't an address", () => {
    expect(websiteOf("bluefin.example")).toBe("https://bluefin.example");
    expect(websiteOf("http://bluefin.example/x")).toBe("http://bluefin.example/x");
    expect(websiteOf("  ")).toBeNull();
    expect(validateCompany({ ...draft, website: "not a site" })).toMatchObject({ ok: false });
    expect(validateCompany({ ...draft, website: "javascript:alert(1)" })).toMatchObject({ ok: false });
  });
  it("clears a field left empty, and trims the rest", () => {
    const v = validateCompany({ website: " bluefin.example ", address: " 12 Harbor St ", billingName: "", billingEmail: "", billingPhone: " 207-555-0142 " });
    expect(v).toEqual({ ok: true, input: { website: "https://bluefin.example", address: "12 Harbor St", billingContactName: null, billingContactEmail: null, billingContactPhone: "207-555-0142" } });
  });
  it("refuses an email that isn't one and anything too long, field by field", () => {
    const v = validateCompany({ ...draft, billingEmail: "dana@", address: "x".repeat(501), billingPhone: "1".repeat(41) });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["address", "billingEmail", "billingPhone"]);
  });
  it("everything a form lets through is what the API's own contract takes", () => {
    const v = validateCompany({ website: "bluefin.example", address: "12 Harbor St", billingName: "Dana Brooks", billingEmail: "billing@bluefin.example", billingPhone: "207-555-0142" });
    expect(v.ok && SponsorCompanyInput.safeParse(v.input).success).toBe(true);
    const cleared = validateCompany(draft);
    expect(cleared.ok && SponsorCompanyInput.safeParse(cleared.input).success).toBe(true);
    const me = validateMe({ name: " Isaiah Russell ", jobTitle: "" });
    expect(me).toEqual({ ok: true, input: { name: "Isaiah Russell", jobTitle: null } });
    expect(me.ok && SponsorMeInput.safeParse(me.input).success).toBe(true);
    expect(validateMe({ name: "x".repeat(121), jobTitle: "" })).toMatchObject({ ok: false });
  });
  it("a logo is a PNG or JPEG up to 1 MB", () => {
    expect(validateLogoFile({ type: "image/png", size: 2000 })).toEqual({ ok: true, contentType: "image/png", bytes: 2000 });
    expect(validateLogoFile({ type: "image/svg+xml", size: 2000 })).toMatchObject({ ok: false });
    expect(validateLogoFile({ type: "image/jpeg", size: LOGO_MAX_BYTES + 1 })).toMatchObject({ ok: false });
    expect(validateLogoFile({ type: "image/jpeg", size: 0 })).toMatchObject({ ok: false });
  });
});

describe("a new name or categories", () => {
  const current = { name: "Bluefin Tutoring", categories: ["EDUCATION"] };
  it("sends only what differs from what is on file", () => {
    expect(validateChange(current, { name: "Bluefin Learning", categories: ["EDUCATION"] })).toEqual({ ok: true, input: { name: "Bluefin Learning" } });
    expect(validateChange(current, { name: " Bluefin Tutoring ", categories: ["EDUCATION", "FITNESS"] })).toEqual({ ok: true, input: { categories: ["EDUCATION", "FITNESS"] } });
    const both = validateChange(current, { name: "Bluefin Learning", categories: ["FITNESS"] });
    expect(both.ok && SponsorAccountChangeInput.safeParse(both.input).success).toBe(true);
  });
  it("asking for exactly what is on file is caught before the API is asked (the same categories in another order too)", () => {
    expect(validateChange({ name: "B", categories: ["EDUCATION", "FITNESS"] }, { name: "B", categories: ["FITNESS", "EDUCATION"] })).toMatchObject({ ok: false, same: true });
  });
  it("a company keeps a name and at least one category; a value outside the list is dropped", () => {
    expect(validateChange(current, { name: "  ", categories: ["EDUCATION"] })).toMatchObject({ ok: false, errors: { name: "A company needs a name." } });
    expect(validateChange(current, { name: "Bluefin Tutoring", categories: [] })).toMatchObject({ ok: false, errors: { categories: "Keep at least one category." } });
    expect(validateChange(current, { name: "Bluefin Tutoring", categories: ["NOT_A_CATEGORY"] })).toMatchObject({ ok: false, errors: { categories: "Keep at least one category." } });
  });
});

describe("refusals", () => {
  it("a viewer's 403 in plain words; the API's own sentence for a 409 or a 422; a 400's first field problem", () => {
    expect(accountRefusal(403, { error: { message: "forbidden: sponsor write" } }, "x")).toBe("Only a Sponsor Admin can change the account. Ask an admin on your team.");
    expect(accountRefusal(409, { error: { message: "A change is already waiting for BTG." } }, "x")).toBe("A change is already waiting for BTG.");
    expect(accountRefusal(422, { error: { message: "A logo is at most 1 MB." } }, "x")).toBe("A logo is at most 1 MB.");
    expect(accountRefusal(400, { error: { message: "Invalid input", issues: [{ message: "A website starts with http:// or https://." }] } }, "x")).toBe("A website starts with http:// or https://.");
    expect(accountRefusal(0, null, "x")).toMatch(/couldn’t reach SponsorX/);
    expect(accountRefusal(500, null, "Your details weren’t saved")).toBe("Your details weren’t saved (500).");
  });
});

describe("where it lives", () => {
  it("is in the sponsor's Account group, first A to Z, for an admin and a viewer alike", () => {
    const group = groupNav(SPONSOR_NAV).groups.find((g) => g.label === "Account")!;
    expect(group.items.map((i) => i.label)).toEqual(["Account details", "Billing", "Team"]);
    expect(group.icon).toBeTruthy();
    expect(sponsorNavFor(["SPONSOR_ANALYST"]).some((i) => i.href === "/sponsor/account")).toBe(true);
  });
  it("its actions file exports only async functions, and stores nothing of the sign-in", () => {
    const actions = src("app/(app)/sponsor/account/actions.ts");
    expect(actions.startsWith('"use server";')).toBe(true);
    const exported = [...actions.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1]!);
    for (const e of exported) expect(e, e).toMatch(/^(async function |type )/);
    /* Email, password and two-step sign-in are Clerk's: the page opens Clerk's own screen and sends none of them anywhere. */
    expect(src("components/sponsor-account.tsx")).toContain("clerk.openUserProfile()");
    expect(actions).not.toMatch(/password|email:/i);
  });
});

describe("notifications", () => {
  it("a sponsor is shown only the kinds of email a sponsor is sent: none of today's switches, which are an athlete's or a student's", async () => {
    const { MUTABLE_EVENTS } = await import("../../backend/src/domain/notification-rules");
    const all = MUTABLE_EVENTS.map((event) => ({ event: event as string, channel: "EMAIL", muted: false }));
    expect(all.length).toBeGreaterThan(0);
    expect(sponsorPrefs(all)).toEqual(all.filter((p) => SPONSOR_EMAIL_EVENTS.includes(p.event)));
    /* Every kind that can be muted today belongs to an athlete (invitation, deliverable) or a student. */
    for (const e of MUTABLE_EVENTS) expect(e, e).toMatch(/^(invitation|deliverable|student)\./);
    expect(sponsorPrefs(all)).toEqual([]);
    /* With nothing to turn off the page says so, rather than drop the section or list another role's emails. */
    expect(src("components/sponsor-account.tsx")).toContain("so there is none to turn off");
  });
});
