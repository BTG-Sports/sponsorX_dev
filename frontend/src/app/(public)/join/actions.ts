"use server";

import type { IntakePayload } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   P3-FE-01 — the submit path. A server action, not a browser fetch, because
   API_URL is deliberately server-side (src/server/api.ts: the browser has no
   business knowing the address; in production this crosses Railway's private
   network). The intake is public — no Clerk token — and the API rate-limits
   it per address, which still works through the action because the intake's
   limiter keys on the API-side connection.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type IntakeResult =
  | { ok: true; id: string; state: string; token: string }
  | {
      ok: false;
      /** Wizard-field messages where the API named a contract path. */
      fields: Record<string, string>;
      /** Everything else, for the banner. */
      messages: string[];
    };

/** Contract paths → wizard field keys, so a 400 lands on the input it means. */
const FIELD_MAP: Record<string, string> = {
  legalName: "firstName",
  displayName: "firstName",
  email: "email",
  phone: "phone",
  birthDate: "dob",
  city: "city",
  stateCode: "region",
  sport: "sport",
  position: "position",
  school: "team",
  level: "level",
  socials: "instagram",
};

export async function submitJoinApplication(
  payload: IntakePayload,
): Promise<IntakeResult> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/applications/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      fields: {},
      messages: [
        "The application service is unreachable — nothing was submitted. Your answers are saved on this device; try again in a minute.",
      ],
    };
  }

  if (response.status === 201) {
    const d = (await response.json()) as {
      id: string;
      state: string;
      continuationToken: string;
    };
    return { ok: true, id: d.id, state: d.state, token: d.continuationToken };
  }

  if (response.status === 429) {
    return {
      ok: false,
      fields: {},
      messages: [
        "Too many applications from this connection in the last hour. Your answers are saved — try again later.",
      ],
    };
  }

  /* Validation and anything else the API can articulate. */
  let messages: string[] = [`The application was not accepted (HTTP ${response.status}).`];
  const fields: Record<string, string> = {};
  try {
    const body = (await response.json()) as {
      error?: {
        message?: string;
        issues?: Array<{ path: string; message: string }>;
      };
    };
    if (body.error?.issues?.length) {
      messages = [];
      for (const issue of body.error.issues) {
        const key = FIELD_MAP[issue.path.split(".")[0]];
        if (key && !fields[key]) fields[key] = issue.message;
        else messages.push(`${issue.path || "form"}: ${issue.message}`);
      }
      if (Object.keys(fields).length) {
        messages.unshift("Some answers need another look — they're marked below.");
      }
    } else if (body.error?.message) {
      messages = [body.error.message];
    }
  } catch {
    /* Non-JSON error body — keep the status-line message. */
  }
  return { ok: false, fields, messages };
}
