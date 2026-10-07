"use server";

import { attachmentRefusal } from "@/lib/support-message-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-14 — BTG opens one attachment of a support message:

     GET /support-messages/:id/attachments/:attachmentId  → { url, expiresInSeconds }

   The link is a five-minute, audited presign on the private bucket
   (2S0-SEC-01); the browser opens it in a new tab. A file that never
   finished uploading is 409, in the API's words; a message or file outside
   the caller's books is 403.
   -------------------------------------------------------------------------- */

export type AttachmentLink = { ok: true; url: string; expiresInSeconds: number } | { ok: false; message: string };

export async function openAttachmentAction(messageId: string, attachmentId: string): Promise<AttachmentLink> {
  if (typeof messageId !== "string" || !messageId || typeof attachmentId !== "string" || !attachmentId) return { ok: false, message: "Unknown file." };
  let res: Response;
  let body: unknown = null;
  try {
    res = await apiFetch(`/support-messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    try {
      body = await res.json();
    } catch {
      /* no body */
    }
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
  if (!res.ok) return { ok: false, message: attachmentRefusal(res.status, body) };
  const link = body as { url?: unknown; expiresInSeconds?: unknown } | null;
  if (typeof link?.url !== "string" || !/^https?:\/\//.test(link.url)) return { ok: false, message: "The API sent no link for this file." };
  return { ok: true, url: link.url, expiresInSeconds: typeof link.expiresInSeconds === "number" ? link.expiresInSeconds : 300 };
}
