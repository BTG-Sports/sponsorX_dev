import { createHash } from "node:crypto";

/**
 * Fingerprinting agreement text — P3-BE-06, §12, Guide §08.
 *
 * What makes an acceptance hold up is not a signature image; it is being able
 * to prove *which words* the person was shown. So the acceptance stores a
 * hash of the exact body, and §12 requires the version, signer, timestamp and
 * guardian alongside it.
 *
 * ── HOW MUCH NORMALISATION, AND WHY SO LITTLE ───────────────────────────────
 *
 * Canonicalisation is a trade. Normalise too little and the same document
 * hashes differently after a round trip through a browser or an editor, so
 * honest acceptances fail. Normalise too much and a real edit slips through
 * unnoticed, which defeats the entire point.
 *
 * Only transport-level noise is removed:
 *
 *   - a byte-order mark, which editors add invisibly
 *   - CRLF and lone CR line endings, which change with the operating system
 *   - trailing whitespace at the very end of the document
 *
 * Deliberately NOT removed: internal blank lines, indentation, double spaces,
 * punctuation and case. In a legal document a removed paragraph break can
 * change how a clause reads, and "shall" is not "Shall" to a court. If a
 * reformat changes the hash, that is the system working — re-issue the
 * version rather than loosening this function.
 *
 * ── THE DRAFT-TEXT WARNING ──────────────────────────────────────────────────
 *
 * Counsel approval no longer gates development (changed 2026-09-15), so this
 * is built against draft wording. **Every hash generated against draft text
 * is void.** When counsel signs off, the agreement gets a new version and
 * every prior acceptance must be re-collected — an acceptance of text nobody
 * approved is not evidence of anything. The roadmap records this as a
 * launch-blocking item rather than a coding one.
 */

/** Remove transport noise and nothing else. */
export function canonicaliseAgreementBody(body: string): string {
  return body
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\s+$/, "");
}

/**
 * The fingerprint stored on the agreement and copied onto every acceptance.
 *
 * Prefixed and hex-encoded so a value in the database is self-describing: a
 * bare 64-character string tells a future reader nothing about which
 * algorithm produced it, and algorithms get replaced.
 */
export function hashAgreementBody(body: string): string {
  const canonical = canonicaliseAgreementBody(body);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

/**
 * Was the person shown the text we think they were shown?
 *
 * Compared as exact strings rather than by re-hashing the claimed body: the
 * client sends the hash it rendered, and the server checks it against the
 * stored agreement. A mismatch means the rendered text and the stored text
 * have diverged — a stale browser tab, a mid-edit template, or tampering —
 * and in every one of those cases refusing is correct.
 */
export function bodyHashMatches(stored: string, presented: string): boolean {
  return stored.length > 0 && stored === presented;
}
