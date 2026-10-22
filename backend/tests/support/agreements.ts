import { existsSync, readFileSync } from "node:fs";

import { hashAgreementBody } from "../../src/domain/agreement-hash";

/* --------------------------------------------------------------------------
   The agreement version in force for a kind — the highest
   `agreements/<KIND>.v<n>.txt`, as current-agreement.ts reads it — so a
   suite issues the wording people are actually shown, and issuing a new
   version (a new file) never breaks a suite that is not about wording.
   -------------------------------------------------------------------------- */

export const agreementFileUrl = (kind: string, version: number) =>
  new URL(`../../agreements/${kind}.v${version}.txt`, import.meta.url);

/** The highest version of this kind with a file. */
export function versionInForce(kind: string): number {
  let v = 0;
  while (existsSync(agreementFileUrl(kind, v + 1))) v++;
  if (v === 0) throw new Error(`No agreements/${kind}.v1.txt`);
  return v;
}

/** The body of a version, as the file holds it. */
export function agreementBody(kind: string, version = versionInForce(kind)): string {
  return readFileSync(agreementFileUrl(kind, version), "utf8");
}

/** The fingerprint of a version, as the server re-hashes it. */
export function agreementHash(kind: string, version = versionInForce(kind)): string {
  return hashAgreementBody(agreementBody(kind, version));
}
