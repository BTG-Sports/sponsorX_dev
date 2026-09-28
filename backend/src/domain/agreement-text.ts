import { readFile } from "node:fs/promises";

import { hashAgreementBody } from "./agreement-hash";

/**
 * Agreement TEXT — P5-FE-01, §12, Guide §08.
 *
 * `Agreement` stores a version and the sha256 of its body, never the body:
 * the text is a file in `backend/agreements/<KIND>.v<version>.txt`,
 * reviewed in git like any other change to what people sign. This module is
 * the one place that reads it, and it serves a body ONLY if the file still
 * hashes to what the row recorded. A file edited after its version was
 * issued is refused rather than shown — showing it would ask someone to
 * accept words whose fingerprint the acceptance can never match, and
 * `acceptAgreementIn` would rightly reject them with AgreementTextChanged.
 * The fix for changed wording is a new version, never an edited file.
 */

const DIR = new URL("../../agreements/", import.meta.url);

/** Kinds are data (schema comment on Agreement), but a filename is not a
 *  place to accept arbitrary input — letters, digits and underscores only. */
const SAFE_KIND = /^[A-Z][A-Z0-9_]{1,40}$/;

export function agreementFile(kind: string, version: number): URL | null {
  if (!SAFE_KIND.test(kind) || !Number.isInteger(version) || version < 1) return null;
  return new URL(`${kind}.v${version}.txt`, DIR);
}

/** The body for a stored agreement, or null when there is no file or the
 *  file no longer matches the stored hash. */
export async function loadAgreementBody(agreement: {
  kind: string;
  version: number;
  bodyHash: string;
}): Promise<string | null> {
  const file = agreementFile(agreement.kind, agreement.version);
  if (!file) return null;
  let body: string;
  try {
    body = await readFile(file, "utf8");
  } catch {
    return null;
  }
  return hashAgreementBody(body) === agreement.bodyHash ? body : null;
}
