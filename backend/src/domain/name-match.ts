/**
 * The one name match — P9-BE-11's claim check, reused by P9-BE-20's roster
 * approval and P9-BE-21's "already a sponsor / already brought in" check.
 *
 * Pure. Accents dropped, case folded, everything but letters a space, the
 * ends trimmed: "José O'Neil" and "jose  o neil" are one name. EXACT after
 * that — no fuzzy matching, because a near-miss that approves someone is an
 * impersonation, and a near-miss that holds someone only costs a person a
 * look. An empty result (a "name" with no letters) matches nothing.
 */
export const norm = (name: string) =>
  name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** Exact match on `norm`, where an empty name never matches. */
export const sameName = (a: string, b: string) => {
  const x = norm(a);
  return x !== "" && x === norm(b);
};
