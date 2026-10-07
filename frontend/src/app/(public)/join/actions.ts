"use server";

import type { IntakePayload } from "@/lib/join-flow";
import type { ApiSignupStatus } from "@/lib/join-signup";
import { linkExpiredFrom } from "@/lib/link-expired";
import { fileArgs, refusal, requestUpload, type Answer, type UploadGrant } from "@/server/id-upload-actions";
import { publicApi } from "../onboarding/public-api";

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
  countryCode: "country",
  guardian: "guardianEmail",
};

/* A "socials.N.…" issue names an array index; the wizard has one input per
   platform, so route by the platform actually sent at that index instead of
   dumping every social error on the Instagram field. */
const PLATFORM_FIELD: Record<string, string> = {
  INSTAGRAM: "instagram",
  TIKTOK: "tiktok",
  YOUTUBE: "youtube",
};

function fieldFor(path: string, payload: IntakePayload): string | undefined {
  const [head, index] = path.split(".");
  if (head === "socials" && index !== undefined) {
    const platform = payload.socials[Number(index)]?.platform;
    if (platform && PLATFORM_FIELD[platform]) return PLATFORM_FIELD[platform];
  }
  return FIELD_MAP[head];
}

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
        const key = fieldFor(issue.path, payload);
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

/* --------------------------------------------------------------------------
   2S1-FE-06 — after applying: the checklist, the ID upload, naming a
   guardian, resending the emails (2S1-BE-09 / -10). The intake token /join
   was handed is the only key; the file itself goes straight from the
   browser to the private bucket (components/id-upload.tsx).
   -------------------------------------------------------------------------- */

const q = (token: string) => `?token=${encodeURIComponent(token)}`;
const BAD = { ok: false as const, status: 404, message: "No application matches that link." };
const okToken = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t.length < 500;

/** 2S8-FE-01: the intake link is older than 14 days. The checklist swaps
 *  itself for the "send me a fresh link" notice (components/link-expired.tsx). */
export type Expired = { ok: false; status: 410; message: string; expired: { kind: string } };
export type JoinAnswer<T> = Answer<T> | Expired;

/** publicCall, with the API's 410 link_expired told apart from a refusal. */
async function joinCall<T>(path: string, init: RequestInit = {}): Promise<JoinAnswer<T>> {
  let res: Response;
  try {
    res = await publicApi(path, init);
  } catch {
    return { ok: false, status: 0, message: "We couldn't reach SponsorX. Nothing was lost — check your connection and try again." };
  }
  if (res.status === 410) {
    const gone = linkExpiredFrom(410, await res.json().catch(() => null), "intake");
    if (gone) return { ok: false, status: 410, message: gone.message, expired: { kind: gone.kind } };
    return { ok: false, status: 410, message: "This link no longer works." };
  }
  if (!res.ok) return refusal(res);
  return { ok: true, data: (await res.json()) as T };
}

export async function signupStatusAction(token: string): Promise<JoinAnswer<ApiSignupStatus>> {
  if (!okToken(token)) return BAD;
  return joinCall<ApiSignupStatus>(`/applications/intake/status${q(token)}`);
}

export async function requestIdAction(token: string, kind: "GOVERNMENT_ID" | "SCHOOL_ID", file: unknown): Promise<UploadGrant> {
  if (!okToken(token) || (kind !== "GOVERNMENT_ID" && kind !== "SCHOOL_ID")) return BAD;
  const f = fileArgs(file);
  if (!f) return { ok: false, status: 422, message: "Upload a PDF, JPEG or PNG." };
  return requestUpload(`/applications/intake/documents${q(token)}`, { kind, ...f });
}

export async function confirmIdAction(token: string, documentId: string): Promise<JoinAnswer<ApiSignupStatus>> {
  if (!okToken(token) || typeof documentId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(documentId)) return BAD;
  return joinCall<ApiSignupStatus>(`/applications/intake/documents/${encodeURIComponent(documentId)}/confirm${q(token)}`, { method: "POST" });
}

export async function nameGuardianAction(
  token: string, input: { legalName: string; email: string; relationship: "PARENT" | "LEGAL_GUARDIAN" | "AUTHORIZED_REP" },
): Promise<JoinAnswer<ApiSignupStatus>> {
  if (!okToken(token) || !input) return BAD;
  if (typeof input.legalName !== "string" || !input.legalName.trim()) return { ok: false, status: 422, message: "Enter your guardian's legal name." };
  if (typeof input.email !== "string" || !input.email.includes("@")) return { ok: false, status: 422, message: "Enter your guardian's email." };
  if (!["PARENT", "LEGAL_GUARDIAN", "AUTHORIZED_REP"].includes(input.relationship)) return { ok: false, status: 422, message: "Choose how they're related to you." };
  return joinCall<ApiSignupStatus>(`/applications/intake/guardian${q(token)}`, {
    method: "POST",
    body: JSON.stringify({ legalName: input.legalName.trim().slice(0, 120), email: input.email.trim().slice(0, 200), relationship: input.relationship }),
  });
}

export async function resendAction(token: string, which: "email" | "guardian"): Promise<JoinAnswer<ApiSignupStatus>> {
  if (!okToken(token) || (which !== "email" && which !== "guardian")) return BAD;
  return joinCall<ApiSignupStatus>(`/applications/intake/${which === "email" ? "confirm-email" : "guardian"}/resend${q(token)}`, { method: "POST" });
}
