import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PropertyChangeRejectInput, PropertyContactInput, PropertyIdentityInput, PropertyManagerInput } from "../../backend/src/contracts/property-profile";
import { DETAILS_SCHEMA } from "../../backend/src/domain/onboarding-rules";
import {
  DESCRIPTION_MAX, changeAsks, changeNotice, changeRows, deskRefusal, detailFields, detailLabel, detailRows, identityDraftFrom, isPropertyProfile, kindNoun,
  kindWord, orgInitials, placeLine, propertyRefusal, validateContact, validateDescription, validateIdentity, validateManager, waitedLine,
  type ApiPropertyChange, type ApiPropertyProfile,
} from "../src/lib/property-profile-live";

/* POL-FE-104 — a team's own Profile page: what each form checks before it
   asks, what the page says about a name, place or details change, and BTG's
   list of the held ones. Every input a form lets through is one the API's
   own contract (POL-BE-104) accepts, and the type's details pass the same
   schema the sign-up used. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const NOW = new Date("2026-11-20T15:00:00.000Z");

const DETAILS = { legalEntityName: "Bowie Hawks Basketball Inc", league: "AAU", sport: "Basketball" };
const change = (over: Partial<ApiPropertyChange> = {}): ApiPropertyChange => ({
  id: "ppc_1", status: "PENDING", changes: { stateCode: "CA" }, before: { stateCode: "MD" },
  holdReasons: ["Missing for the new state: Business registration (CA)."], autoApproved: false, reason: null,
  requestedAt: "2026-11-18T10:00:00.000Z", decidedAt: null, ...over,
});
const profile = (over: Partial<ApiPropertyProfile> = {}, property: Partial<ApiPropertyProfile["property"]> = {}): ApiPropertyProfile => ({
  property: {
    id: "prop_1", name: "Bowie Hawks", kind: "TEAM", kindManagedBy: "BTG", city: "Bowie", stateCode: "MD", details: { ...DETAILS },
    description: null, contact: { name: "Sam Rivera", email: "sam@hawks.example", phone: null }, ...property,
  },
  me: { name: null, jobTitle: null, phone: null, email: "jordan@hawks.example", signIn: "CLERK" },
  pendingChange: null, lastDecision: null, notificationPreferences: [], ...over,
});

describe("words", () => {
  it("names the type and the place plainly", () => {
    expect(kindWord("TEAM")).toBe("Team");
    expect(kindWord("YOUTH_CLUB")).toBe("Youth club");
    expect(kindNoun("SCHOOL")).toBe("school");
    expect(kindNoun("SOMETHING")).toBe("organisation");
    expect(placeLine({ city: "Bowie", stateCode: "MD" })).toBe("Bowie, Maryland");
    expect(placeLine({ city: null, stateCode: "ME" })).toBe("Maine");
    expect(placeLine({ city: null, stateCode: null })).toBe("");
    expect(orgInitials("Bowie Hawks")).toBe("BH");
    expect(orgInitials(" - ")).toBe("?");
  });
  it("lists the type's details in the sign-up form's order, with an empty one said so", () => {
    expect(detailRows("TEAM", DETAILS)).toEqual([
      { key: "legalEntityName", label: "Legal entity name", value: "Bowie Hawks Basketball Inc" },
      { key: "league", label: "League", value: "AAU" },
      { key: "sport", label: "Sport", value: "Basketball" },
      { key: "stateRegistrationId", label: "State business registration number", value: "" },
    ]);
    expect(detailRows("SCHOOL", { district: "PGCPS", athleticDirector: "Pat Lee", sports: ["Basketball", "Soccer"] })[2])
      .toEqual({ key: "sports", label: "Sports offered", value: "Basketball, Soccer" });
    /* An organisation BTG set up without a sign-up has no details to list; a key the form doesn't know still shows. */
    expect(detailRows("TEAM", null)).toEqual([]);
    expect(detailLabel("TEAM", "homeVenue")).toBe("Home Venue");
  });
});

describe("a change, field by field", () => {
  it("shows what was on file and what was asked for, and only the details that differ", () => {
    const c = change({ changes: { name: "Bowie Hawks Elite", city: null, details: { ...DETAILS, league: "AAU 16U" } }, before: { name: "Bowie Hawks", city: "Bowie", details: DETAILS } });
    expect(changeRows(c, "TEAM")).toEqual([
      { key: "name", label: "Name", before: "Bowie Hawks", after: "Bowie Hawks Elite" },
      { key: "city", label: "City", before: "Bowie", after: "removed" },
      { key: "details.league", label: "League", before: "AAU", after: "AAU 16U" },
    ]);
    expect(changeAsks(c, "TEAM")).toBe("a new name, city and league");
    expect(changeRows(change(), "TEAM")).toEqual([{ key: "stateCode", label: "State", before: "Maryland", after: "California" }]);
    expect(changeAsks(change(), "TEAM")).toBe("a new state");
  });
});

describe("the notice about the name, place and details", () => {
  it("nothing waiting and nothing decided: nothing to say", () => {
    expect(changeNotice(profile(), NOW)).toBeNull();
  });
  it("a change waiting for BTG says so, with why and what was asked, and wins over an older answer", () => {
    const n = changeNotice(profile({ pendingChange: change(), lastDecision: change({ status: "REJECTED", reason: "No." }) }), NOW)!;
    expect(n).toMatchObject({ tone: "wait", title: "Waiting for BTG", reasons: ["Missing for the new state: Business registration (CA)."] });
    expect(n.text).toContain("a new state");
    expect(n.text).toContain("your team keeps what is on file");
    expect(n.rows).toHaveLength(1);
  });
  it("a rejection is always shown, with BTG's reason", () => {
    const old = change({ status: "REJECTED", reason: "That's another team's name.", decidedAt: "2026-06-01T10:00:00.000Z" });
    expect(changeNotice(profile({ lastDecision: old }), NOW)).toMatchObject({ tone: "late", title: "BTG didn’t approve your change", reasons: ["That's another team's name."] });
  });
  it("a change in effect is announced for two weeks, and says whether it went through by itself", () => {
    const auto = change({ status: "APPROVED", autoApproved: true, holdReasons: [], decidedAt: "2026-11-18T10:00:05.000Z" });
    expect(changeNotice(profile({ lastDecision: auto }), NOW)).toMatchObject({ tone: "live", title: "Your change is in effect", text: "The new state took effect on Nov 18, 2026.", reasons: [] });
    expect(changeNotice(profile({ lastDecision: { ...auto, autoApproved: false } }), NOW)!.title).toBe("BTG approved your change");
    expect(changeNotice(profile({ lastDecision: { ...auto, decidedAt: "2026-10-30T10:00:00.000Z" } }), NOW)).toBeNull();
  });
});

describe("the details that save at once", () => {
  it("the description is trimmed, cleared when left empty, and kept under the API's limit", () => {
    expect(validateDescription("  17U travel basketball out of Bowie, MD. ")).toEqual({ ok: true, input: { description: "17U travel basketball out of Bowie, MD." } });
    expect(validateDescription("   ")).toEqual({ ok: true, input: { description: null } });
    expect(validateDescription("x".repeat(DESCRIPTION_MAX + 1))).toMatchObject({ ok: false });
  });
  it("the main contact keeps a name; an empty phone is cleared; the email is never part of it", () => {
    expect(validateContact({ name: " Sam Rivera ", phone: "" })).toEqual({ ok: true, input: { contactName: "Sam Rivera", contactPhone: null } });
    expect(validateContact({ name: "  ", phone: "" })).toMatchObject({ ok: false, errors: { name: "A contact needs a name." } });
    expect(validateContact({ name: "Sam", phone: "ring me" })).toMatchObject({ ok: false, errors: { phone: "That doesn’t look like a phone number." } });
    expect(PropertyContactInput.safeParse({ contactEmail: "x@y.example" }).success).toBe(false);
  });
  it("the manager's own details clear what is left empty", () => {
    expect(validateManager({ name: " Jordan Park ", jobTitle: "", phone: "+1 301 555 0123" })).toEqual({ ok: true, input: { name: "Jordan Park", jobTitle: null, phone: "+1 301 555 0123" } });
    const bad = validateManager({ name: "x".repeat(121), jobTitle: "y".repeat(121), phone: "1".repeat(41) });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(["jobTitle", "name", "phone"]);
  });
  it("everything a form lets through is what the API's own contract takes", () => {
    for (const raw of ["Travel basketball.", "", "x".repeat(DESCRIPTION_MAX)]) {
      const v = validateDescription(raw);
      expect(v.ok && PropertyContactInput.safeParse(v.input).success, raw.slice(0, 12)).toBe(true);
    }
    for (const d of [{ name: "Sam Rivera", phone: "+1 301 555 0199" }, { name: "x".repeat(200), phone: "" }]) {
      const v = validateContact(d);
      expect(v.ok && PropertyContactInput.safeParse(v.input).success).toBe(true);
    }
    for (const d of [{ name: "Jordan Park", jobTitle: "Team Manager", phone: "301-555-0123" }, { name: "", jobTitle: "", phone: "" }]) {
      const v = validateManager(d);
      expect(v.ok && PropertyManagerInput.safeParse(v.input).success).toBe(true);
    }
  });
});

describe("a new name, place or details", () => {
  const current = profile().property;
  const draft = () => identityDraftFrom(current);

  it("starts from what is on file, and offers the type's own fields", () => {
    expect(draft()).toEqual({ name: "Bowie Hawks", city: "Bowie", stateCode: "MD", details: { legalEntityName: "Bowie Hawks Basketball Inc", league: "AAU", sport: "Basketball", stateRegistrationId: "" } });
    expect(detailFields(current).map((f) => f.key)).toEqual(["legalEntityName", "league", "sport", "stateRegistrationId"]);
    /* An organisation BTG set up without a sign-up, or of a type the form doesn't know, changes its name and place only. */
    expect(detailFields({ kind: "TEAM", details: null })).toEqual([]);
    expect(detailFields({ kind: "SOMETHING", details: {} })).toEqual([]);
  });
  it("asking for exactly what is on file is caught before the API is asked", () => {
    expect(validateIdentity(current, draft())).toMatchObject({ ok: false, same: true });
    expect(validateIdentity(current, { ...draft(), name: "  Bowie Hawks " })).toMatchObject({ ok: false, same: true });
  });
  it("sends only what differs", () => {
    expect(validateIdentity(current, { ...draft(), name: "Bowie Hawks Elite" })).toEqual({ ok: true, input: { name: "Bowie Hawks Elite" } });
    expect(validateIdentity(current, { ...draft(), city: " Upper Marlboro " })).toEqual({ ok: true, input: { city: "Upper Marlboro" } });
    expect(validateIdentity(current, { ...draft(), city: "" })).toEqual({ ok: true, input: { city: null } });
    expect(validateIdentity(current, { ...draft(), stateCode: "va" })).toEqual({ ok: true, input: { stateCode: "VA" } });
  });
  it("sends the details whole when one of them changed, as the sign-up schema takes them", () => {
    const v = validateIdentity(current, { ...draft(), details: { ...draft().details, league: "AAU 16U" } });
    expect(v).toEqual({ ok: true, input: { details: { legalEntityName: "Bowie Hawks Basketball Inc", league: "AAU 16U", sport: "Basketball" } } });
    expect(v.ok && DETAILS_SCHEMA.TEAM.safeParse(v.input.details).success).toBe(true);
    expect(v.ok && PropertyIdentityInput.safeParse(v.input).success).toBe(true);
    /* A school's sports are typed with commas and sent as a list. */
    const school = profile({}, { kind: "SCHOOL", details: { district: "PGCPS", athleticDirector: "Pat Lee", sports: ["Basketball"] } }).property;
    const s = validateIdentity(school, { ...identityDraftFrom(school), details: { district: "PGCPS", athleticDirector: "Pat Lee", sports: "Basketball, Soccer" } });
    expect(s).toEqual({ ok: true, input: { details: { district: "PGCPS", athleticDirector: "Pat Lee", sports: ["Basketball", "Soccer"] } } });
    expect(s.ok && DETAILS_SCHEMA.SCHOOL.safeParse(s.input.details).success).toBe(true);
  });
  it("names what's wrong, field by field: a name, a state, a required detail", () => {
    const v = validateIdentity(current, { name: " ", city: "x".repeat(121), stateCode: "", details: { ...draft().details, league: "" } });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errors).sort()).toEqual(["city", "details.league", "name", "stateCode"]);
    expect(validateIdentity(current, { ...draft(), stateCode: "ZZ" })).toMatchObject({ ok: false, errors: { stateCode: expect.stringContaining("US state") } });
    expect(validateIdentity(current, { ...draft(), name: "!!!" })).toMatchObject({ ok: false, errors: { name: "Use letters or numbers in the name." } });
  });
  it("untouched details are never re-checked, so a rename isn't blocked by an old record", () => {
    const thin = profile({}, { details: { legalEntityName: "Bowie Hawks Basketball Inc" } }).property;
    expect(validateIdentity(thin, { ...identityDraftFrom(thin), name: "Bowie Hawks Elite" })).toEqual({ ok: true, input: { name: "Bowie Hawks Elite" } });
  });
  it("an organisation with no state on file may rename without picking one; one with a state can't remove it", () => {
    const stateless = profile({}, { stateCode: null, details: null }).property;
    expect(validateIdentity(stateless, { ...identityDraftFrom(stateless), name: "Bowie Hawks Elite" })).toEqual({ ok: true, input: { name: "Bowie Hawks Elite" } });
    expect(validateIdentity(current, { ...draft(), stateCode: "" })).toMatchObject({ ok: false, errors: { stateCode: "Pick the state you operate in." } });
  });
  it("the type is never part of a change", () => {
    expect(PropertyIdentityInput.safeParse({ kind: "SCHOOL" }).success).toBe(false);
    expect(src("components/property-profile.tsx")).toContain("is BTG&rsquo;s to change, so it isn&rsquo;t offered here");
  });
});

describe("refusals", () => {
  it("plain words for a 403 and an outage; the API's own sentence for a 409 or a 422; a 400's first field problem", () => {
    expect(propertyRefusal(403, { error: { message: "forbidden: property write" } }, "x")).toBe("Only this organisation’s own manager can change its profile.");
    expect(propertyRefusal(409, { error: { message: "A change is already waiting for BTG. You can make another once BTG has answered." } }, "x")).toMatch(/already waiting for BTG/);
    expect(propertyRefusal(422, { error: { message: "There is no main contact on file. Ask BTG to add one." } }, "x")).toBe("There is no main contact on file. Ask BTG to add one.");
    expect(propertyRefusal(400, { error: { message: "Invalid input", issues: [{ message: "Too long." }] } }, "x")).toBe("Too long.");
    expect(propertyRefusal(0, null, "x")).toMatch(/couldn’t reach SponsorX/);
    expect(propertyRefusal(500, null, "Your details weren’t saved")).toBe("Your details weren’t saved (500).");
  });
});

describe("where it lives, and who it reaches", () => {
  const page = src("app/(app)/property/profile/page.tsx");
  const actions = src("app/(app)/property/profile/actions.ts");
  const view = src("components/property-profile.tsx");

  it("is in the property portal's menu, and reads GET /property/profile behind the portal's gate", () => {
    expect(src("app/(app)/property/layout.tsx")).toContain('{ href: "/property/profile", label: "Profile", icon: "user" }');
    expect(page).toContain('requirePortalAccess("property")');
    expect(page).toContain('apiFetch("/property/profile")');
    expect(src("app/(app)/property/profile/loading.tsx")).toContain('role="status"');
  });
  it("a caller the API refuses is told why, never shown a sample organisation", () => {
    expect(page).toContain("This login isn't linked to an organisation");
    expect(page).toContain("Not in your role");
    expect(page).not.toMatch(/fixtures/);
  });
  it("its actions file exports only async functions and uses the three routes", () => {
    expect(actions.startsWith('"use server";')).toBe(true);
    const exported = [...actions.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1]!);
    expect(exported.length).toBe(5);
    for (const e of exported) expect(e, e).toMatch(/^(async function |type )/);
    expect(actions).toContain('write("/property/profile", "PATCH"');
    expect(actions).toContain('write("/property/profile/me", "PATCH"');
    expect(actions).toContain('write("/property/profile/change", "POST"');
    /* Email, password and two-step sign-in are Clerk's: the page opens Clerk's own screen and sends none of them anywhere. */
    expect(view).toContain("clerk.openUserProfile()");
    expect(actions).not.toMatch(/password|contactEmail/i);
  });
  it("while a change waits the button to ask for another is gone, and the notice carries the reasons", () => {
    expect(view).toContain("{!profile.pendingChange && (");
    expect(view).toContain("Why BTG checks it first");
    expect(view).toContain("BTG’s reason");
  });
  it("stays inside the property portal: Help, Settings and Branding are its own", () => {
    const links = [...view.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l, l).toMatch(/^\/property\//);
  });
  it("one write at a time: the busy flag is a ref, flipped before the first await", () => {
    const run = view.slice(view.indexOf("const run = async"), view.indexOf("const close ="));
    expect(run.indexOf("inFlight.current = true")).toBeGreaterThan(-1);
    expect(run.indexOf("inFlight.current = true")).toBeLessThan(run.indexOf("await "));
    expect(run).toContain("inFlight.current = false");
  });
  it("draws only an answer with the organisation and the manager in it", () => {
    expect(isPropertyProfile(profile())).toBe(true);
    expect(isPropertyProfile({ error: { message: "forbidden" } })).toBe(false);
    expect(isPropertyProfile(null)).toBe(false);
  });
});

describe("BTG's list of held changes (New sign-ups)", () => {
  const section = src("components/property-changes-section.tsx");
  const decide = src("components/property-change-decision.tsx");
  const actions = src("app/(app)/admin/new-signups/property-change-actions.ts");

  it("is read from GET /property-profile-changes and drawn on New sign-ups only when something waits", () => {
    expect(section).toContain('apiFetch("/property-profile-changes")');
    expect(section).toContain("if (res.status === 403) return null;");
    expect(section).toContain("changes.length === 0) return null;");
    expect(src("app/(app)/admin/new-signups/(stream)/page.tsx")).toContain("<PropertyChanges />");
  });
  it("shows what was asked, why it was held, and how long it has waited", () => {
    expect(section).toContain("changeRows(c, c.property.kind)");
    expect(section).toContain("Why it was held");
    expect(waitedLine("2026-11-20T09:00:00.000Z", NOW)).toBe("today");
    expect(waitedLine("2026-11-19T10:00:00.000Z", NOW)).toBe("1 day");
    expect(waitedLine("2026-11-14T10:00:00.000Z", NOW)).toBe("6 days");
  });
  it("approves and rejects through the API's two routes; a rejection needs the reason the organisation reads", () => {
    expect(actions.startsWith('"use server";')).toBe(true);
    const exported = [...actions.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1]!);
    for (const e of exported) expect(e, e).toMatch(/^(async function |type )/);
    expect(actions).toContain("/approve`");
    expect(actions).toContain("/reject`, { reason: why }");
    expect(PropertyChangeRejectInput.safeParse({ reason: "That's another team's name." }).success).toBe(true);
    expect(PropertyChangeRejectInput.safeParse({ reason: "  " }).success).toBe(false);
    expect(decide).toContain("disabled={busy !== null || !reason.trim()}");
  });
  it("says who decides when the role can't, and passes on the API's sentence for a change already answered", () => {
    expect(deskRefusal(403, null, "x")).toBe("Only a BTG Admin decides these changes.");
    expect(deskRefusal(409, { error: { message: "BTG has already answered this change." } }, "x")).toBe("BTG has already answered this change.");
    expect(deskRefusal(404, { error: { message: "No such change." } }, "x")).toBe("No such change.");
    expect(deskRefusal(500, null, "x")).toMatch(/nothing changed/);
  });
  it("its reject pop-up is portaled, because the card it opens from is clipped", () => {
    expect(decide).toContain("<OrderDialog");
    expect(decide).not.toContain('className="fixed');
  });
});
