"use server";

import { fileArgs, publicCall, requestUpload, type Answer, type UploadGrant } from "@/server/id-upload-actions";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the coming-of-age page's government-ID upload (2S1-BE-12).
   Public: the signed link from the reminder emails (or the one the guardian
   sends) is the only key.
     POST /public/coming-of-age/:token/documents                 → a private-bucket PUT
     POST /public/coming-of-age/:token/documents/:id/confirm      → control moves to the athlete
   -------------------------------------------------------------------------- */

export type ApiComingOfAgePage = {
  athleteFirstName: string;
  ageOfMajority: number;
  reachedAt: string | null;
  dueAt: string | null;
  /** allowance: the 90 days are running · reactivate: closed, within 30 days · done · expired · not-started */
  window: "allowance" | "reactivate" | "done" | "expired" | "not-started";
  until: string | null;
  idUploaded: boolean;
};

const base = (token: string) => `/public/coming-of-age/${encodeURIComponent(token)}`;
const BAD = { ok: false as const, status: 400, message: "This link is not valid. Open the whole link from the email." };
const okToken = (t: unknown): t is string => typeof t === "string" && t.length > 0 && t.length < 500;

export async function requestComingOfAgeIdAction(token: string, file: unknown): Promise<UploadGrant> {
  if (!okToken(token)) return BAD;
  const f = fileArgs(file);
  if (!f) return { ok: false, status: 422, message: "Upload a PDF, JPEG or PNG." };
  return requestUpload(`${base(token)}/documents`, f);
}

export async function confirmComingOfAgeIdAction(token: string, documentId: string): Promise<Answer<ApiComingOfAgePage>> {
  if (!okToken(token) || typeof documentId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(documentId)) return BAD;
  return publicCall<ApiComingOfAgePage>(`${base(token)}/documents/${encodeURIComponent(documentId)}/confirm`, { method: "POST" });
}
