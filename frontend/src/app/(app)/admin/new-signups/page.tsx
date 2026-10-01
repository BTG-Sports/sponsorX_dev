import type { ReactNode } from "react";
import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, BlockedNotice, Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  SAMPLE_SIGNUPS, SIGNUP_BACKEND, SIGNUP_TABS, KIND_WORDS, checksWord, dayOf, inTab, signupBadge, signupTab, sponsorRows, tabCount,
  type ApiSponsorSignup,
} from "@/lib/new-signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   New sign-ups — 2S1-FE-07 (Claude Design NewSignups.dc.html, views all and
   review). Everything SponsorX approved by itself; BTG steps in only for
   what is held under Needs review, and can reject (with an emailed reason)
   and reinstate.

   Two sections, never mixed:
   - Sponsors — LIVE. Approved automatically since 2S1-BE-17.
   - Organizations, athletes and guardians — SAMPLE rows until 2S1-BE-06,
     -09 and -10 build their automatic approval.

   Reads  GET /sponsor-requests?state=APPROVED   approved sponsors (autoApproved)
          GET /sponsor-requests?state=NEW        sponsors held with reviewReasons
          (fixtures, lib/new-signups-live.ts)    everyone else
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";
const TITLE = "New sign-ups";
const SPONSORS_SHOWN = 25;
const COLS = "md:grid-cols-[1.5fr_7rem_5rem_11rem_1.4fr_5rem]";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">Everything SponsorX approved by itself. Nothing here needs you unless it&rsquo;s under Needs review.</p>
      </div>

      {demo === "empty" ? (
        <EmptyState mark="users" title="No new sign-ups" hint="Organizations, athletes, guardians and sponsors appear here as they sign up and are approved." />
      ) : (
        <>
          <LiveSponsors />
          <SampleSignups tab={tab} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------ sponsors · live */

async function LiveSponsors() {
  const [approvedRes, waitingRes] = await Promise.all([
    apiFetch("/sponsor-requests?state=APPROVED"),
    apiFetch("/sponsor-requests?state=NEW"),
  ]);

  let body: ReactNode;
  if (!approvedRes.ok || !waitingRes.ok) {
    const status = approvedRes.ok ? waitingRes.status : approvedRes.status;
    body = (
      <p className="px-4 py-3 text-xs text-muted">
        {status === 403 ? "Your role doesn’t read sponsor requests, so sponsor sign-ups aren’t shown here." : `Sponsor sign-ups couldn’t be read just now (${status}).`}
      </p>
    );
  } else {
    const approved = (await approvedRes.json()) as { requests: ApiSponsorSignup[]; counts: Record<string, number> };
    const waiting = (await waitingRes.json()) as { requests: ApiSponsorSignup[] };
    const rows = sponsorRows(approved.requests, waiting.requests);
    const heldCount = rows.filter((r) => r.badge.tone === "warn").length;
    body = (
      <>
        <p className="border-b border-line-soft px-4 py-2 text-[11px] text-muted">
          {approved.counts.APPROVED ?? 0} approved · {heldCount} held for review
        </p>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted">No sponsor sign-ups yet. They appear here once a business confirms its email.</p>
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
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 id="ns-sponsors" className="text-sm font-semibold">Sponsors</h2>
        <Badge tone="accent">Live</Badge>
        <span className="text-[11px] text-muted">Approved automatically since 2S1-BE-17. Each opens its sponsor request.</span>
      </div>
      <Card className="overflow-hidden p-0">{body}</Card>
    </section>
  );
}

/* --------------------------------------- organizations, athletes, guardians · sample */

function SampleSignups({ tab }: { tab: ReturnType<typeof signupTab> }) {
  const rows = SAMPLE_SIGNUPS.filter((s) => inTab(tab, s));
  return (
    <section aria-labelledby="ns-sample" className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 id="ns-sample" className="text-sm font-semibold">Organizations, athletes and guardians</h2>
        <Badge tone="warn">Sample</Badge>
      </div>
      <BlockedNotice>
        Sample data — these rows go live with {SIGNUP_BACKEND}, which approve these sign-ups automatically. Reject and Reinstate stay off until then.
      </BlockedNotice>

      <nav aria-label="Sign-up type" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
        {SIGNUP_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = tabCount(t, SAMPLE_SIGNUPS);
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${t.key === "review" && n ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState mark="users" title={tab.key === "review" ? "Nothing needs review" : "None of this type"} hint="" />
      ) : (
        <Card className="overflow-hidden p-0">
          <SignupRows
            label="Sign-ups"
            reasonHead={tab.key === "review" ? "Why it needs review" : "Checks"}
            rows={rows.map((s) => ({
              key: s.id, name: s.name, sub: s.sub, type: KIND_WORDS[s.kind], when: dayOf(s.signedUpAt), badge: signupBadge(s),
              reason: checksWord(s), href: `${PATH}/${s.id}`, primary: s.state === "NEEDS_REVIEW",
            }))}
          />
        </Card>
      )}
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
