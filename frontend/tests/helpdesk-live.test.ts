import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  HELPDESK_TOPICS, OTHER_CASE, backHref, helpdeskTopic, messageLabel, messageRequired, sendProblem, topicLabel, topicSections, type HelpdeskTopicView,
} from "@/lib/helpdesk-live";

/* The form's server actions are a "use server" module that reads Next's request; the form only needs their names here. */
vi.mock("@/app/(public)/contact/actions", () => ({ submitContactAction: vi.fn(), finishContactAction: vi.fn(), dropAttachmentAction: vi.fn() }));

/* POL-FE-43 — the help desk form. Done when: each topic shows only the
   person's cases; ticking cases with no text submits; "Other" without text
   is refused; the message reaches the inbox labelled with its cases; the
   existing contact-form tests still pass. (Which cases a person may see,
   and the refusals, are the API's — backend/tests/helpdesk-form.test.ts.
   The existing contact-form test is e2e/qa-phase2.spec.ts, unchanged.) */

/* What GET /public/support/cases answers a visitor and an athlete, cut down. */
const VISITOR: HelpdeskTopicView[] = [
  { key: "ACCOUNT", label: "Account", sections: [{ title: "Signing up", cases: [{ id: "ACC-04", text: "My application is \"with BTG\" and I don't know why" }] }] },
  { key: "PAYMENT", label: "Payment", sections: [] },
  { key: "OTHER", label: "Other", sections: [{ title: null, cases: [{ id: "OTH-01", text: "Something else" }] }] },
];
const ATHLETE: HelpdeskTopicView[] = [
  { key: "ACCOUNT", label: "Account", sections: [
    { title: "Signing up", cases: [{ id: "ACC-01", text: "My application is locked and I can't edit it" }, { id: "ACC-04", text: "My application is \"with BTG\" and I don't know why" }] },
    { title: "Emails and links", cases: [{ id: "ACC-30", text: "I didn't get the confirmation email" }] },
  ] },
  ...VISITOR.slice(1),
];

describe("the topics and their cases", () => {
  it("lists a topic's sections in the API's order, with \"Something else\" last on every topic, once", () => {
    expect(topicSections(ATHLETE, "ACCOUNT").map((s) => [s.title, s.cases.map((c) => c.id)])).toEqual([
      ["Signing up", ["ACC-01", "ACC-04"]], ["Emails and links", ["ACC-30"]], [null, ["OTH-01"]],
    ]);
    expect(topicSections(VISITOR, "PAYMENT")).toEqual([{ title: null, cases: [OTHER_CASE] }]);
    expect(topicSections(VISITOR, "OTHER")).toEqual([{ title: null, cases: [OTHER_CASE] }]);
  });

  it("each topic shows only the person's cases: what the API listed for them, nothing added", async () => {
    const { ContactForm } = await import("@/components/contact-form");
    const visitor = renderToStaticMarkup(createElement(ContactForm, { topic: "ACCOUNT", topics: VISITOR }));
    expect(visitor).toContain('value="ACC-04"');
    expect(visitor).not.toContain('value="ACC-01"');
    expect(visitor).toContain("Signed in, you’d see the cases for your account too.");
    const athlete = renderToStaticMarkup(createElement(ContactForm, { topic: "ACCOUNT", topics: ATHLETE, signedIn: true, name: "Serena Kay", email: "serena@example.invalid" }));
    for (const id of ["ACC-01", "ACC-04", "ACC-30", "OTH-01"]) expect(athlete).toContain(`value="${id}"`);
    expect(athlete).toContain("These are the cases for your account.");
    expect(athlete).toContain('value="Serena Kay"');
    expect(athlete).toContain('value="serena@example.invalid"');
  });

  it("the topic and tick boxes are a step of their own, above the message form: the form holds only name, email, message and files", async () => {
    const { ContactForm } = await import("@/components/contact-form");
    const html = renderToStaticMarkup(createElement(ContactForm, { topic: "GUARDIANSHIP", topics: VISITOR }));
    const form = html.slice(html.indexOf('<form aria-label="Message BTG"'));
    expect(html.indexOf('aria-label="What it’s about"')).toBeLessThan(html.indexOf('<form aria-label="Message BTG"'));
    expect(form).not.toContain('type="checkbox"');
    expect(form).not.toContain('type="radio"');
    expect(form).toContain('name="message"');
  });

  it("with no cases readable it is the form it was: four-plus topics and a message box, no tick boxes", async () => {
    const { ContactForm } = await import("@/components/contact-form");
    const html = renderToStaticMarkup(createElement(ContactForm, { topic: "GUARDIANSHIP" }));
    expect(html).not.toContain('type="checkbox"');
    for (const t of HELPDESK_TOPICS) expect(html).toContain(`value="${t.key}"`);
    expect(html).toContain('aria-label="Message BTG"');
  });

  it("names a topic from the API's list, or from the eight when it can't be read", () => {
    expect(topicLabel(ATHLETE, "ACCOUNT")).toBe("Account");
    expect(topicLabel([], "CAMPAIGNS")).toBe("Campaigns");
  });
});

describe("sending", () => {
  const base = { name: "Sam", email: "sam@example.invalid", message: "" };

  it("ticking cases with no text sends", () => {
    expect(sendProblem({ ...base, ticked: ["ACC-01", "ACC-30"] })).toBeNull();
    expect(messageRequired(["ACC-30"])).toBe(false);
    expect(messageLabel(["ACC-30"])).toBe("Message (optional)");
  });

  it("\"Something else\" without text is refused; with text it sends", () => {
    expect(sendProblem({ ...base, ticked: ["OTH-01"] })).toBe("You ticked “Something else”: tell us what’s wrong in the message box.");
    expect(sendProblem({ ...base, ticked: ["ACC-30", "OTH-01"], message: "  " })).toMatch(/Something else/);
    expect(sendProblem({ ...base, ticked: ["OTH-01"], message: "The sponsor page shows the wrong logo." })).toBeNull();
    expect(messageLabel(["OTH-01"])).toBe("Message (needed: tell us what’s wrong)");
  });

  it("nothing ticked needs the text, as the form always did; and a name and an email first", () => {
    expect(sendProblem({ ...base, ticked: [] })).toBe("Tick what’s wrong, or tell us in the message box.");
    expect(sendProblem({ ...base, ticked: [], message: "Carmen declined my request." })).toBeNull();
    expect(sendProblem({ ...base, name: " ", ticked: ["ACC-30"] })).toBe("Add your name.");
    expect(sendProblem({ ...base, email: "sam", ticked: ["ACC-30"] })).toBe("Add the email we should reply to.");
  });

  it("the action sends the ticked cases, with the person's session when signed in (so the message is linked)", () => {
    const actions = readFileSync(new URL("../src/app/(public)/contact/actions.ts", import.meta.url), "utf8");
    expect(actions).toMatch(/helpdeskApi\("\/public\/support\/messages"/);
    expect(actions).toMatch(/cases: input\.cases/);
    const api = readFileSync(new URL("../src/server/helpdesk.ts", import.meta.url), "utf8");
    expect(api).toMatch(/Authorization: `Bearer \$\{token\}`/);
  });
});

describe("the page's links", () => {
  it("?topic= picks a topic — the old links (guardianship, account, payment, other) and the new ones", () => {
    expect(helpdeskTopic("guardianship")).toBe("GUARDIANSHIP");
    expect(helpdeskTopic("payment")).toBe("PAYMENT");
    expect(helpdeskTopic("shop")).toBe("SHOP");
    expect(helpdeskTopic(undefined)).toBe("GUARDIANSHIP");
    expect(helpdeskTopic(undefined, true)).toBe("ACCOUNT");
    expect(helpdeskTopic("nope", true)).toBe("ACCOUNT");
  });

  it("?back= returns only to a portal's own page, never elsewhere", () => {
    expect(backHref("/athlete")).toBe("/athlete");
    expect(backHref("/sponsor/orders")).toBe("/sponsor/orders");
    expect(backHref("//evil.example")).toBeNull();
    expect(backHref("https://evil.example")).toBeNull();
    expect(backHref("/contact")).toBeNull();
    expect(backHref("/admin\\x")).toBeNull();
  });

  it("every portal's header has the ? that opens the help desk with the way back", () => {
    const shell = readFileSync(new URL("../src/components/portal-shell.tsx", import.meta.url), "utf8");
    expect(shell).toMatch(/href=\{`\/contact\?back=\$\{encodeURIComponent\(rootHref\)\}`\}/);
    expect(shell).toMatch(/aria-label="Help: contact BTG"/);
  });
});
