/**
 * The shape of a public bearer token or short code — QA pass 6, P6-BE-03.
 *
 * Reward tokens (`generateToken`, 20 bytes) and tracking codes
 * (`generateCode`, 9 bytes) are base64url. A value on a public path that
 * cannot be one — a NUL byte (Postgres refuses it in `text`, which surfaced
 * as a 500), a quote, a slash, a space, non-ASCII, or something far longer
 * than any token we issue — is answered as "unknown" before Postgres is
 * asked, exactly like a well-formed token nobody issued. The length bound is
 * generous (test fixtures and older rows use readable ids like
 * `rv_storm-token-0`); it only stops a 9 KB path reaching an index lookup.
 */
const OPAQUE = /^[A-Za-z0-9_-]{1,128}$/;

export function isOpaqueToken(value: unknown): value is string {
  return typeof value === "string" && OPAQUE.test(value);
}
