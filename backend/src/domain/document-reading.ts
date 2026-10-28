/**
 * Read a document that passed its upload check, and turn what it says into
 * hold reasons — P8-BE-11. The rules are document-check-rules.ts.
 *
 * Each document flow calls `readDocument` at its confirm step with the
 * document as opened there (storage.checkPrivateUpload, `document: true`)
 * and what the record says it should show, and stores the result on the
 * document's own row (checkState, checkFindings, checkedAt). The words read
 * off it are compared and dropped: none of the text is ever stored.
 *
 * Then the flow's automatic approval asks `documentHolds` which of its
 * documents hold it: a FLAGGED or UNREAD document holds it for BTG, with
 * the findings as the reasons. Of several documents of one kind, the
 * requirement is met by any that read CLEAR — a person who sends a clearer
 * copy after a flagged one is not held by the first. A document never read
 * (uploaded before this check existed) holds nothing.
 */
import type { Prisma } from "../generated/prisma/client";
import type { InspectedDocument } from "../lib/document-inspect";
import { readPictures } from "../lib/ocr";
import { holdReason, readFindings, type Finding, type ReadExpectation, type ReadState } from "./document-check-rules";

export type DocumentCheck = { checkState: ReadState; checkFindings: Prisma.InputJsonValue; checkedAt: Date };

/**
 * What the document says, compared with what it should. Null when there is
 * nothing to read — the document wasn't opened at its confirm step. Never
 * throws: a reading that fails is UNREAD, so a person looks at it.
 */
export async function readDocument(document: InspectedDocument | undefined, expect: ReadExpectation, now = new Date()): Promise<DocumentCheck | null> {
  if (!document) return null;
  let text = document.text;
  try {
    if (document.pictures.length) text = `${text}\n${await readPictures(document.pictures)}`;
  } catch {
    /* Read what there is: an empty reading is UNREAD below. */
  }
  const result = readFindings(text, expect, now);
  return { checkState: result.state, checkFindings: result.findings as unknown as Prisma.InputJsonValue, checkedAt: now };
}

/** A stored result, as the reading wrote it. */
export type StoredCheck = { checkState: string | null; checkFindings: unknown };

export function findingsOf(c: StoredCheck): Finding[] {
  return Array.isArray(c.checkFindings) ? (c.checkFindings as unknown as Finding[]) : [];
}

/** What BTG reads beside a document: null when it was never read. */
export function checkView(c: StoredCheck & { checkedAt?: Date | null }) {
  if (!c.checkState) return null;
  return { state: c.checkState as ReadState, findings: findingsOf(c).map((f) => f.says), checkedAt: c.checkedAt?.toISOString() ?? null };
}

/**
 * The hold reasons from one requirement's documents (all of one kind, newest
 * last). Met when any reads CLEAR or was never read; otherwise the newest
 * one's findings, each a reason.
 */
export function documentHolds(label: string, docs: readonly StoredCheck[]): string[] {
  if (!docs.length) return [];
  if (docs.some((d) => d.checkState === null || d.checkState === "CLEAR")) return [];
  return findingsOf(docs[docs.length - 1]!).map((f) => holdReason(label, f));
}
