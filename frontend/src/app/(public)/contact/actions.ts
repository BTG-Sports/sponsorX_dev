"use server";

import { refusalMessage } from "@/lib/onboarding-live";
import { publicApi } from "../onboarding/public-api";

/* --------------------------------------------------------------------------
   2S1-FE-10 / 2S1-BE-16 — the contact form's writes. Public, no login.

     submitContactAction   POST /public/support/messages              the message (+ attachment upload grants)
     finishContactAction   POST /public/support/messages/:token/send  every attachment arrived: queue it
     dropAttachmentAction  POST …/:token/attachments/:id/drop         send without one that won't upload

   Nothing is mailed from here or from the API's request path: the API
   queues the message for the worker. The attachments never pass through
   this server — the browser PUTs them to the private bucket.
   -------------------------------------------------------------------------- */

type Fail = { ok: false; message: string };
const UNREACHABLE: Fail = { ok: false, message: "We couldn’t reach SponsorX. Nothing was sent — check your connection and try again." };

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  try {
    return await publicApi(path, init);
  } catch {
    return null;
  }
}

async function refusal(res: Response): Promise<Fail> {
  let said: string | undefined;
  try {
    said = refusalMessage(await res.json());
  } catch {
    /* no body */
  }
  if (res.status === 429) return { ok: false, message: "That’s a lot of messages from here. Wait a while, or email us directly." };
  if (res.status === 400) return { ok: false, message: said ? `Check the form: ${said}` : "Check each field and try again." };
  if (res.status >= 500) return { ok: false, message: "Something went wrong on our side. Try again in a minute, or email us directly." };
  return { ok: false, message: said ?? "The message wasn’t sent. Try again." };
}

export type ContactInput = {
  name: string;
  email: string;
  topic: "GUARDIANSHIP" | "ACCOUNT" | "PAYMENT" | "OTHER";
  message: string;
  attachments: { filename: string; contentType: string; bytes: number }[];
};
export type ContactSubmitted = {
  ok: true;
  queued: boolean;
  token: string | null;
  uploads: { attachmentId: string; filename: string; contentType: string; uploadUrl: string }[];
};

export async function submitContactAction(input: ContactInput): Promise<ContactSubmitted | Fail> {
  if (!input || typeof input !== "object") return { ok: false, message: "Fill in the form first." };
  const body = {
    name: String(input.name ?? "").trim(), email: String(input.email ?? "").trim(), topic: input.topic, message: String(input.message ?? "").trim(),
    ...(Array.isArray(input.attachments) && input.attachments.length ? { attachments: input.attachments.slice(0, 3) } : {}),
  };
  const res = await call("/public/support/messages", { method: "POST", body: JSON.stringify(body) });
  if (!res) return UNREACHABLE;
  if (res.status !== 201) return refusal(res);
  const d = (await res.json()) as Omit<ContactSubmitted, "ok">;
  return { ok: true, queued: d.queued, token: d.token, uploads: d.uploads };
}

export async function finishContactAction(token: string): Promise<{ ok: true } | Fail> {
  if (typeof token !== "string" || !token) return { ok: false, message: "This message has expired. Send the form again." };
  const res = await call(`/public/support/messages/${encodeURIComponent(token)}/send`, { method: "POST" });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res);
  return { ok: true };
}

export async function dropAttachmentAction(token: string, attachmentId: string): Promise<{ ok: true } | Fail> {
  if (typeof token !== "string" || !token || typeof attachmentId !== "string" || !attachmentId) return { ok: false, message: "Unknown file." };
  const res = await call(`/public/support/messages/${encodeURIComponent(token)}/attachments/${encodeURIComponent(attachmentId)}/drop`, { method: "POST" });
  if (!res) return UNREACHABLE;
  if (!res.ok) return refusal(res);
  return { ok: true };
}
