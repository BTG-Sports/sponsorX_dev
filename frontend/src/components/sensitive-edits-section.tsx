import Link from "next/link";

import { viewEditIdAction } from "@/app/(app)/admin/new-signups/sensitive-edit-actions";
import { Badge, Card } from "@/components/ui";
import { dayOf } from "@/lib/account-live";
import { STATE_COPY, changeRows, type ApiSensitiveEdit } from "@/lib/profile-changes-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Sensitive profile edits, on BTG's New sign-ups page — 2S1-FE-09.

   BTG no longer approves profile edits (2S1-BE-14). It is told — by email,
   with a link here — only when an approved athlete changes a legal name
   (with its matching ID), a date of birth or a guardian, and each of those
   re-ran the sign-up checks. This section lists them, newest first, with
   what changed, what the checks found, and the ID through a five-minute
   audited link. Reject is the athlete's own Reject on New sign-ups.

   Reads  GET /profile-changes?size=25   sensitive edits only (BTG admins)
          GET /profile-changes/:id/id-document → a 5-minute link (sensitive-edit-actions.ts)
   -------------------------------------------------------------------------- */

const SHOWN = 25;

export async function SensitiveEdits() {
  const res = await apiFetch(`/profile-changes?page=1&size=${SHOWN}`);
  let body: React.ReactNode;
  if (!res.ok) {
    body = (
      <p className="px-4 py-3 text-xs text-muted">
        {res.status === 403 ? "Your role doesn’t read profile edits, so they aren’t shown here." : `Sensitive edits couldn’t be read just now (${res.status}).`}
      </p>
    );
  } else {
    const { edits, page } = (await res.json()) as { edits: ApiSensitiveEdit[]; page: { total: number } };
    body = edits.length === 0 ? (
      <p className="px-4 py-3 text-xs text-muted">No sensitive edits yet. A legal name, date of birth or guardian change appears here as it happens.</p>
    ) : (
      <>
        <p className="border-b border-line-soft px-4 py-2 text-[11px] text-muted">{page.total} sensitive edit{page.total === 1 ? "" : "s"} · newest first</p>
        <ul className="divide-y divide-line-soft">
          {edits.map((e) => (
            <li key={e.id} className="space-y-1.5 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-[13px] font-semibold">{e.athlete.displayName || e.athlete.legalName}</strong>
                <Badge tone={STATE_COPY[e.state].tone}>{e.state === "PENDING" ? "Waiting for the ID" : STATE_COPY[e.state].label}</Badge>
                <span className="text-muted">{dayOf(e.createdAt)}</span>
              </div>
              <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                {changeRows(e).map((r) => (
                  <div key={r.field} className="contents">
                    <dt className="text-muted">{r.label}</dt>
                    <dd className="min-w-0 break-words">{r.value}</dd>
                  </div>
                ))}
              </dl>
              {(e.checkNotes?.length ?? 0) > 0 && <p className="text-muted">{e.checkNotes!.join(" ")}</p>}
              <div className="flex flex-wrap items-center gap-3">
                {e.idDocument && (
                  <form action={viewEditIdAction.bind(null, e.id)}>
                    <button type="submit" className="text-primary hover:underline">Open the ID (5-minute link)</button>
                  </form>
                )}
                <Link href={`/admin/new-signups?tab=review&athlete=${encodeURIComponent(e.athlete.id)}`} className="text-primary hover:underline">
                  Review the athlete →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section id="sensitive-edits" aria-labelledby="ns-sensitive">
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 id="ns-sensitive" className="text-sm font-semibold">Sensitive profile edits</h2>
        <Badge tone="accent">Live</Badge>
        <span className="text-[11px] text-muted">Since 2S1-BE-14 edits publish at once; you&rsquo;re told only about these. Reject is on the athlete.</span>
      </div>
      <Card className="overflow-hidden p-0">{body}</Card>
    </section>
  );
}
