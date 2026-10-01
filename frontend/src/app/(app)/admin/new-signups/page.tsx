import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  SIGNUP_TABS, KIND_WORDS, checksWord, dayOf, orgHref, orgState, signupBadge, signupTab, sponsorRows, tabShows,
  type ApiOrgSignup, type ApiSponsorSignup, type SignupTab, type SponsorSignupRow,
} from "@/lib/new-signups-live";
import { LIVE_KIND_WORDS, liveBadge, liveChecksWord, needsReview, signupHref, type ApiSignupList } from "@/lib/signups-live";
import { apiFetch } from "@/server/api";
import { SensitiveEdits } from "@/components/sensitive-edits-section";

/* --------------------------------------------------------------------------
   New sign-ups — 2S1-FE-07 (Claude Design NewSignups.dc.html, views all and
   review). Everything SponsorX approved by itself; BTG steps in only for
   what is held under Needs review, and can reject (with an emailed reason)
   and reinstate. Every automatic-approval email links here.

   Sections, never mixed, under one set of tabs (All · Organizations ·
   Athletes · Guardians · Sponsors · Needs review):
   - Athletes and guardians — LIVE since 2S1-BE-09 / -10; each opens its
     profile here, with Reject and Reinstate.
   - Sensitive profile edits — LIVE since 2S1-BE-14 (2S1-FE-09).
   - Sponsors — LIVE since 2S1-BE-17; each opens its sponsor request.
   - Organizations — LIVE since 2S1-BE-06; each opens the organisation's
     profile (/admin/onboarding/:id), with Reject, Reinstate and the
     5-minute document links.

   Reads  GET /signups                             athletes and guardians, with counts
          GET /profile-changes?size=25             sensitive edits (sensitive-edits-section.tsx)
          GET /sponsor-requests?state=APPROVED     approved sponsors (autoApproved)
          GET /sponsor-requests?state=NEW          sponsors held with reviewReasons
          GET /onboarding/signups                  organizations (autoApproved, reasons)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";
const TITLE = "New sign-ups";
const SPONSORS_SHOWN = 25;
const COLS = "md:grid-cols-[1.5fr_7rem_5rem_11rem_1.4fr_5rem]";

type Live<T> = { ok: true; data: T } | { ok: false; status: number };

async function read<T>(path: string): Promise<Live<T>> {
  const res = await apiFetch(path);
  return res.ok ? { ok: true, data: (await res.json()) as T } : { ok: false, status: res.status };
}

export default async function NewSignupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <SkeletonRows rows={6} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const tab = signupTab((await searchParams).tab);

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        <Header />
        <EmptyState mark="users" title="No new sign-ups" hint="Organizations, athletes, guardians and sponsors appear here as they sign up and are approved." />
      </div>
    );
  }

  const [people, approved, waiting, orgs] = await Promise.all([
    read<ApiSignupList>("/signups"),
    read<{ requests: ApiSponsorSignup[]; counts: Record<string, number> }>("/sponsor-requests?state=APPROVED"),
    read<{ requests: ApiSponsorSignup[] }>("/sponsor-requests?state=NEW"),
    read<{ signups: ApiOrgSignup[] }>("/onboarding/signups"),
  ]);
  const sponsors: Live<SponsorSignupRow[]> = approved.ok && waiting.ok
    ? { ok: true, data: sponsorRows(approved.data.requests, waiting.data.requests) }
    : { ok: false, status: approved.ok ? (waiting as { status: number }).status : approved.status };

  const counts: Record<SignupTab["key"], number | null> = {
    all: null,
    org: orgs.ok ? orgs.data.signups.length : null,
    ath: people.ok ? people.data.counts.athletes : null,
    gua: people.ok ? people.data.counts.guardians : null,
    spo: sponsors.ok ? sponsors.data.length : null,
    review:
      (people.ok ? people.data.counts.review : 0) +
      (sponsors.ok ? sponsors.data.filter((r) => r.badge.tone === "warn").length : 0) +
      (orgs.ok ? orgs.data.signups.filter((s) => s.state === "NEEDS_REVIEW").length : 0),
  };

  return (
    <div className="space-y-6">
      <Header />
      <nav aria-label="Sign-up type" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
        {SIGNUP_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = counts[t.key];
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              {n !== null && (
                <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${t.key === "review" && n ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{n}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {(tabShows(tab, "ATHLETE") || tabShows(tab, "GUARDIAN")) && <AthletesAndGuardians tab={tab} live={people} />}
      {/* 2S1-FE-09 — sensitive profile edits (legal name, date of birth, guardian, a move across an age line). */}
      {(tab.key === "all" || tab.key === "ath" || tab.key === "review") && <SensitiveEdits />}
      {tabShows(tab, "SPONSOR") && <Sponsors tab={tab} live={sponsors} total={approved.ok ? approved.data.counts.APPROVED ?? 0 : 0} />}
      {tabShows(tab, "ORGANIZATION") && <Organizations tab={tab} live={orgs} />}
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">Everything SponsorX approved by itself. Nothing here needs you unless it&rsquo;s under Needs review.</p>
      </div>
      <Link href={`${PATH}/rules`} className="inline-flex min-h-9 items-center rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">
        Sign-up rules →
      </Link>
    </div>
  );
}

function SectionHead({ id, title, live, note }: { id: string; title: string; live: boolean; note: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-baseline gap-2">
      <h2 id={id} className="text-sm font-semibold">{title}</h2>
      <Badge tone={live ? "accent" : "warn"}>{live ? "Live" : "Sample"}</Badge>
      <span className="text-[11px] text-muted">{note}</span>
    </div>
  );
}

function Unreadable({ status, what }: { status: number; what: string }) {
  return (
    <p className="px-4 py-3 text-xs text-muted">
      {status === 403 ? `Your role doesn’t read ${what}, so they aren’t shown here.` : `${what[0]!.toUpperCase()}${what.slice(1)} couldn’t be read just now (${status}).`}
    </p>
  );
}

/* ------------------------------------------- athletes and guardians · live */

function AthletesAndGuardians({ tab, live }: { tab: SignupTab; live: Live<ApiSignupList> }) {
  let body;
  if (!live.ok) {
    body = <Unreadable status={live.status} what="athlete and guardian sign-ups" />;
  } else {
    const rows = live.data.signups.filter((s) =>
      tab.key === "review" ? needsReview(s) : tab.key === "ath" ? s.kind === "ATHLETE" : tab.key === "gua" ? s.kind === "GUARDIAN" : true,
    );
    body = rows.length === 0 ? (
      <p className="px-4 py-3 text-xs text-muted">
        {tab.key === "review" ? "Nothing to review — every athlete and guardian passed their checks." : "No athlete or guardian sign-ups yet. They appear here once their checks have run."}
      </p>
    ) : (
      <SignupRows
        label="Athlete and guardian sign-ups"
        reasonHead={tab.key === "review" ? "Why it needs review" : "Checks"}
        rows={rows.map((s) => ({
          key: `${s.kind}-${s.id}`, name: s.name, sub: s.sub, type: LIVE_KIND_WORDS[s.kind], when: dayOf(s.signedUpAt),
          badge: liveBadge(s), reason: liveChecksWord(s), href: signupHref(s.kind, s.id), primary: needsReview(s),
        }))}
      />
    );
  }
  return (
    <section aria-labelledby="ns-people">
      <SectionHead id="ns-people" title="Athletes and guardians" live note="Approved automatically since 2S1-BE-09 / -10. Each opens its profile, with Reject and Reinstate." />
      <Card className="overflow-hidden p-0">{body}</Card>
    </section>
  );
}

/* ---------------------------------------------------------- sponsors · live */

function Sponsors({ tab, live, total }: { tab: SignupTab; live: Live<SponsorSignupRow[]>; total: number }) {
  let body;
  if (!live.ok) {
    body = <Unreadable status={live.status} what="sponsor requests" />;
  } else {
    const rows = tab.key === "review" ? live.data.filter((r) => r.badge.tone === "warn") : live.data;
    const heldCount = live.data.filter((r) => r.badge.tone === "warn").length;
    body = (
      <>
        <p className="border-b border-line-soft px-4 py-2 text-[11px] text-muted">{total} approved · {heldCount} held for review</p>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted">{tab.key === "review" ? "No sponsors held for review." : "No sponsor sign-ups yet. They appear here once a business confirms its email."}</p>
        ) : (
          <SignupRows
            label="Sponsor sign-ups"
            reasonHead="Checks"
            rows={rows.slice(0, SPONSORS_SHOWN).map((r) => ({
              key: r.id, name: r.name, sub: r.sub, type: "Sponsor", when: r.when, badge: r.badge, reason: r.reason,
              href: `/admin/sponsor-requests/${r.id}`, primary: r.badge.tone === "warn",
            }))}
          />
        )}
        {rows.length > SPONSORS_SHOWN && (
          <p className="border-t border-line-soft px-4 py-2 text-[11px] text-muted">
            Showing the first {SPONSORS_SHOWN}. <Link href="/admin/sponsor-requests?tab=approved" className="text-primary hover:underline">See every sponsor request →</Link>
          </p>
        )}
      </>
    );
  }
  return (
    <section aria-labelledby="ns-sponsors">
      <SectionHead id="ns-sponsors" title="Sponsors" live note="Approved automatically since 2S1-BE-17. Each opens its sponsor request." />
      <Card className="overflow-hidden p-0">{body}</Card>
    </section>
  );
}

/* ----------------------------------------------------- organizations · live */

function Organizations({ tab, live }: { tab: SignupTab; live: Live<{ signups: ApiOrgSignup[] }> }) {
  let body;
  if (!live.ok) {
    body = <Unreadable status={live.status} what="organization sign-ups" />;
  } else {
    const rows = live.data.signups.filter((s) => (tab.key === "review" ? s.state === "NEEDS_REVIEW" : true));
    body = rows.length === 0 ? (
      <p className="px-4 py-3 text-xs text-muted">
        {tab.key === "review" ? "No organizations need review." : "No organization sign-ups yet. They appear here once they submit."}
      </p>
    ) : (
      <SignupRows
        label="Organization sign-ups"
        reasonHead={tab.key === "review" ? "Why it needs review" : "Checks"}
        rows={rows.map((s) => {
          const state = orgState(s);
          return {
            key: s.id, name: s.name, sub: s.sub, type: KIND_WORDS.ORGANIZATION, when: dayOf(s.signedUpAt),
            badge: signupBadge({ state }, state === "AUTO_APPROVED" ? s.approvedAt : null),
            reason: s.reasons.length ? checksWord({ ...s, state }) : state === "APPROVED" ? "Reviewed and approved by BTG" : state === "REJECTED" ? "Rejected by BTG" : "All checks passed",
            href: orgHref(s.id), primary: s.state === "NEEDS_REVIEW",
          };
        })}
      />
    );
  }
  return (
    <section aria-labelledby="ns-orgs">
      <SectionHead id="ns-orgs" title="Organizations" live note="Teams, schools, events, media, virtual and agencies — approved automatically since 2S1-BE-06. Each opens its profile, with Reject and Reinstate." />
      <Card className="overflow-hidden p-0">{body}</Card>
    </section>
  );
}

/* ------------------------------------------------------------------ rows */

type RowView = {
  key: string; name: string; sub: string; type: string; when: string;
  badge: { label: string; tone: "accent" | "warn" | "neutral"; mark: string };
  reason: string; href: string; primary: boolean;
};

function SignupRows({ label, reasonHead, rows }: { label: string; reasonHead: string; rows: RowView[] }) {
  return (
    <div role="region" aria-label={label}>
      <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid ${COLS}`}>
        <span>Name</span><span>Type</span><span>When</span><span>Status</span><span>{reasonHead}</span><span className="sr-only">Open</span>
      </div>
      <ul className="divide-y divide-line-soft">
        {rows.map((r) => (
          <li key={r.key} className={`grid gap-x-3 gap-y-1 px-4 py-3 text-xs md:items-center ${COLS}`}>
            <span className="min-w-0">
              <strong className="block text-[13px] font-semibold">{r.name}</strong>
              <span className="block text-[11px] text-muted">{r.sub}</span>
            </span>
            <span className="text-muted md:text-text"><span className="md:hidden">Type: </span>{r.type}</span>
            <span className="text-muted">{r.when}</span>
            <span><Badge tone={r.badge.tone}><span aria-hidden="true" className="mr-1">{r.badge.mark}</span>{r.badge.label}</Badge></span>
            <span className="min-w-0 break-words text-muted">{r.reason}</span>
            <span className="md:text-right">
              <Link href={r.href} aria-label={`Open ${r.name}`}
                className={`inline-flex min-h-9 items-center rounded-lg px-3.5 text-xs font-semibold ${r.primary ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}>
                Open →
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
