/* --------------------------------------------------------------------------
   One rule for "a path on this site" — 2S8-SEC-02 (OWASP A01, open redirect).

   A redirect target accepted from an answer or a form must be a same-site
   path. Rejected: anything not starting with "/", protocol-relative "//host",
   backslashes ("/\host" — browsers read "\" as "/"), and ASCII control
   characters: browsers strip tab and newline from URLs, so "/\t/evil.example"
   arrives as "//evil.example".
   -------------------------------------------------------------------------- */

const CONTROL = /[\u0000-\u001f\u007f]/;

export function isSafeLocalPath(p: unknown): p is string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") && !CONTROL.test(p);
}
