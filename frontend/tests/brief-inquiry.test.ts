import { describe, expect, it } from "vitest";

import { toInquiry } from "../src/lib/brief-inquiry";
import { emptyBriefDraft } from "../src/lib/brief-flow";

/* --------------------------------------------------------------------------
   P2-FE-01 — the public brief, as POST /public/inquiries takes it. The
   contract is strict (unknown keys are a 400), so every structured answer
   must travel inside `message`, and optional fields must be absent, not "".
   -------------------------------------------------------------------------- */

function draft(answers: Record<string, string>) {
  const d = emptyBriefDraft();
  d.goal = "Drive foot traffic";
  d.budget = "$2.5k – $5k";
  d.answers = answers;
  return d;
}

describe("the brief → inquiry mapping", () => {
  it("splits the name, keeps only contract keys, and carries the brief in the message", async () => {
    const q = toInquiry(
      draft({ name: "Jordan Q. Avery", email: " jordan@cafemilo.com ", company: "Cafe Milo", category: "QSR", market: "Silver Spring, MD" }),
    );
    expect(q.firstName).toBe("Jordan Q.");
    expect(q.lastName).toBe("Avery");
    expect(q.email).toBe("jordan@cafemilo.com");
    expect(Object.keys(q).sort()).toEqual(["companyName", "email", "firstName", "lastName", "message"]);
    expect(q.message).toContain("Goal: Drive foot traffic");
    expect(q.message).toContain("Market: Silver Spring, MD");
    expect(q.message).toContain("Package: Not sure yet");
  });

  it("a one-word name is the last name; blank optionals are absent, not empty", async () => {
    const q = toInquiry(draft({ name: "Cher", email: "c@x.com", phone: " ", timing: "" }));
    expect(q.lastName).toBe("Cher");
    expect("firstName" in q).toBe(false);
    expect("phone" in q).toBe(false);
    expect(q.message).not.toContain("Timing");
  });

  it("stays inside the contract's length limits", async () => {
    const q = toInquiry(draft({ name: "A B", email: "a@b.co", category: "x".repeat(5000) }));
    expect(q.message.length).toBeLessThanOrEqual(4000);
  });
});
