import { describe, expect, it } from "vitest";

import {
  canAct,
  cleanEmail,
  doneLine,
  emailProblem,
  memberActions,
  otherRole,
  removeDialog,
  roleHint,
  roleWord,
  statusHint,
  statusWord,
  teamRefusal,
  teamSummary,
  type ApiTeamMember,
} from "@/lib/sponsor-team-live";

/* POL-FE-19 — the sponsor's Team page: the words for the API's roles and
   statuses, which rows take actions, the refusals in a sponsor's words, and
   the email check that saves a round trip. */

const member = (over: Partial<ApiTeamMember> = {}): ApiTeamMember => ({
  id: "u1",
  email: "pat@brand.com",
  role: "SPONSOR_ANALYST",
  status: "ACTIVE",
  addedAt: "2026-10-30T12:00:00.000Z",
  you: false,
  ...over,
});

describe("roles and statuses in a sponsor's words", () => {
  it("SPONSOR_ADMIN is an Admin, SPONSOR_ANALYST a Viewer — never the raw role", () => {
    expect(roleWord("SPONSOR_ADMIN")).toBe("Admin");
    expect(roleWord("SPONSOR_ANALYST")).toBe("Viewer");
    expect(roleHint("SPONSOR_ANALYST")).toMatch(/read only/i);
    expect(roleHint("SPONSOR_ADMIN")).toMatch(/everything/i);
    expect(otherRole("SPONSOR_ADMIN")).toBe("SPONSOR_ANALYST");
    expect(otherRole("SPONSOR_ANALYST")).toBe("SPONSOR_ADMIN");
  });

  it("the chip: Invited waits, Active is live, Removed is done", () => {
    expect(statusWord("INVITED")).toEqual({ text: "Invited", tone: "info" });
    expect(statusWord("ACTIVE")).toEqual({ text: "Active", tone: "live" });
    expect(statusWord("REMOVED")).toEqual({ text: "Removed", tone: "done" });
  });

  it("the Removed row says re-adding isn't built and that BTG can switch the login back on — instead of offering an action", () => {
    expect(statusHint("REMOVED")).toMatch(/isn't built/);
    expect(statusHint("REMOVED")).toMatch(/BTG/);
    expect(statusHint("INVITED")).toMatch(/hasn't signed in/i);
  });
});

describe("which rows take actions", () => {
  it("not you, not a removed person", () => {
    expect(canAct(member())).toBe(true);
    expect(canAct(member({ you: true }))).toBe(false);
    expect(canAct(member({ status: "REMOVED" }))).toBe(false);
    expect(canAct(member({ status: "INVITED" }))).toBe(true);
  });

  it("an invited row also gets Resend; you and the removed get nothing", () => {
    expect(memberActions(member())).toEqual(["role", "remove"]);
    expect(memberActions(member({ status: "INVITED" }))).toEqual(["role", "resend", "remove"]);
    expect(memberActions(member({ you: true, role: "SPONSOR_ADMIN" }))).toEqual([]);
    expect(memberActions(member({ status: "REMOVED" }))).toEqual([]);
  });
});

describe("the email check", () => {
  it("empty, spaces, no @, no domain, too long — and clean addresses pass", () => {
    expect(emailProblem("")).toMatch(/type their email/i);
    expect(emailProblem("   ")).toMatch(/type their email/i);
    expect(emailProblem("pat")).toMatch(/doesn't look like/);
    expect(emailProblem("pat@brand")).toMatch(/doesn't look like/);
    expect(emailProblem("pat smith@brand.com")).toMatch(/doesn't look like/);
    expect(emailProblem(`${"a".repeat(95)}@brand.com`)).toMatch(/too long/);
    expect(emailProblem("pat@brand.com")).toBeNull();
    expect(emailProblem("  Pat.Smith+x@sub.brand.co  ")).toBeNull();
  });

  it("sends the address as the API stores it", () => {
    expect(cleanEmail("  Pat@Brand.COM ")).toBe("pat@brand.com");
  });
});

describe("refusals", () => {
  it("the fixed sentences polish.md §19 asks for", () => {
    expect(teamRefusal(409)).toBe("That address already has a SponsorX login.");
    expect(teamRefusal(429)).toBe("Too many tries. Try again in an hour.");
    expect(teamRefusal(429, "Too many requests. Please try again shortly.")).toBe("Too many tries. Try again in an hour.");
    expect(teamRefusal(422, "You can't change or remove yourself. Ask another admin.")).toMatch(/^You can't change your own access\./);
    expect(teamRefusal(403)).toMatch(/Sponsor Admin/);
    expect(teamRefusal(404)).toMatch(/isn't on your team/);
  });

  it("a 409 that says something more exact keeps the API's words", () => {
    expect(teamRefusal(409, "This person has been removed from your team.")).toBe("This person has been removed from your team.");
    expect(teamRefusal(409, "Only an invite nobody has used yet can be sent again.")).toMatch(/nobody has used yet/);
    expect(teamRefusal(409, "   ")).toBe("That address already has a SponsorX login.");
  });

  it("anything else names the status and never the empty string", () => {
    expect(teamRefusal(500)).toMatch(/HTTP 500/);
    expect(teamRefusal(503, "Something went wrong on our side.")).toBe("Something went wrong on our side.");
    expect(teamRefusal(400)).toMatch(/check the address/i);
  });
});

describe("the dialogs and the lines after a write", () => {
  it("removing an invite cancels it; removing a member switches the login off and says re-adding isn't built", () => {
    const inv = removeDialog(member({ status: "INVITED" }));
    expect(inv.title).toBe("Cancel the invite to pat@brand.com?");
    expect(inv.button).toBe("Cancel the invite");
    const act = removeDialog(member());
    expect(act.title).toBe("Remove pat@brand.com?");
    expect(act.line).toMatch(/switched off/);
    expect(act.line).toMatch(/isn't built/);
    expect(act.button).toBe("Remove");
  });

  it("names the person and what happened", () => {
    expect(doneLine("invite", member({ role: "SPONSOR_ADMIN", status: "INVITED" }))).toBe("Invite sent to pat@brand.com. They're an Admin once they sign in.");
    expect(doneLine("role", member({ role: "SPONSOR_ANALYST" }))).toBe("pat@brand.com is now a Viewer.");
    expect(doneLine("resend", member({ status: "INVITED" }))).toBe("Invite sent again to pat@brand.com.");
    expect(doneLine("remove", member({ status: "INVITED" }))).toBe("The invite to pat@brand.com is cancelled.");
    expect(doneLine("remove", member())).toMatch(/is removed\. Their login is switched off\./);
  });
});

describe("the section line", () => {
  it("counts only what the API's whole list holds", () => {
    expect(teamSummary([])).toBe("0 people");
    expect(teamSummary([member({ status: "ACTIVE" })])).toBe("1 person");
    expect(teamSummary([member(), member(), member({ status: "INVITED" })])).toBe("2 people · 1 invite waiting");
    expect(teamSummary([member(), member({ status: "INVITED" }), member({ status: "INVITED" }), member({ status: "REMOVED" })])).toBe("1 person · 2 invites waiting · 1 removed");
  });
});
