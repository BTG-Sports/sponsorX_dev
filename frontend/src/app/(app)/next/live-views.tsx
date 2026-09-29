import Link from "next/link";

import { Badge, Button, Card, Meter, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { CountUp } from "@/components/count-up";
import { EmptyState } from "@/components/states";
import { StudentCodeCard } from "@/components/student-code-card";
import { ProspectForm } from "@/components/student-prospect";
import { ICONS } from "@/components/icons";
import { money } from "@/lib/fixtures";
import { ListFilter, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";
import {
  LEDGER_KEYS,
  POINT_REASON_COPY,
  PROSPECT_FILTERS,
  PROSPECT_STATE_COPY,
  STUDENT_CATEGORIES,
  STUDENT_STATE_COPY,
  salesMilestone,
} from "@/lib/students-live";
import type { ApiStudentProspect, LiveStudent } from "./live";

/* --------------------------------------------------------------------------
   P9-FE-01 / -10 — the student portal on the student's own records.
   Every figure is the API's: SalesAttribution rows (recorded by SponsorX,
   never self-reported), StudentPointAccrual rows (no cents, no relation to
   Earning — nothing here reads Earning), the StudentCode, and the
   prospects the student logged. Where the matrix withholds something — a
   sponsor's name is not a student read — the page says so rather than
   inventing it.
   -------------------------------------------------------------------------- */

type Student = Extract<LiveStudent, { kind: "student" }>;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const CATEGORY = Object.fromEntries(STUDENT_CATEGORIES);
const label = (c: string) => CATEGORY[c] ?? c.replace(/_/g, " ").toLowerCase();

export function StudentUnlinked({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <EmptyState
        mark="chart"
        title="Your account isn't linked to a student record"
        hint="Ask your advisor or SponsorX to link your sign-in to your application — then this page fills in."
      />
    </div>
  );
}

function ActiveOnly({ s }: { s: Student["student"] }) {
  if (s.state === "ACTIVE") return null;
  return (
    <Card className="border-warn/30 bg-warn/5">
      <p className="text-sm font-medium">{STUDENT_STATE_COPY[s.state]}</p>
      <p className="mt-1 text-xs text-muted">
        {s.state === "APPROVED"
          ? "You're approved — you join the masthead once your advisor adds you (a guardian must be verified first if you're under 18)."
          : s.reviewerNotes
            ? `Your advisor's note: ${s.reviewerNotes}`
            : "Selling and points start once you're on the masthead."}
      </p>
    </Card>
  );
}

/* ---------------------------------------------------------------- home */
export function LiveStudentHome({ live }: { live: Student }) {
  const s = live.student;
  const total = live.sales?.totalCents ?? 0;
  const waiting = live.prospects?.summary.states.SUBMITTED ?? 0;
  const tiles = [
    { href: "/next/sales", label: "Closed sales", value: live.sales ? money(total) : "—", sub: live.sales ? `${live.sales.page.total} recorded by SponsorX` : "not in your scope" },
    { href: "/next/points", label: "Points", value: live.points ? `${live.points.balance} pts` : "—", sub: "recognition, never pay" },
    { href: "/next/code", label: "My code", value: live.code ?? "not issued", sub: live.code ? "hand it to a business" : "issued once you're active" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hi, {s.displayName.split(" ")[0]}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {s.gradYear && <span>Class of {s.gradYear}</span>}
          {s.masthead.map((m) => (
            <Badge key={m} tone="primary">{m.toLowerCase()}</Badge>
          ))}
        </p>
      </div>
      <ActiveOnly s={s} />
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="block min-w-0 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-next/40">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
            <p className="mt-1 truncate text-xl font-semibold tabular-nums tracking-tight">{t.value}</p>
            <p className="mt-0.5 text-[10px] text-faint">{t.sub}</p>
          </Link>
        ))}
      </div>
      {waiting > 0 && (
        <Card>
          <p className="text-sm font-medium">{waiting} prospect{waiting === 1 ? "" : "s"} with SponsorX</p>
          <p className="mt-1 text-xs text-muted">The acceptance check is SponsorX&rsquo;s — you hear back either way, and a refusal never costs you credit.</p>
        </Card>
      )}
      <p className="flex items-center gap-1.5 text-[10px] text-faint">
        your own records <MiniChip kind="ver">POSTGRES</MiniChip>
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- sales */
const NO_PAGE: PageInfo = { page: 1, size: 12, total: 0, pages: 1 };

function ProspectCard({ p }: { p: ApiStudentProspect }) {
  if (p.state !== "REJECTED") {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="min-w-0 break-words text-sm font-medium">{p.businessName}</p>
          <Badge tone={p.state === "ACCEPTED" ? "accent" : "primary"}>{PROSPECT_STATE_COPY[p.state]}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted">{label(p.category)} · logged {date(p.createdAt)}</p>
      </Card>
    );
  }
  return (
    <Card className="border-danger/25">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-medium">{p.businessName}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="danger">{PROSPECT_STATE_COPY[p.state]}</Badge>
          {p.reasonCode && <Badge tone="neutral">{p.reasonCode.replace(/_/g, " ").toLowerCase()}</Badge>}
        </div>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-success">✓ Sales credit kept</span>
        {p.redirectCategories.length > 0 && (
          <span className="text-faint">Still open at your school: {p.redirectCategories.slice(0, 5).map(label).join(", ")}</span>
        )}
      </p>
    </Card>
  );
}

/**
 * My sales, server-paged (2026-09-29): prospects on ?page / ?size with the
 * ?pstate filter, the attribution ledger on its own ?lpage / ?lsize. The
 * all-time total and the per-state counts are the API's aggregates.
 */
export function LiveStudentSales({ live, pstate = "" }: { live: Student; pstate?: string }) {
  const s = live.student;
  const sales = live.sales?.sales ?? [];
  const ledgerPage = live.sales?.page ?? NO_PAGE;
  const total = live.sales?.totalCents ?? 0;
  const prospects = live.prospects?.prospects ?? [];
  const prospectPage = live.prospects?.page ?? NO_PAGE;
  const counts = live.prospects?.summary ?? { states: { SUBMITTED: 0, ACCEPTED: 0, REJECTED: 0 }, all: 0 };
  const m = salesMilestone(total);
  return (
    <ServerList>
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">My sales</h1>
          <p className="mt-1 text-xs text-muted">
            code <span className="font-semibold text-next">{live.code ?? "not issued yet"}</span>
          </p>
        </div>
        <ProspectForm disabledReason={s.state === "ACTIVE" ? undefined : "Prospects open once you're on the masthead"} />
      </div>
      <ActiveOnly s={s} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Card className="min-w-0 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Closed, all time</p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{money(total)}</span>
            <MiniChip kind="ver">RECORDED BY SPONSORX</MiniChip>
          </p>
        </Card>
        <Card className="min-w-0 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">With SponsorX</p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">{counts.states.SUBMITTED}</span>
            <span className="text-[11px] text-faint">prospects in the acceptance check</span>
          </p>
        </Card>
        <Card className="min-w-0 p-4 max-xl:col-span-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Next sales milestone</p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-next">+100</span>
            <span className="text-[11px] font-medium text-next">pts</span>
            <span className="text-[11px] text-faint">{money(m.toNextCents)} of closed sales away</span>
          </p>
          <div className="mt-2">
            <Meter value={m.pct} tone="next" />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="sx-animate min-w-0">
          <SectionHeading title={`Prospects · ${counts.all}`} hint="What you've handed SponsorX — they decide, you hear back" />
          {counts.all === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">No prospects yet — log the first business you talk to.</p>
          ) : (
            <div className="space-y-3">
              <ListFilter
                param="pstate"
                value={pstate}
                label="Filter prospects"
                allLabel={`All prospects · ${counts.all}`}
                options={PROSPECT_FILTERS.map((f) => ({
                  value: f.value,
                  label: `${f.label} · ${f.value === "open" ? counts.states.SUBMITTED + counts.states.ACCEPTED : counts.states.REJECTED}`,
                }))}
                tone="next"
              />
              {prospectPage.total === 0 ? (
                <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">None here — pick another filter.</p>
              ) : (
                <>
                  <PagerRow page={prospectPage} noun="Prospects" tone="next" position="top" filtered={Boolean(pstate)} />
                  <PendingList className="space-y-3">
                    {prospects.map((p) => (
                      <ProspectCard key={p.id} p={p} />
                    ))}
                  </PendingList>
                  <PagerRow page={prospectPage} noun="Prospects" tone="next" position="bottom" filtered={Boolean(pstate)} />
                </>
              )}
            </div>
          )}
        </section>

        <section className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading title={`Attribution ledger · ${ledgerPage.total}`} hint="Permanent — recorded at close, kept after graduation" />
          {sales.length > 0 && (
            <div className="mb-3">
              <PagerRow page={ledgerPage} noun="Sales" tone="next" position="top" keys={LEDGER_KEYS} />
            </div>
          )}
          <Card className="p-0">
            {sales.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">No closed sales yet — that&rsquo;s normal. Your first pitch is the hard one.</p>
            ) : (
              <PendingList>
                <ul className="divide-y divide-line-soft">
                  {sales.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">Sale credited to you</p>
                        <p className="mt-0.5 text-[11px] text-muted">closed {date(r.originatedAt)}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.value)}</span>
                    </li>
                  ))}
                </ul>
              </PendingList>
            )}
            <p className="border-t border-line-soft px-4 py-3 text-[11px] leading-relaxed text-faint">
              Rows here are written by SponsorX when a sponsor pays — never self-reported, never edited, never deleted.
              The business&rsquo;s name isn&rsquo;t shown: sponsor records aren&rsquo;t part of a student&rsquo;s access.
            </p>
          </Card>
          {sales.length > 0 && (
            <div className="mt-3">
              <PagerRow page={ledgerPage} noun="Sales" tone="next" position="bottom" keys={LEDGER_KEYS} />
            </div>
          )}
        </section>
      </div>
    </div>
    </ServerList>
  );
}

/* ---------------------------------------------------------------- code */
export function LiveStudentCode({ live, origin }: { live: Student; origin: string }) {
  const s = live.student;
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My code</h1>
        <p className="mt-1 text-xs text-muted">{s.displayName}</p>
      </div>
      {live.code ? (
        <div className="sx-animate">
          <StudentCodeCard code={live.code} link={`${origin}/s/${live.code}`} />
        </div>
      ) : (
        <EmptyState
          mark="chart"
          title="No code yet"
          hint={s.state === "ACTIVE" ? "SponsorX issues your code — ask your advisor if it's missing." : "Your code is issued once you're on the masthead."}
        />
      )}
      <Card className="border-next/25">
        <p className="text-sm font-medium">The promise behind the code</p>
        <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
          <li>· One code, yours for good. A business that uses it is credited to you when they pay.</li>
          <li>· Attribution is written once and never edited — your record stays yours after graduation.</li>
          <li>· If SponsorX can&rsquo;t accept a sale, you keep the credit for developing it.</li>
        </ul>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------- points */
export function LiveStudentPoints({ live }: { live: Student }) {
  const accruals = live.points?.accruals ?? [];
  const accrualPage = live.points?.page ?? NO_PAGE;
  const balance = live.points?.balance ?? 0;
  const m = salesMilestone(live.sales?.totalCents ?? 0);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Points</h1>
        <p className="mt-1 text-xs text-muted">Recognition for published work and closed sales — never pay</p>
      </div>
      {!live.points ? (
        <EmptyState mark="chart" title="Points aren't in your scope" hint="Ask your advisor." />
      ) : (
        <>
          <Card className="sx-animate relative overflow-hidden p-5 sm:p-6">
            <div aria-hidden="true" className="pointer-events-none absolute -right-14 -top-14 size-44 rounded-full bg-next opacity-[0.13] blur-[60px]" />
            <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-next/12 text-next">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden="true">
                    <path d={ICONS.trophy} />
                  </svg>
                </span>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-bold tabular-nums tracking-tight text-next">
                    <CountUp value={balance} />
                  </span>
                  <span className="text-sm font-medium text-next">pts</span>
                </p>
              </div>
              <div className="min-w-0 flex-1 basis-60">
                <div className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="text-muted">
                    Next sales milestone — <span className="font-semibold text-next">+100 pts</span> at your next $500 closed
                  </span>
                  <span className="tabular-nums text-muted">{m.pct}%</span>
                </div>
                <div className="mt-1.5">
                  <Meter value={m.pct} tone="next" />
                </div>
              </div>
            </div>
          </Card>
          <section className="sx-animate sx-delay-1 min-w-0">
            <SectionHeading title="How you earned them" hint="Every accrual, newest first — written once, never edited" />
            <ServerList>
              {accruals.length > 0 && (
                <div className="mb-3">
                  <PagerRow page={accrualPage} noun="Accruals" tone="next" position="top" />
                </div>
              )}
              <Card className="p-0">
                {accruals.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted">No points yet — your first approved piece or sales meeting starts the ledger.</p>
                ) : (
                  <PendingList>
                    <ul className="divide-y divide-line-soft">
                      {accruals.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                          <span className="shrink-0 rounded-lg bg-next/12 px-2 py-1 text-xs font-bold tabular-nums text-next">+{a.points}</span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-sm leading-snug">{POINT_REASON_COPY[a.reason] ?? a.reason}</span>
                            <span className="mt-0.5 block text-[10px] text-faint">{date(a.accruedAt)}</span>
                          </span>
                          <Badge tone="neutral">{a.reason.replace("_", " ").toLowerCase()}</Badge>
                        </li>
                      ))}
                    </ul>
                  </PendingList>
                )}
              </Card>
              {accruals.length > 0 && (
                <div className="mt-3">
                  <PagerRow page={accrualPage} noun="Accruals" tone="next" position="bottom" />
                </div>
              )}
            </ServerList>
          </section>
          <Card className="border-next/25">
            <p className="text-sm font-medium">What points are not</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Points are not dollars, wages, or a balance owed to you. They never convert on this page — whether the
              programme recognises them as scholarships or something else is a decision that has not been made.
            </p>
            <div className="mt-3">
              <Button full disabled title="Redemption is a separately gated decision (spec §5.5, open question §14) — nothing converts in Phase 1">
                Redeem points
              </Button>
            </div>
          </Card>
          <p className="flex items-center gap-1.5 text-[10px] text-faint">
            StudentPointAccrual — no cents, no link to Earning <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------- assignments */
export function LiveAssignmentsNotice() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Assignments</h1>
      <EmptyState
        mark="chart"
        title="Assignments aren't connected yet"
        hint="Editorial assignments need a workflow the backend doesn't have yet. Your sales, code and points are live."
        action={{ label: "My sales", href: "/next/sales" }}
      />
    </div>
  );
}
