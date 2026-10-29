import Link from "next/link";

import { viewEditIdAction } from "@/app/(app)/admin/new-signups/sensitive-edit-actions";
import { DocumentCheck } from "@/components/document-check";
import { SensitiveEditDecision } from "@/components/legal-name-decision";
import { PagerRow, PendingList } from "@/components/server-pager";
import { StageHeading } from "@/components/ops-stage";
import { Badge } from "@/components/ui";
import { dayOf } from "@/lib/account-live";
import { pageParamsFor, type ListKeys, type PageInfo, type SearchParams } from "@/lib/list-query";
import { STATE_COPY, awaitingBtg, changeRows, editIdCheck, editStatusLabel, heldForBtg, sensitiveWhat, type ApiSensitiveEdit } from "@/lib/profile-changes-live";
import { signupHref } from "@/lib/signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Sensitive profile edits, on BTG's New sign-ups page — 2S1-FE-09.

   BTG no longer approves profile edits (2S1-BE-14). It is told — by email,
   with a link here — only when an approved athlete changes a legal name
   (with its matching ID), a date of birth or a guardian, and each of those
   re-ran the sign-up checks. This section lists them, newest first, with
   what changed, what the checks found, and the ID through a five-minute
   audited link. Reject is the athlete's own Reject on New sign-ups.

   Two kinds wait here for BTG's Apply / Decline (legal-name-decision.tsx):
   a legal name whose ID didn't read clear (P8-FE-11), and — POL-FE-02 — a
   minor's date of birth or move that would make them an adult, held with
   no ID at all (POL-BE-02).

   P1-ART-15: a glass panel on the Intake Stream's stage, SERVER-PAGED by the
   house rule (12 / 24 / 60) on its own URL keys — `epage` / `esize` — so it
   keeps its place while the stream above pages, and vice versa. It must sit
   inside the page's <ServerList>.

   Reads  GET /profile-changes?page=&size=   sensitive edits only (BTG admins)
          GET /profile-changes/:id/id-document → a 5-minute link (sensitive-edit-actions.ts)
   -------------------------------------------------------------------------- */

export const EDIT_KEYS: ListKeys = { page: "epage", size: "esize" };

export async function SensitiveEdits({ searchParams }: { searchParams: SearchParams }) {
  const { page, size } = pageParamsFor(searchParams, EDIT_KEYS);
  const res = await apiFetch(`/profile-changes?page=${page}&size=${size}`);
  let body: React.ReactNode;
  if (!res.ok) {
    body = (
      <p className="sx-ops-panel relative px-6 py-5 text-xs text-[#9aa4b2]">
        {res.status === 403 ? "Your role doesn’t read profile edits, so they aren’t shown here." : `Sensitive edits couldn’t be read just now (${res.status}).`}
      </p>
    );
  } else {
    const { edits, page: info } = (await res.json()) as { edits: ApiSensitiveEdit[]; page: PageInfo };
    body = edits.length === 0 ? (
      <p className="sx-ops-panel relative px-6 py-5 text-xs text-[#9aa4b2]">
        No sensitive edits yet. A legal name, date of birth or guardian change appears here as it happens.
      </p>
    ) : (
      <div className="space-y-3">
        <PagerRow page={info} keys={EDIT_KEYS} noun="Edits" tone="admin" position="top" />
        <PendingList>
          <ul className="sx-ops-panel relative">
            {edits.map((e) => (
              <li key={e.id} className="space-y-2 border-b border-white/5 px-5 py-4 text-xs last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-semibold">{e.athlete.displayName || e.athlete.legalName}</strong>
                  <Badge tone={STATE_COPY[e.state].tone}>{editStatusLabel(e)}</Badge>
                  <span className="text-[#8a96a3]">{dayOf(e.createdAt)}</span>
                </div>
                <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
                  {changeRows(e).map((r) => (
                    <div key={r.field} className="contents">
                      <dt className="text-[#8a96a3]">{r.label}</dt>
                      <dd className="min-w-0 break-words">{r.value}</dd>
                    </div>
                  ))}
                </dl>
                {(e.checkNotes?.length ?? 0) > 0 && <p className="text-[#9aa4b2]">{e.checkNotes!.join(" ")}</p>}
                {/* P8-FE-11 — what reading the ID found (P8-BE-11); a held name is answered here. */}
                <DocumentCheck check={editIdCheck(e)} />
                {awaitingBtg(e) && (
                  heldForBtg(e) ? (
                    <SensitiveEditDecision changeId={e.id} athlete={e.athlete.legalName || e.athlete.displayName} kind="adulthood" what={sensitiveWhat(e).toLowerCase()} />
                  ) : (
                    <SensitiveEditDecision changeId={e.id} athlete={e.athlete.legalName || e.athlete.displayName} kind="legalName" what={String(e.fields.legalName ?? "")} />
                  )
                )}
                <div className="flex flex-wrap items-center gap-4">
                  {e.idDocument && (
                    <form action={viewEditIdAction.bind(null, e.id)}>
                      <button type="submit" className="text-[#63b4f8] transition-colors hover:text-[#9be0ff]">Open the ID (5-minute link)</button>
                    </form>
                  )}
                  <Link href={signupHref("ATHLETE", e.athlete.id)} className="text-[#63b4f8] transition-colors hover:text-[#9be0ff]">
                    Review the athlete →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </PendingList>
        <PagerRow page={info} keys={EDIT_KEYS} noun="Edits" tone="admin" position="bottom" />
      </div>
    );
  }

  return (
    <section id="sensitive-edits" aria-label="Sensitive profile edits">
      <StageHeading
        title="Sensitive profile edits"
        hint="Edits publish at once; you’re told only about legal name, date of birth and guardian changes. A change that would make a minor an adult waits here for you. Reject is on the athlete."
        delay={0.7}
      />
      {body}
    </section>
  );
}
