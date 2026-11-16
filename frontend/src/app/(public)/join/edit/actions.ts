"use server";

/* POL-FE-70 (app review §3) — the applicant's own edit, on the intake token
   the changes-requested email carries (PATCH /applications/intake/mine?token=).
   From CHANGES_REQUESTED the API also resubmits. Public: no login exists yet. */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type ApplicationEdit = { displayName: string; sport: string; stateCode: string };

export async function resubmitApplicationAction(token: string, edit: ApplicationEdit): Promise<{ ok: boolean; message: string }> {
  if (typeof token !== "string" || !token || token.length > 2000) return { ok: false, message: "This link isn't valid — use the one in your email." };
  const body: Record<string, string> = {};
  if (edit.displayName.trim()) body.displayName = edit.displayName.trim().slice(0, 100);
  if (edit.sport.trim()) body.sport = edit.sport.trim().slice(0, 60);
  if (/^[A-Za-z]{2}$/.test(edit.stateCode.trim())) body.stateCode = edit.stateCode.trim().toUpperCase();
  try {
    const res = await fetch(`${API_URL}/api/v1/applications/intake/mine?token=${encodeURIComponent(token)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      const said = ((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
      return { ok: false, message: said ?? (res.status === 404 ? "This link has expired or isn't valid — reply to the email and BTG will help." : `Your changes weren't saved (HTTP ${res.status}).`) };
    }
    return { ok: true, message: "Thanks — your application is back with BTG for review. We'll email you." };
  } catch {
    return { ok: false, message: "Can't reach SponsorX right now — try again in a minute." };
  }
}
