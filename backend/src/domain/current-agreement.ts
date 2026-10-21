/**
 * The agreement of a kind now in force for a tenant — shared by the guardian
 * agreement (2S1-BE-10) and the athlete's Content Collaboration Agreement
 * (P8-BE-04).
 *
 * The text is a file, `agreements/<KIND>.v<n>.txt`. The highest version with a
 * file is the one in force: a version whose file exists but has no row yet is
 * registered from it the first time it is needed, so issuing counsel's
 * approved wording is adding `<KIND>.v2.txt` — and a missing row can never
 * stop a sign-up. The body is served only while the file still hashes to the
 * row (agreement-text.ts); an edited file is refused, never shown.
 */
import { readFile } from "node:fs/promises";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { hashAgreementBody } from "./agreement-hash";
import { agreementFile, loadAgreementBody } from "./agreement-text";

type Db = Prisma.TransactionClient | typeof prisma;

/** Versions looked for on disk; far more than will ever be issued. */
const MAX_VERSION = 50;

/** The highest version of this kind that has a file, or 0. */
export async function highestFileVersion(kind: string): Promise<number> {
  let found = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    const file = agreementFile(kind, v);
    if (!file) return found;
    const exists = await readFile(file, "utf8").then(() => true, () => false);
    if (!exists) break;
    found = v;
  }
  return found;
}

export type CurrentAgreement = { agreementId: string; kind: string; version: number; bodyHash: string; body: string };

/** The version in force, registering it from its file if needed; null when there is no usable text. */
export async function currentAgreementOf(db: Db, tenantId: string, kind: string): Promise<CurrentAgreement | null> {
  const fileVersion = await highestFileVersion(kind);
  let row = await db.agreement.findFirst({
    /* tenant-scope: the tenant's own agreements of this kind. */
    where: { tenantId, kind }, orderBy: { version: "desc" }, select: { id: true, kind: true, version: true, bodyHash: true },
  });
  if (fileVersion > (row?.version ?? 0)) {
    const file = agreementFile(kind, fileVersion);
    const body = file ? await readFile(file, "utf8").catch(() => null) : null;
    if (body) {
      row = await db.agreement.upsert({
        where: { tenantId_kind_version: { tenantId, kind, version: fileVersion } },
        create: { tenantId, kind, version: fileVersion, bodyHash: hashAgreementBody(body), effectiveAt: new Date() },
        update: {},
        select: { id: true, kind: true, version: true, bodyHash: true },
      });
    }
  }
  if (!row) return null;
  const body = await loadAgreementBody(row);
  return body ? { agreementId: row.id, kind: row.kind, version: row.version, bodyHash: row.bodyHash, body } : null;
}
