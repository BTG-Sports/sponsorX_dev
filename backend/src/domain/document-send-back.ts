/**
 * BTG sends a document back — P8-BE-10.
 *
 * Until now BTG's only answer to a bad document was rejecting the whole
 * application. Now any document BTG reviews can be sent back on its own,
 * with a reason. Each flow does it in its own file (it knows its states and
 * its upload link); what they share is here:
 *
 *   - the reason is required — the person reads it;
 *   - the document stops counting (`returnedAt`), and its file is deleted
 *     from the private bucket once the change is committed: a document BTG
 *     turned down is not kept;
 *   - the person is emailed the reason and the link they already use to
 *     upload (`document.sentBack`);
 *   - it is audited (`document.sentBack`, on the document), and the flow's
 *     automatic checks run again, so the new upload is judged afresh.
 *
 * An approval already made stays made: sending a document back asks for a
 * better one, and BTG decides anything more by hand.
 */
import type { Prisma } from "../generated/prisma/client";
import { audit, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import { send } from "../lib/email";
import { deletePrivateObject } from "../lib/storage";

type Tx = Prisma.TransactionClient;

export class SendBackError extends Error {
  readonly status: number;
  readonly code = "document_send_back";
  constructor(message: string, status = 422) {
    super(message);
    this.name = "SendBackError";
    this.status = status;
  }
}

/** The reason as the person will read it: required, and short enough for an email. */
export function sendBackReason(reason: unknown): string {
  const r = typeof reason === "string" ? reason.trim() : "";
  if (r.length < 5) throw new SendBackError("Say why it's being sent back — the person reads it.");
  if (r.length > 1000) throw new SendBackError("Keep the reason under 1,000 characters.");
  return r;
}

/** The columns a document gets when it is sent back. */
export const returnedColumns = (actor: AuditActor, reason: string, at = new Date()) => ({ returnedAt: at, returnedReason: reason, returnedBy: actor.userId });

/** Audit the send-back and email the person; the caller has already marked the row. */
export async function recordSendBack(
  tx: Tx, actor: AuditActor,
  d: {
    tenantId: string; entity: string; entityId: string; documentName: string; reason: string;
    to: string | null; name: string; uploadUrl: string; /** Extra facts for the audit row. */ about?: Record<string, unknown>;
  },
) {
  await audit(tx, actor, "document.sentBack", d.entity, d.entityId, { after: { reason: d.reason, documentName: d.documentName, fileDeleted: true, ...d.about } });
  if (!d.to) return;
  await send(tx, d.tenantId, {
    template: "document.sentBack", to: d.to, idempotencyKey: `document.sentBack:${d.entity}:${d.entityId}`,
    data: { name: d.name.trim().split(/\s+/)[0] ?? "", documentName: d.documentName, reason: d.reason, uploadUrl: d.uploadUrl, supportEmail: env.SUPPORT_EMAIL },
  });
}

/** After the commit: the turned-down file is deleted. A file already gone is fine. */
export async function deleteSentBackFile(key: string | null | undefined): Promise<void> {
  if (!key) return;
  await deletePrivateObject(key).catch(() => {
    /* The row already says it was sent back, and no link is ever handed out for it again. */
  });
}
