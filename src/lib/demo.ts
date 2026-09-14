/* --------------------------------------------------------------------------
   Demo-state switcher (A2). ?demo=loading|empty|error|minor lets any portal
   page render its branded states live — demoable to a client today, and the
   same conditional Block B will drive from real data reads. Absent param =
   normal render, so production behavior is unaffected. "minor" is
   athlete-portal-only: it renders the signed-in athlete as a minor with
   guardian verification pending (§4); other portals ignore it.
   -------------------------------------------------------------------------- */

export type DemoState = "loading" | "empty" | "error" | "minor" | null;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function demoState(searchParams: SearchParams): Promise<DemoState> {
  const sp = await searchParams;
  const d = Array.isArray(sp.demo) ? sp.demo[0] : sp.demo;
  return d === "loading" || d === "empty" || d === "error" || d === "minor"
    ? d
    : null;
}
