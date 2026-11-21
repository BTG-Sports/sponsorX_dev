import { beforeEach, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-FE-80 — /athlete/profile as a step-by-step wizard while the profile is
   unfinished, and the public page itself once it's done.

   The helpers first (lib/profile-wizard.ts): which steps, done or not, what
   a step still needs, what a save sends, and that the public face carries
   only the public sections. Then the page, rendered against a stubbed API:
   an unfinished profile gets the wizard (opening on its first open step), a
   finished one gets the public page, owner-framed, with no "Open public
   page" link and no sponsor-side button.
   -------------------------------------------------------------------------- */

vi.mock("server-only", () => ({}));

const vars = vi.hoisted(() => ({
  responses: {} as Record<string, () => Response>,
  actor: { roles: ["ATHLETE"], actingFor: null } as Record<string, unknown>,
}));
vi.mock("@/server/api", () => ({
  apiFetch: async (path: string, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${path}`;
    return (vars.responses[key] ?? (() => new Response(null, { status: 404 })))();
  },
  fetchActor: async () => ({ status: "linked", actor: vars.actor }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }),
  usePathname: () => "/athlete/profile",
  useSearchParams: () => new URLSearchParams(),
  redirect: () => {},
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { sectionStates, type ApiMyProfile } from "../src/lib/profile-live";
import {
  NO_RESTRICTIONS_NOTE,
  WIZARD_STEPS,
  changeBody,
  formFrom,
  metaLine,
  minutesLeft,
  nextOpen,
  placeLine,
  profileComplete,
  publicFace,
  rowsFrom,
  everythingSelected,
  selectEverything,
  stepChanged,
  stepNeeds,
  wizardDone,
} from "../src/lib/profile-wizard";
import { BRAND_CATEGORIES, EVERYDAY_CATEGORIES, SENSITIVE_CATEGORIES } from "../src/lib/brand-categories";

const profile = (over: Partial<ApiMyProfile> = {}): ApiMyProfile => ({
  id: "pw_ath_1",
  slug: "pw-jordan-reyes",
  displayName: "Jordan Reyes",
  legalName: "Jordan A. Reyes",
  city: "Austin",
  stateCode: "TX",
  sport: "Basketball",
  position: "Point guard",
  school: "Lincoln High",
  level: "HIGH_SCHOOL",
  gradYear: 2027,
  achievements: "All-State first team",
  state: "ACTIVE",
  tier: "RISING",
  contentCapabilities: ["IG_POST"],
  brandInterests: ["APPAREL"],
  restrictedCategories: ["ALCOHOL"],
  restrictionNotes: null,
  socials: [{ platform: "INSTAGRAM", handle: "jreyes", followers: 12400, avgViews: null, source: "SELF_REPORTED" }],
  ratesConfirmed: 0,
  agreementsSigned: 1,
  birthDate: "2005-01-01",
  ageBand: null,
  guardian: null,
  ...over,
});

describe("the wizard's steps", () => {
  it("one step per section the athlete can answer — never the rate card or payment, which are BTG's", () => {
    expect(WIZARD_STEPS.map((s) => s.key)).toEqual(["identity", "sport", "socials", "capabilities", "interests", "restrictions", "agreements"]);
    expect(WIZARD_STEPS.filter((s) => s.where === "private").map((s) => s.key)).toEqual(["restrictions", "agreements"]);
  });

  it("done and complete follow the §24 meter", () => {
    expect(profileComplete(sectionStates(profile()))).toBe(true);
    const p = profile({ socials: [], agreementsSigned: 0 });
    expect(wizardDone(sectionStates(p))).toEqual([true, true, false, true, true, true, false]);
    expect(profileComplete(sectionStates(p))).toBe(false);
  });

  it("nextOpen finds the next step to do, wrapping round; -1 when all are done", () => {
    const done = [true, true, false, true, true, true, false];
    expect(nextOpen(done)).toBe(2);
    expect(nextOpen(done, 2)).toBe(6);
    expect(nextOpen(done, 6)).toBe(2);
    expect(nextOpen([true, false, true], 1)).toBe(1);
    expect(nextOpen([true, true])).toBe(-1);
    expect(minutesLeft(done)).toBe(1 + 3);
  });
});

describe("what a step needs, and what a save sends", () => {
  const f = formFrom(profile());
  const rows = rowsFrom(profile().socials);

  it("a finished profile's steps need nothing", () => {
    for (const s of WIZARD_STEPS) expect(stepNeeds(s.key, f, rows), s.key).toBeNull();
  });

  it("each step says, in a sentence, what's still missing", () => {
    expect(stepNeeds("identity", { ...f, displayName: " ", stateCode: "" }, rows)).toBe("Add your display name and choose your state to continue.");
    expect(stepNeeds("identity", { ...f, stateCode: "Texas" }, rows)).toBe("Choose your state from the list."); // POL-FE-117 — picked, not typed
    /* §24: sport alone doesn't finish the section — one more detail does. */
    expect(stepNeeds("sport", { ...f, position: "", school: "", level: "" }, rows)).toBe("Add at least one more: your position, school or level.");
    expect(stepNeeds("sport", { ...f, gradYear: "27" }, rows)).toBe("Class of needs a four-digit year, like 2027.");
    expect(stepNeeds("socials", f, [])).toBe("Add at least one account.");
    expect(stepNeeds("socials", f, [{ platform: "X", handle: "@", followers: "" }])).toBe("Every account needs a handle.");
    expect(stepNeeds("capabilities", { ...f, contentCapabilities: [] }, rows)).toBe("Pick at least one.");
    expect(stepNeeds("restrictions", { ...f, restrictedCategories: [], restrictionNotes: "" }, rows)).toMatch(/Nothing's off-limits/);
    /* "None" is an answer, and finishes the section. */
    expect(stepNeeds("restrictions", { ...f, restrictedCategories: [], restrictionNotes: NO_RESTRICTIONS_NOTE }, rows)).toBeNull();
    expect(sectionStates(profile({ restrictedCategories: [], restrictionNotes: NO_RESTRICTIONS_NOTE })).restrictions).toBe("done");
  });

  it("a save sends the full editor's own bodies — never a legal name, date of birth or guardian", () => {
    expect(changeBody("identity", { ...f, stateCode: "tx ", city: " " })).toEqual({ identity: { displayName: "Jordan Reyes", city: null, stateCode: "TX", countryCode: "US" } });
    expect(changeBody("sport", { ...f, position: "" })).toEqual({
      sport: { sport: "Basketball", position: null, school: "Lincoln High", level: "HIGH_SCHOOL", gradYear: 2027, achievements: "All-State first team" },
    });
    expect(changeBody("restrictions", f)).toEqual({ restrictions: { restrictedCategories: ["ALCOHOL"], restrictionNotes: null } });
    expect(changeBody("agreements", f)).toBeNull();
    expect(changeBody("socials", f)).toBeNull();
    for (const s of WIZARD_STEPS) {
      const body = JSON.stringify(changeBody(s.key, f) ?? {});
      expect(body).not.toMatch(/legalName|birthDate|guardian/);
    }
  });

  it("an unchanged step just moves on; any edit counts as a change", () => {
    const base = formFrom(profile());
    expect(WIZARD_STEPS.some((s) => stepChanged(s.key, base, base, rows, rows))).toBe(false);
    expect(stepChanged("identity", { ...base, stateCode: "tx" }, base, rows, rows)).toBe(false);
    expect(stepChanged("identity", { ...base, city: "Dallas" }, base, rows, rows)).toBe(true);
    expect(stepChanged("interests", { ...base, brandInterests: ["APPAREL", "FOOD"] }, base, rows, rows)).toBe(true);
    expect(stepChanged("socials", base, base, [{ ...rows[0], followers: "13000" }], rows)).toBe(true);
  });
});

describe("the public face", () => {
  it("carries only the public sections — no legal name, age, restrictions or rates", () => {
    const face = JSON.stringify(publicFace(profile({ restrictionNotes: "secret note" })));
    expect(face).toContain("Jordan Reyes");
    for (const hidden of ["Jordan A. Reyes", "2005-01-01", "ALCOHOL", "secret note", "RISING"]) expect(face).not.toContain(hidden);
  });

  it("writes the lines under the name as the public page does", () => {
    expect(metaLine(profile())).toBe("Basketball · Point guard · High school");
    expect(placeLine(profile())).toBe("Lincoln High · Austin, TX");
    expect(placeLine({ school: null, city: null, stateCode: "TX" })).toBe("TX");
  });
});

/* POL-FE-122 — "Select everything" and "Clear" on the Brands step. */
describe("Select everything on the Brands step", () => {
  const sensitive = SENSITIVE_CATEGORIES as readonly string[];

  it("picks every everyday kind and none of the six age-restricted ones", () => {
    const next = selectEverything(BRAND_CATEGORIES, EVERYDAY_CATEGORIES, []);
    expect(next).toEqual([...EVERYDAY_CATEGORIES]);
    expect(next).toHaveLength(19);
    expect(next.some((c) => sensitive.includes(c))).toBe(false);
    expect(everythingSelected(EVERYDAY_CATEGORIES, next)).toBe(true);
  });

  it("keeps an age-restricted kind the athlete tapped themselves, in the list's order", () => {
    const next = selectEverything(BRAND_CATEGORIES, EVERYDAY_CATEGORIES, ["NONPROFIT", "ALCOHOL"]);
    expect(next[0]).toBe("ALCOHOL");
    expect(next).toHaveLength(20);
  });

  it("pressed again, it removes every pick, age-restricted ones included", () => {
    const all = selectEverything(BRAND_CATEGORIES, EVERYDAY_CATEGORIES, ["GAMBLING"]);
    expect(selectEverything(BRAND_CATEGORIES, EVERYDAY_CATEGORIES, all)).toEqual([]);
  });

  it("is off until every everyday kind is picked", () => {
    expect(everythingSelected(EVERYDAY_CATEGORIES, [])).toBe(false);
    expect(everythingSelected(EVERYDAY_CATEGORIES, EVERYDAY_CATEGORIES.slice(1))).toBe(false);
    expect(everythingSelected(EVERYDAY_CATEGORIES, [...sensitive])).toBe(false);
  });
});

describe("the profile page", async () => {
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { default: Page } = await import("../src/app/(app)/athlete/profile/page");
  const render = async () => renderToStaticMarkup(createElement("div", null, await Page({ searchParams: Promise.resolve({}) })));
  const serve = (p: ApiMyProfile) => {
    vars.responses = {
      "GET /athletes/me": () => Response.json(p),
      [`GET /athletes/${p.id}/rates`]: () => Response.json({ rates: [{ jobId: "j1", jobName: "Instagram post", amount: 25000, version: 1 }] }),
      /* POL-FE-82 — a live finished profile shows what the public read sends: the public sections plus the track record. */
      [`GET /public/athletes/${p.slug}`]: () =>
        p.state === "ACTIVE"
          ? Response.json({
              slug: p.slug, ...publicFace(p), photoUrl: null, memberSince: "2026-09", featured: false, claimable: false,
              track: { campaignsCompleted: 2, brands: 2, postsLive: 3, postsVerified: 1, onTime: { onTime: 3, of: 3 }, fanRedemptions: 0, recent: [{ platform: "TIKTOK", month: "2026-10", verified: true }] },
            })
          : new Response(null, { status: 404 }),
    };
  };

  beforeEach(() => {
    vars.actor = { roles: ["ATHLETE"], actingFor: null };
  });

  it("unfinished: the wizard, opening on the first step still to do", async () => {
    serve(profile({ socials: [], agreementsSigned: 0 }));
    const html = await render();
    expect(html).toContain("Public profile");
    expect(html).toContain("Let&#x27;s finish your public page");
    expect(html).toContain("2 steps to go");
    expect(html).toContain("Live preview · your public page");
    /* Every step is in the markup; only the first open one is shown. */
    expect(html).toMatch(/<section (?!hidden)[^>]*aria-labelledby="sx-pw-h-socials"/);
    expect(html).toMatch(/<section hidden=""[^>]*aria-labelledby="sx-pw-h-identity"/);
    expect(html).toContain("Step 3 of 7");
    expect(html).toContain('href="/athlete/confirmations?return=/athlete/profile"');
    /* While unfinished, the public page is still one link away. */
    expect(html).toContain("Open public page");
    /* POL-FE-81 — while the wizard is on there's no "Full editor" button; the
       only way into the editor left is the identity step's link (legal name,
       naming a guardian), which the wizard can't do itself. */
    expect(html).not.toContain("Full editor");
    expect(html).not.toContain('href="/athlete/profile/edit"');
    expect(html).toContain('href="/athlete/profile/edit?section=identity"');
  });

  it("POL-FE-122: the Brands step has Select everything and Clear; no other step does", async () => {
    serve(profile({ socials: [], agreementsSigned: 0, brandInterests: [] }));
    const html = await render();
    const step = (k: string) => html.match(new RegExp(`<section[^>]*aria-labelledby="sx-pw-h-${k}"[\\s\\S]*?</section>`))?.[0] ?? "";
    const brands = step("interests");
    expect(brands).toContain('aria-pressed="false"');
    expect(brands).toContain("Select everything");
    expect(brands).toMatch(/<button[^>]*disabled=""[^>]*>Clear<\/button>/);
    expect(brands).toContain("leaves out the age-restricted kinds");
    expect(html.match(/Select everything<\/button>/g)).toHaveLength(1);
  });

  it("finished: the public page itself — no wizard, no Open public page, no sponsor-side button", async () => {
    serve(profile());
    const html = await render();
    expect(html).toContain("Public profile");
    expect(html).toContain('aria-label="Your public page"');
    expect(html).toContain("/athletes/pw-jordan-reyes");
    expect(html).toContain("Live");
    expect(html).toContain("Point guard");
    expect(html).toContain("Edit profile");
    expect(html).not.toContain("Open public page");
    expect(html).not.toContain("Profile steps");
    expect(html).not.toContain("Request a proposal</a>");
    expect(html).not.toContain("Request Partnership");
    /* The owner's pointer stands where the sponsor's button would be. */
    expect(html).toContain("How sponsors reach you");
    expect(html).toContain('href="/athlete/invitations"');
    /* Private sections sit under the frame, labelled as such. */
    expect(html).toContain("Only you and BTG see this");
    expect(html).toContain("Instagram post");
    /* The legal name never reaches the public frame. */
    const frame = html.slice(html.indexOf('aria-label="Your public page"'), html.indexOf("Only you and BTG see this"));
    expect(frame).not.toContain("Jordan A. Reyes");
    expect(frame).not.toContain("Instagram post");
    /* POL-FE-82 — the frame is the redesigned public page in owner mode, from the public read. */
    expect(frame).toContain('data-mode="owner"');
    expect(frame).toContain("Counted by SponsorX from finished work");
    expect(frame).toContain("TikTok post");
    expect(frame).not.toContain('href="/brief"');
    expect(frame).not.toMatch(/<h1/);
  });

  it("finished and live, but the public read fails: an error, never a stand-in", async () => {
    serve(profile());
    vars.responses[`GET /public/athletes/pw-jordan-reyes`] = () => new Response(null, { status: 503 });
    await expect(render()).rejects.toThrow(/Public page unavailable \(503\)/);
  });

  it("finished but not active yet: the page says it waits for BTG", async () => {
    serve(profile({ state: "APPROVED" }));
    const html = await render();
    expect(html).toContain("Not live yet");
    expect(html).toContain("goes live for sponsors as soon as BTG activates your profile");
  });
});
