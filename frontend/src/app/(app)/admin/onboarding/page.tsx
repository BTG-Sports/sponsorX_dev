import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui";
import { apiListQuery } from "@/lib/list-query";
import { isOverdue, waitLabel } from "@/lib/marketplace-ops-live";
import {
  ORG_TYPE_COPY,
  STATE_COPY,
  dateLabel,
  isOnboardingState,
  type ApiOnboardingPage,
  type OnboardingState,
} from "@/lib/onboarding-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Property verification — 2S1-FE-02. Outside teams, schools, events, media
   and virtual venues that applied through the public wizard (2S1-FE-01).

   P1-FE-31 (2026-10-07): ONE server-paged read of the open tab — the API
   answers that tab's page and every tab's count (it used to take eight
   whole-table reads to count the tabs). Pending review is the default,
   oldest submission first as the API sorts. BTG_ADMIN (own tenant) and
   SUPER_ADMIN only — every other role is 403 at the API and "not in your
   role" here. Decisions are on the detail page.

   2S1-FE-05 adds BTG's checks afterwards (2S1-BE-06 / -07): "Approved
   automatically" (?list=auto — newest first, for spot checks) and
   "Flagged" (?list=flagged — a required document removed after approval).
   A held application shows its reasons.

   Reads  GET /onboarding?page&size&state=<tab>        one state's page + counts
          GET /onboarding?page&size&list=auto|flagged   one list's page + counts
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/onboarding";
const TITLE = "Property verification";
const TAB_ORDER: OnboardingState[] = ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SUSPENDED", "REJECTED", "DRAFT"];

export default async function OnboardingQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const sp = await searchParams;
  /* 2S1-FE-05 — the two lists for BTG's checks afterwards. */
  const list = sp.list === "auto" || sp.list === "flagged" ? sp.list : null;
  const tab: OnboardingState = isOnboardingState(sp.state) ? sp.state : "PENDING_REVIEW";

  const res = await apiFetch(`/onboarding${apiListQuery(sp, list ? { list } : { state: tab })}`);
  if (res.status === 403) {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="users" title="Outside your role" hint="The verification queue is read by BTG admins." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`The verification queue didn't load (${res.status}).`);
  const data = (await res.json()) as ApiOnboardingPage;
  const rows = data.onboardings;
  const counts = data.counts;
  const now = new Date().getTime();
  const waiting = !list && tab === "PENDING_REVIEW";

  const columns: Column[] = [
    { key: "org", label: "Organization" },
    { key: "when", label: list === "auto" ? "Approved" : "Submitted" },
    { key: "docs", label: "Documents", num: true },
    { key: "why", label: list === "flagged" ? "Flag" : "Held because" },
    { key: "wait", label: waiting ? "Waiting" : !list && tab === "DRAFT" ? "Missing" : "Status" },
    { key: "action", label: "Open", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">
          Outside teams, schools, events and venues applying to sell on SponsorX. Every decision is recorded against the reviewer.
        </p>
      </div>

      <TabStrip label="Application states">
        {TAB_ORDER.map((s) => (
          <TabLink key={s} href={s === "PENDING_REVIEW" ? PATH : `${PATH}?state=${s}`} on={!list && s === tab} count={counts[s] ?? 0} hot={s === "PENDING_REVIEW"}>
            {STATE_COPY[s].label}
          </TabLink>
        ))}
        <TabLink href={`${PATH}?list=auto`} on={list === "auto"} count={counts.auto}>Approved automatically</TabLink>
        <TabLink href={`${PATH}?list=flagged`} on={list === "flagged"} count={counts.flagged} hot>Flagged</TabLink>
      </TabStrip>

      {list === "auto" && rows.length > 0 && (
        <p className="text-xs text-muted">Every organization the system approved, newest first. Open one to spot-check its documents, and reject it if something is wrong.</p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={
            list === "auto" ? "Nothing approved automatically yet"
              : list === "flagged" ? "Nothing flagged"
              : tab === "PENDING_REVIEW" ? "Nothing waiting for review" : `No ${STATE_COPY[tab].label.toLowerCase()} applications`
          }
          hint={
            list === "flagged"
              ? "An approved organization is flagged here when a required document is removed without a replacement."
              : "Applications arrive here when a team, school, event, venue or agency submits the onboarding wizard at /onboarding."
          }
        />
      ) : (
        <PagedTable page={data.page} noun="Applications" label={list === "auto" ? "Approved automatically" : list === "flagged" ? "Flagged organizations" : `${STATE_COPY[tab].label} applications`} columns={columns}>
          {rows.map((o, i) => {
            const wait = waiting ? waitLabel(o.submittedAt, now) : null;
            const late = waiting && isOverdue(o.submittedAt, now);
            const why = o.state === "PENDING_REVIEW" ? o.reviewReasons : o.flags;
            const uploaded = o.documents.filter((d) => d.uploadedAt).length;
            return (
              <Tr key={o.id} i={i} tone={late ? "warn" : list === "flagged" ? "danger" : undefined}>
                <Td>
                  <Primary sub={`${ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType}${o.stateCode ? ` · ${o.stateCode}` : ""}`}>
                    <Link href={`${PATH}/${o.id}`} className="hover:underline">{o.orgName}</Link>
                  </Primary>
                </Td>
                <Td label={list === "auto" ? "Approved" : "Submitted"} muted>
                  {list === "auto" && o.decidedAt ? dateLabel(o.decidedAt) : o.submittedAt ? dateLabel(o.submittedAt) : `started ${dateLabel(o.createdAt)}`}
                </Td>
                <Td label="Documents" num muted>{o.documents.length ? `${uploaded} / ${o.documents.length}` : "—"}</Td>
                <Td label={list === "flagged" ? "Flag" : "Held because"}>
                  {why?.length > 0 ? <span className="text-[11px] text-warn">{why.join(" · ")}</span> : <span className="text-faint">—</span>}
                </Td>
                <Td label={waiting ? "Waiting" : "Status"}>
                  {wait ? (
                    <span className={`tabular-nums ${late ? "font-semibold text-warn" : "text-muted"}`}>{wait}</span>
                  ) : !list && tab === "DRAFT" ? (
                    <span className="text-muted">{o.missing.length > 0 ? `${o.missing.length} answer(s) missing` : "—"}</span>
                  ) : (
                    <Badge tone={STATE_COPY[o.state].tone}>{STATE_COPY[o.state].label}</Badge>
                  )}
                </Td>
                <Td act>
                  <Link href={`${PATH}/${o.id}`} aria-label={`Open ${o.orgName}`} className="font-medium text-primary hover:underline">
                    {waiting ? "Review →" : "Open →"}
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
