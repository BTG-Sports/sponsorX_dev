import { describe, expect, it } from "vitest";

import { isMinorOn } from "../src/domain/guardian-rules";

/* --------------------------------------------------------------------------
   P1-FE-25 — "the guardian step appears on the existing minor rule".

   The rule exists three times: the API's (`isMinorOn`, the one that refuses
   a minor without a guardian), and two frontend copies that decide whether
   a wizard SHOWS the guardian step — the student wizard's
   (lib/next-apply.ts) and the athlete wizard's (lib/join-flow.ts). If a copy
   drifts, a student is either shown a guardian step the API doesn't need,
   or — worse — not shown one the API then demands, and the wizard dead-ends
   at a 422. Same pattern as brief-contract.test.ts: import the frontend's
   own code and hold it to the backend's answer.
   -------------------------------------------------------------------------- */

const { isMinor: studentWizardIsMinor } = await import("../../frontend/src/lib/next-apply");
const { isMinor: athleteWizardIsMinor } = await import("../../frontend/src/lib/join-flow");

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const addDays = (iso: string, n: number) => {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* Each `on` at three times of day: the day's first instant, midday and the
   last second — the rule must not depend on when in the day it is asked. */
const moments = (iso: string) => [`${iso}T00:00:00Z`, `${iso}T12:00:00Z`, `${iso}T23:59:59Z`].map((s) => new Date(s));

describe("the three copies of the minor rule agree", () => {
  const birthdays = ["2008-03-14", "2008-02-29", "2007-12-31", "2008-01-01", "2010-06-15"];

  it.each(birthdays)("born %s: the day before, of and after the 18th birthday", (dob) => {
    const eighteenth = `${Number(dob.slice(0, 4)) + 18}${dob.slice(4)}`;
    // Feb 29 has no 18th "birthday" in a non-leap year; JS rolls it to Mar 1.
    const day = dob.endsWith("-02-29") ? `${Number(dob.slice(0, 4)) + 18}-03-01` : eighteenth;
    for (const offset of [-1, 0, 1]) {
      for (const on of moments(addDays(day, offset))) {
        const api = isMinorOn(utc(dob), on);
        expect(studentWizardIsMinor(dob, on), `student wizard, ${dob} on ${on.toISOString()}`).toBe(api);
        expect(athleteWizardIsMinor(dob, on), `athlete wizard, ${dob} on ${on.toISOString()}`).toBe(api);
        // …and the boundary itself: a minor until the birthday, an adult from it.
        expect(api).toBe(offset < 0);
      }
    }
  });

  /* The case that broke the API's old local-time arithmetic: born under one
     set of daylight-saving rules, turning 18 under another. The US moved DST
     in 2007, so in New York a March 2006 birth date is UTC-5 and its 18th
     birthday UTC-4 — and local-time `setFullYear` put that birthday at 23:00Z
     the day before. Asked at 23:30Z, the API said adult while both wizards
     (correctly) said minor. TZ is set at runtime (Node honours that; this
     machine's Windows Node ignores a TZ given at startup) and restored. */
  it("a DST-rule change between birth and the 18th birthday doesn't move the birthday", () => {
    const saved = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      expect(new Date("2006-03-20T00:00:00Z").getTimezoneOffset()).toBe(300); // the zone really applies
      const on = new Date("2024-03-19T23:30:00Z"); // half an hour before the 18th birthday, in UTC
      expect(isMinorOn(utc("2006-03-20"), on)).toBe(true);
      expect(studentWizardIsMinor("2006-03-20", on)).toBe(true);
      expect(athleteWizardIsMinor("2006-03-20", on)).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.TZ;
      else process.env.TZ = saved;
    }
  });

  it("a wide sweep of birth dates, asked on one fixed day, agrees everywhere", () => {
    const on = new Date("2026-10-02T09:30:00Z");
    for (let i = 0; i < 1500; i++) {
      const dob = addDays("2004-01-01", i * 3);
      const api = isMinorOn(utc(dob), on);
      expect(studentWizardIsMinor(dob, on), dob).toBe(api);
      expect(athleteWizardIsMinor(dob, on), dob).toBe(api);
    }
  });
});
