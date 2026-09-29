import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { EmptyState } from "@/components/states";
import { Badge, Card } from "@/components/ui";
import { isOverdue, waitLabel } from "@/lib/marketplace-ops-live";
import {
  ONBOARDING_STATES,
  ORG_TYPE_COPY,
  STATE_COPY,
  dateLabel,
  isOnboardingState,
  type ApiOnboarding,
  type OnboardingState,
} from "@/lib/onboarding-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Property verification — 2S1-FE-02. Outside teams, schools, events, media
   and virtual venues that applied through the public wizard (2S1-FE-01).

   Reads GET /onboarding?state=<tab> for each of the six states in parallel
   (the API has no counts route; each tab's count is its array's length),
   oldest submission first as the API sorts. Pending review is the default.
   BTG_ADMIN (own tenant) and SUPER_ADMIN only — every other role is 403 at
   the API and "not in your role" here. Decisions are on the detail page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/onboarding";
const TAB_ORDER: OnboardingState[] = ["PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "SUSPENDED", "REJECTED", "DRAFT"];

export default async function OnboardingQueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Property verification" roles={lacking} />;

  const sp = await searchParams;
  const tab: OnboardingState = isOnboardingState(sp.state) ? sp.state : "PENDING_REVIEW";

  const responses = await Promise.all(ONBOARDING_STATES.map((s) => apiFetch(`/onboarding?state=${s}`)));
  if (responses.some((r) => r.status === 403)) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold tracking-tight">Property verification</h1>
        <EmptyState mark="users" title="Outside your role" hint="The verification queue is read by BTG admins." />
      </div>
    );
  }
  const bad = responses.find((r) => !r.ok);
  if (bad) throw new Error(`The verification queue didn't load (${bad.status}).`);
  const lists = await Promise.all(responses.map(async (r) => ((await r.json()) as { onboardings: ApiOnboarding[] }).onboardings));
  const byState = Object.fromEntries(ONBOARDING_STATES.map((s, i) => [s, lists[i]!])) as Record<OnboardingState, ApiOnboarding[]>;
  const rows = byState[tab];
  const now = new Date().getTime();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Property verification</h1>
        <p className="mt-1 text-xs text-muted">
          Outside teams, schools, events and venues applying to sell on SponsorX. Every decision is recorded against the reviewer.
        </p>
      </div>

      <nav aria-label="Application states" className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {TAB_ORDER.map((s) => (
          <Link
            key={s}
            href={s === "PENDING_REVIEW" ? PATH : `${PATH}?state=${s}`}
            aria-current={s === tab ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${s === tab ? "bg-primary/15 text-primary-soft" : "text-muted hover:text-text"}`}
          >
            {STATE_COPY[s].label} <span className="tabular-nums text-faint">{byState[s].length}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={tab === "PENDING_REVIEW" ? "Nothing waiting for review" : `No ${STATE_COPY[tab].label.toLowerCase()} applications`}
          hint="Applications arrive here when a team, school, event or venue submits the onboarding wizard at /onboarding."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            {rows.map((o) => {
              const wait = tab === "PENDING_REVIEW" ? waitLabel(o.submittedAt, now) : null;
              const late = tab === "PENDING_REVIEW" && isOverdue(o.submittedAt, now);
              return (
                <li key={o.id}>
                  <Link href={`${PATH}/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.orgName}</p>
                      <p className="text-[11px] text-muted">
                        {ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType}
                        {o.stateCode ? ` · ${o.stateCode}` : ""}
                        {o.submittedAt ? ` · submitted ${dateLabel(o.submittedAt)}` : ` · started ${dateLabel(o.createdAt)}`}
                        {o.documents.length ? ` · ${o.documents.filter((d) => d.uploadedAt).length} document(s)` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {wait && <span className={`text-[11px] tabular-nums ${late ? "text-warn" : "text-faint"}`}>waiting {wait}</span>}
                      {tab === "DRAFT" && o.missing.length > 0 && <span className="text-[11px] text-faint">{o.missing.length} answer(s) missing</span>}
                      <Badge tone={STATE_COPY[o.state].tone}>{STATE_COPY[o.state].label}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
