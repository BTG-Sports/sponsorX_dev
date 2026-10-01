"use server";

import { revalidatePath } from "next/cache";

import {
  testInputs, wordRefusal, type ApiRestrictedTest, type WordWriteFailure,
} from "@/lib/restricted-words-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-11 — BTG's changes to the restricted-words list (BTG admin and
   super admin; the API checks the role, audits each change and answers 409
   when a word is already on, or already off, the list):

     POST   /restricted-words        {word, kind}  — add, or add a removed word back
     DELETE /restricted-words/:id                  — take it off the list
     POST   /restricted-words/test   {text}        — what would match (no change)
   -------------------------------------------------------------------------- */

const PATH = "/admin/restricted-words";
const UNREACHABLE: WordWriteFailure = { ok: false, status: 0, message: "The API is unreachable — nothing changed. Try again in a minute." };

async function send(path: string, init: RequestInit): Promise<{ res: Response; body: unknown } | WordWriteFailure> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    return UNREACHABLE;
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { res, body };
}

export async function addRestrictedWordAction(input: { word: string; kind: string }): Promise<{ ok: true } | WordWriteFailure> {
  const r = await send("/restricted-words", { method: "POST", body: JSON.stringify({ word: input.word, kind: input.kind }) });
  if ("ok" in r) return r;
  revalidatePath(PATH);
  if (!r.res.ok) return wordRefusal(r.res.status, r.body);
  return { ok: true };
}

export async function removeRestrictedWordAction(id: string): Promise<{ ok: true } | WordWriteFailure> {
  const r = await send(`/restricted-words/${encodeURIComponent(id)}`, { method: "DELETE" });
  if ("ok" in r) return r;
  revalidatePath(PATH);
  if (!r.res.ok) return wordRefusal(r.res.status, r.body);
  return { ok: true };
}

/** Each line of the test box checked on its own — the API's answer per line. */
export async function testRestrictedTextAction(text: string): Promise<{ ok: true; results: { input: string; result: ApiRestrictedTest }[] } | WordWriteFailure> {
  const results: { input: string; result: ApiRestrictedTest }[] = [];
  for (const input of testInputs(text)) {
    const r = await send("/restricted-words/test", { method: "POST", body: JSON.stringify({ text: input }) });
    if ("ok" in r) return r;
    if (!r.res.ok) return wordRefusal(r.res.status, r.body);
    results.push({ input, result: r.body as ApiRestrictedTest });
  }
  return { ok: true, results };
}
