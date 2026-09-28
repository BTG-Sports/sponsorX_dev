/**
 * `npm run agreement:register -w @sponsorx/backend -- <tenantId> <KIND> <version>`
 * — P5-FE-01, §12.
 *
 * Issues an agreement version: hashes `backend/agreements/<KIND>.v<version>.txt`
 * with the same canonicalisation acceptances are checked against, and writes
 * the `Agreement` row. Nothing else creates one — the hash on the row has to
 * come from the file people will actually read, not be typed in.
 *
 * Idempotent for an unchanged file. REFUSES if the version already exists
 * with a different hash: changed wording is a new version (bump the number,
 * add a new file), never a rewrite of one people may already have accepted.
 */
import { readFileSync } from "node:fs";

import { prisma } from "../src/db/client.ts";
import { hashAgreementBody } from "../src/domain/agreement-hash.ts";
import { agreementFile } from "../src/domain/agreement-text.ts";

const [tenantId, kind, versionArg] = process.argv.slice(2);
const version = Number(versionArg);
const file = kind ? agreementFile(kind, version) : null;
if (!tenantId || !file) {
  console.error("Usage: npm run agreement:register -w @sponsorx/backend -- <tenantId> <KIND> <version>");
  process.exit(2);
}

try {
  const bodyHash = hashAgreementBody(readFileSync(file, "utf8"));
  const existing = await prisma.agreement.findFirst({
    where: { tenantId, kind, version },
    select: { id: true, bodyHash: true },
  });
  if (existing && existing.bodyHash !== bodyHash) {
    console.error(
      `${kind} v${version} is already issued with a different text (${existing.bodyHash}).\n` +
        `Changed wording is a new version: add ${kind}.v${version + 1}.txt and register that.`,
    );
    process.exit(1);
  }
  const row =
    existing ??
    (await prisma.agreement.create({
      data: { tenantId, kind, version, bodyHash, effectiveAt: new Date() },
      select: { id: true, bodyHash: true },
    }));
  console.log(`${kind} v${version} → ${row.id}\n${row.bodyHash}`);
} finally {
  await prisma.$disconnect();
}
