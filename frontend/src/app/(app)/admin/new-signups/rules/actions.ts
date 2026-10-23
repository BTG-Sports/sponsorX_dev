"use server";

import { revalidatePath } from "next/cache";

import { refusalWords } from "@/lib/signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-07 — the sign-up rules BTG admins keep (2S1-BE-10 / -12):
     PUT    /signup-rules/age-table       {countryCode, regionCode?, age}  add a place or change its age
     DELETE /signup-rules/age-table/:id                                    remove a place
     PUT    /signup-rules/settings        {staffConfirmMinors}             "BTG staff confirm minors"
   The API checks the role (BTG admin), audits each change and works out the
   age again for the athletes who live in the place.

   P8-FE-04 / P8-FE-07 — the same PUT takes two more switches, each one
   flag at a time: requireRulesAttestation (a confirmation that counts is
   on file before a deal or a listing) and requireCollabAcceptance (the
   current Content Collaboration Agreement is accepted). setSignupFlagAction
   is the one action; the flag name is allowlisted here, never passed
   through.
   -------------------------------------------------------------------------- */

export const SIGNUP_FLAGS = ["staffConfirmMinors", "requireRulesAttestation", "requireCollabAcceptance"] as const;
export type SignupFlag = (typeof SIGNUP_FLAGS)[number];

const SAID: Record<SignupFlag, (on: boolean) => string> = {
  staffConfirmMinors: (on) => (on ? "On — complete minors now wait for a person at BTG." : "Off — minors are approved by their checks, and any held are checked again."),
  requireRulesAttestation: (on) =>
    on ? "On — a new deal or listing waits until a rules confirmation that counts is on file." : "Off — athletes are still asked; nothing waits on it.",
  requireCollabAcceptance: (on) =>
    on ? "On — a new deal or listing waits until the current agreement is accepted." : "Off — athletes are still asked; nothing waits on it.",
};

export type RuleResult = { ok: true; message: string } | { ok: false; message: string };

async function send(path: string, init: RequestInit, done: (b: unknown) => string): Promise<RuleResult> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    return { ok: false, message: "The API is unreachable — nothing changed. Try again in a minute." };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  revalidatePath("/admin/new-signups/rules");
  return res.ok ? { ok: true, message: done(body) } : { ok: false, message: refusalWords(body, res.status) };
}

const updated = (b: unknown) => {
  const n = (b as { athletesUpdated?: number } | null)?.athletesUpdated ?? 0;
  return `Saved. ${n} athlete${n === 1 ? "" : "s"} worked out again.`;
};

export async function setAgeRowAction(input: { countryCode: string; regionCode: string; age: number }): Promise<RuleResult> {
  const countryCode = typeof input?.countryCode === "string" ? input.countryCode.trim().toUpperCase() : "";
  const regionCode = typeof input?.regionCode === "string" ? input.regionCode.trim().toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(countryCode)) return { ok: false, message: "A country is its two-letter code, e.g. US or CA." };
  if (regionCode && !/^[A-Z0-9]{1,3}$/.test(regionCode)) return { ok: false, message: "A state or province is its code, e.g. AL or BC." };
  if (!Number.isInteger(input.age) || input.age < 14 || input.age > 25) return { ok: false, message: "An age of majority is between 14 and 25." };
  return send("/signup-rules/age-table", { method: "PUT", body: JSON.stringify({ countryCode, ...(regionCode ? { regionCode } : {}), age: input.age }) }, updated);
}

export async function removeAgeRowAction(id: string): Promise<RuleResult> {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, message: "Unknown place." };
  return send(`/signup-rules/age-table/${encodeURIComponent(id)}`, { method: "DELETE" }, updated);
}

export async function setSignupFlagAction(flag: SignupFlag, on: boolean): Promise<RuleResult> {
  if (typeof flag !== "string" || !(SIGNUP_FLAGS as readonly string[]).includes(flag)) return { ok: false, message: "Unknown rule." };
  if (typeof on !== "boolean") return { ok: false, message: "On or off?" };
  return send("/signup-rules/settings", { method: "PUT", body: JSON.stringify({ [flag]: on }) }, () => SAID[flag](on));
}

export async function setStaffConfirmAction(on: boolean): Promise<RuleResult> {
  return setSignupFlagAction("staffConfirmMinors", on);
}
