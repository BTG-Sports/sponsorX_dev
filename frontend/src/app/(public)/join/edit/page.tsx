import { ApplicationEditForm } from "@/components/application-edit-form";

/* --------------------------------------------------------------------------
   /join/edit?token= — PUBLIC (POL-FE-70, app review §3). An athlete
   applicant asked for changes had no way to make them: no screen called
   the token edit routes, and the email pointed to a portal they have no
   login for. The changes-requested email now links here (POL-BE-70): the
   reviewer's note, then the fields to change, then "Send it back".
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type Own = { state: string; displayName: string; sport: string | null; stateCode: string | null; reviewerNotes: string | null };

export default async function ApplicationEditPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const res = token
    ? await fetch(`${API_URL}/api/v1/applications/intake/mine?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null)
    : null;
  const own = res?.ok ? ((await res.json()) as Own) : null;
  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Update your application</h1>
      {!own ? (
        <p className="text-sm text-muted">This link has expired or isn&apos;t valid. Reply to the email BTG sent you and we&apos;ll help.</p>
      ) : own.state !== "CHANGES_REQUESTED" && own.state !== "DRAFT" ? (
        <p className="text-sm text-muted">Your application is with BTG now — there&apos;s nothing to change. We&apos;ll email you.</p>
      ) : (
        <>
          {own.reviewerNotes && (
            <div role="note" className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
              <p className="font-medium">What BTG asked you to change</p>
              <p className="mt-1 whitespace-pre-line text-muted">{own.reviewerNotes}</p>
            </div>
          )}
          <ApplicationEditForm token={token!} initial={{ displayName: own.displayName, sport: own.sport ?? "", stateCode: own.stateCode ?? "" }} />
        </>
      )}
    </main>
  );
}
