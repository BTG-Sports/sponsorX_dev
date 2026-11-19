import Link from "next/link";

import { viewEditIdAction } from "@/app/(app)/admin/new-signups/sensitive-edit-actions";
import { Glyph } from "@/components/athlete-inventory/glyphs";
import { LoadSwap, PagerGhost } from "@/components/desk-kit";
import { DocumentCheck } from "@/components/document-check";
import { SensitiveEditDecision } from "@/components/legal-name-decision";
import { PagerRow } from "@/components/server-pager";
import { EditsSkeleton } from "@/components/signup-stage";
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

   P1-ART-15: on the New sign-ups stage, SERVER-PAGED by the house rule
   (12 / 24 / 60) on its own URL keys — `epage` / `esize` — so it keeps its
   place while the stream above pages, and vice versa.

   POL-FE-109: one glass card per edit (an orange edge on the ones waiting
   for Apply / Decline), a heading in plain words, and a loader — the list
   swaps to its skeleton while its next page is fetched. It must sit inside
   a <ServerList> of its own (the page gives it one), so only its own paging
   shows that loader and a note being typed in a decision is never unmounted
   by the stream above re-fetching. Styles: `.sx-su-*` in
   admin/new-signups/(stream)/signups.css.

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
      <p className="sx-su-note">
        {res.status === 403 ? "Your role doesn’t read profile edits, so they aren’t shown here." : `Sensitive edits couldn’t be read just now (${res.status}).`}
      </p>
    );
  } else {
    const { edits, page: info } = (await res.json()) as { edits: ApiSensitiveEdit[]; page: PageInfo };
    body = edits.length === 0 ? (
      <p className="sx-su-note">
        No sensitive edits yet. A legal name, date of birth or guardian change appears here as it happens.
      </p>
    ) : (
      <LoadSwap
        label="Loading edits…"
        skeleton={
          <div className="space-y-3">
            <PagerGhost />
            <EditsSkeleton />
          </div>
        }
      >
        <div className="space-y-3">
          <PagerRow page={info} keys={EDIT_KEYS} noun="Edits" tone="admin" position="top" />
          <ul className="sx-su-edits">
            {edits.map((e, i) => (
              <li
                key={e.id}
                data-waiting={awaitingBtg(e) ? "" : undefined}
                className="sx-su-edit sx-ap-rise"
                style={{ "--d": `${Math.min(i, 8) * 0.04}s` } as React.CSSProperties}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-semibold text-white">{e.athlete.displayName || e.athlete.legalName}</strong>
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
          <PagerRow page={info} keys={EDIT_KEYS} noun="Edits" tone="admin" position="bottom" />
        </div>
      </LoadSwap>
    );
  }

  return (
    <section id="sensitive-edits" aria-label="Sensitive profile edits">
      <div className="sx-su-sec sx-ap-rise" style={{ "--d": "0.5s" } as React.CSSProperties}>
        <span className="sx-su-sec-icon" aria-hidden="true">
          <Glyph ui="edit" className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h2>Sensitive profile edits</h2>
          <p>
            Profile edits go live at once. You&rsquo;re only told about a legal name, date of birth or guardian change. One
            that would make a minor an adult waits here for you to apply or decline. To reject the athlete, open them.
          </p>
        </div>
      </div>
      {body}
    </section>
  );
}
