import Link from "next/link";
import { cookies } from "next/headers";

import {
  ArenaChip,
  ArenaHead, ArenaUpdated,
  ArenaLane,
  ArenaLink,
  ArenaPanel,
  ArenaRow,
  ArenaSection,
  ArenaTile,
  type ArenaTone,
} from "@/components/arena-stage";
import { ArenaCount } from "@/components/arena-fx";
import { AthleteGamePlan, type GamePlanStep } from "@/components/athlete-game-plan";
import { EarningsBars, GLANCE_GLYPH, GlanceTile } from "@/components/athlete-glance";
import { CertifiedRecruitingCard } from "@/components/certified-recruiting-card";
import {
  DUE_STATES, buildHome, openOffers, payoutStatusTiles, shopTiles, upcomingSales, type ApiSellerSummary, type HomeTile,
} from "@/lib/athlete-home-live";
import {
  PLAN_CLEARED_COOKIE, agreementsStep, answerStep, deliverStep, moneyStep, payoutsStep, planHidden, planKey, profileStep,
} from "@/lib/athlete-game-plan";
import { EmptyState } from "@/components/states";
import { StripeLinkButton } from "@/components/payout-account-panel";
import { athleteBanner, type ApiMyPayouts, type ApiPayoutAccount } from "@/lib/payouts-live";
import type { ApiOffer } from "@/lib/offer-live";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import type { ApiEarning, ApiEarningsSummary } from "@/lib/earnings-live";
import type { ApiInvitation } from "@/lib/invitations-live";
import type { ApiMyProfile } from "@/lib/profile-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { athletePayoutLinkAction } from "./payout-actions";
import { ComingOfAgeReminder } from "@/components/coming-of-age-reminder";
import { comingOfAgeView, type ApiComingOfAge } from "@/lib/account-live";
import { outstanding, type ApiMyCollab, type ApiMyRules } from "@/lib/confirmations-live";
import { campaignAfterSponsor } from "@/lib/campaign-title";

import "./home.css";

/* --------------------------------------------------------------------------
   Athlete portal home — P3-FE-06, §9 screen 6. The signed-in athlete's own
   summary: status, profile completion, open invitations, deliverables due
   and earnings by status, each linking to its full page. It replaced a
   sample athlete behind a demo banner (found by the staging walkthrough).

   Live only. A guardian also opens this portal, and since 2S1-BE-11 acts
   for the minor they look after: the API reads the minor's own records for
   them (and they pick the minor when they look after several —
   GuardianControlNotice). A minor's own login is told their guardian does
   the agreements and money. The coming-of-age reminder (2S1-BE-12, GET
   /coming-of-age/mine) sits at the top for the whole 90 days. A non-OK read
   throws to the error page; it never falls back to sample figures.

   2S5-FE-03 (athlete part, design AthHome.dc.html): GET /payouts/account
   feeds a payout-account banner while the account isn't READY, with the
   Stripe CTA (POST /payouts/account/link {returnPath:"/athlete"} →
   redirect, athletePayoutLinkAction). A 403/404 there — a guardian login,
   which has no payee — skips the banner silently. The "under 18, a parent
   or guardian finishes this" line is left out: GET /athletes/me carries no
   birth date or age band to decide it from.

   2S2-FE-01 — the Phase 2 view (spec §6 P2-03): upcoming campaigns,
   approval requests, overdue deliverables, earnings to date, payout status
   and inventory performance in one view, for the signed-in athlete only
   (every read is the athlete's own scope — or their ward's, for a guardian
   acting for them). Added reads, each the only source of its figures:

     GET /offers                 offers waiting for an answer (count + 3)
     GET /deliverables?to=today  page.total — how many due ones are overdue
     GET /sales/summary          the shop (items, listings live / held for
                                 BTG, units sold, awaiting payment), orders
                                 waiting for the athlete's answer, and the
                                 next sales with dates ahead
     GET /payouts/me             available to pay out, and every payout by
                                 state (byState)

   A 403/404 on one of these — a login that has no offers, sells nothing or
   has no payee (a guardian's own) — leaves that block out; any other
   failure throws to the error page. Nothing is estimated.

   P8-FE-04 / P8-FE-07 — GET /me/rules-attestation and GET /me/collab-
   agreement feed the "something to confirm" banner (ConfirmationsBanner)
   beside the coming-of-age reminder. Either read failing leaves the banner
   out; neither fails the page.

   P1-ART-22 (2026-10-11) — redrawn on the Arena (components/arena-stage.tsx)
   as a dashboard, the admin desks' anatomy in the athlete's hand: a small
   title with the provenance pill and the athlete's status, four KPI plates
   (what needs their move; each opens its page), the notices, then "coming
   up" as four plates of rows, profile completion as a lane, and the shop,
   payouts and earnings as plate rows. Visual only — the reads above and
   their helpers are unchanged; every figure on a plate is still one of
   them.

   POL-FE-81 (2026-11-16) — the owner found that dashboard "so confusing for
   a human": eleven blocks and no first move. The top is now a step-by-step
   wizard, the game plan (components/athlete-game-plan.tsx, words and states
   in lib/athlete-game-plan.ts): the six steps from sign-up to paid —
   profile, agreements, payouts, answer, deliver, get paid — one at a time,
   opening on the first that needs the athlete, each with the one thing to
   do. What the "coming up" plates, the profile lane, the payout banner, the
   orders-waiting plate and the confirmations banner showed now lives in the
   step it belongs to. Below it, the numbers in the dashboard references'
   anatomy: KPI plates with ring gauges, the year's earnings as bars, the
   payouts, the shop. Same reads; nothing new is fetched or estimated.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function read<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

/** A read whose failure costs only its banner: anything but 200 → null. */
async function tolerant<T>(path: string): Promise<T | null> {
  try {
    const res = await apiFetch(path);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** A read this login may not have (403/404 → null); any other failure throws. */
async function optional<T>(res: Response | null, path: string): Promise<T | null> {
  if (!res || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

const TILE_TONE: Record<HomeTile["tone"], ArenaTone> = { neutral: "ink", primary: "blue", accent: "win", warn: "warn" };
const STATUS_TONE: Record<"accent" | "primary" | "warn" | "neutral", ArenaTone> = { accent: "win", primary: "blue", warn: "warn", neutral: "ink" };

/** A row of the home's helper tiles (the shop, the payouts), as arena plates. */
function Tiles({ tiles, label, from, cols = 4 }: { tiles: HomeTile[]; label: string; from: number; cols?: 2 | 4 }) {
  return (
    <dl aria-label={label} className={`grid grid-cols-2 gap-3 ${cols === 4 ? "lg:grid-cols-4" : ""}`}>
      {tiles.map((t, i) => (
        <ArenaTile key={t.key} label={t.label} value={t.n} format={t.format} caption={t.sub} tone={TILE_TONE[t.tone]} href={t.href} delay={from + i * 0.06} />
      ))}
    </dl>
  );
}

function DayMark({ mon, day, hot = false }: { mon: string; day: string; hot?: boolean }) {
  return (
    <span className={`grid w-11 shrink-0 rounded-xl border py-1 text-center ${hot ? "border-warn/40 bg-warn/10" : "border-athlete/25 bg-athlete/10"}`}>
      <span className={`text-[9px] font-semibold tracking-[0.18em] ${hot ? "text-warn" : "text-athlete"}`}>{mon}</span>
      <span className="sx-arena-num text-lg leading-none text-text">{day}</span>
    </span>
  );
}

export default async function AthleteHomePage() {
  const actor = await requirePortalAccess("athlete");
  /* 2S1-BE-11 — a guardian acting for their minor reads the minor's own
     records, exactly as the minor's login would. */
  const isAthlete = actor.roles.includes("ATHLETE") || Boolean(actor.actingFor);

  /* SERVER-PAGED (P2-FE-02): the home shows three of each, so it asks for
     three — the soonest-expiring open invites and the soonest-due
     deliverables — with the true counts from the inbox summary and
     `page.total`, and the money from the earnings summary. Nothing here
     reads a whole list. */
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [me, inv, inbox, del, overdue, earnSummary, acctRes, ageRes, offersRes, shopRes, moneyRes, rules, collab] = await Promise.all([
    isAthlete ? apiFetch("/athletes/me") : Promise.resolve(null),
    read<{ invitations: ApiInvitation[] }>("/invitations?page=1&size=3&state=open&sort=expiry"),
    read<{ summary: { open: number } }>("/invitations/summary"),
    read<{ deliverables: ApiDeliverable[]; page: { total: number } }>(`/deliverables?page=1&size=3&state=${DUE_STATES.join(",")}&sort=due`),
    /* 2S2-FE-01 — still due, and due before today: page.total is the overdue count. */
    read<{ page: { total: number } }>(`/deliverables?page=1&size=1&state=${DUE_STATES.join(",")}&to=${today}`),
    read<ApiEarningsSummary>(`/earnings/summary?year=${now.getUTCFullYear()}`),
    isAthlete ? apiFetch("/payouts/account") : Promise.resolve(null),
    /* 2S1-BE-12 — the coming-of-age reminder stays here for the whole 90 days. */
    isAthlete ? apiFetch("/coming-of-age/mine") : Promise.resolve(null),
    /* 2S2-FE-01 — offers, the shop and the payouts. */
    isAthlete ? apiFetch("/offers") : Promise.resolve(null),
    isAthlete ? apiFetch("/sales/summary") : Promise.resolve(null),
    isAthlete ? apiFetch("/payouts/me") : Promise.resolve(null),
    /* P8-FE-04 / P8-FE-07 — the two confirmations before a new deal. */
    isAthlete ? tolerant<ApiMyRules>("/me/rules-attestation") : Promise.resolve(null),
    isAthlete ? tolerant<ApiMyCollab>("/me/collab-agreement") : Promise.resolve(null),
  ]);
  const coming = ageRes?.ok ? ((await ageRes.json()) as { comingOfAge: ApiComingOfAge | null }).comingOfAge : null;
  const ageView = coming ? comingOfAgeView(coming, coming.seat ?? "athlete") : null;
  /* F-3: an ATHLETE role with no athlete record behind it is a provisioning
     gap BTG fixes, not an outage — say so instead of the error page. */
  if (me && (me.status === 403 || me.status === 404)) {
    return (
      <div className="space-y-6">
        <ArenaHead title="Dashboard" />
        <EmptyState
          mark="users"
          title="Your account isn't linked to an athlete profile yet"
          hint="You're signed in, but BTG hasn't connected this login to your athlete record. Ask your BTG contact to link it — nothing is lost in the meantime."
          action={{ label: "How athletes join", href: "/join" }}
        />
      </div>
    );
  }
  if (me && !me.ok) throw new Error(`/athletes/me unavailable (${me.status}).`);
  const profile = me ? ((await me.json()) as ApiMyProfile) : null;
  /* No payee behind this login (403/404) → no banner, silently. */
  if (acctRes && !acctRes.ok && acctRes.status !== 403 && acctRes.status !== 404) {
    throw new Error(`/payouts/account unavailable (${acctRes.status}).`);
  }
  /* POL-FE-26 — the minor's own login (guardianControl) is told their guardian sets this up; no button. */
  const payout = acctRes?.ok ? athleteBanner((await acctRes.json()) as ApiPayoutAccount, { minor: Boolean(actor.guardianControl) && !actor.actingFor }) : null;
  const h = buildHome({
    profile,
    invitations: inv.invitations,
    deliverables: del.deliverables,
    earnings: [] as ApiEarning[],
    now,
    counts: { invites: inbox.summary.open, due: del.page.total },
    earningsSummary: earnSummary,
  });
  const [offerList, shop, money] = await Promise.all([
    optional<{ offers: ApiOffer[] }>(offersRes, "/offers"),
    optional<ApiSellerSummary>(shopRes, "/sales/summary"),
    optional<ApiMyPayouts>(moneyRes, "/payouts/me"),
  ]);
  const offers = offerList ? openOffers(offerList.offers, now) : null;
  const sales = shop ? upcomingSales(shop) : [];
  const overdueCount = overdue.page.total;
  const waiting = shop?.approvalsWaiting ?? 0;
  const paid = h.earnings.find((e) => e.label === "Paid");
  const eligible = h.earnings.find((e) => e.label === "Eligible");
  const approved = h.earnings.find((e) => e.label === "Approved");
  const owedCents = (eligible?.cents ?? 0) + (approved?.cents ?? 0);
  const year = now.getUTCFullYear();
  const paidCents = paid?.cents ?? 0;
  const confirmItems = outstanding(rules, collab);
  const viewerIsGuardian = Boolean(actor.actingFor);

  /* ------------------------------------------------ the game plan's steps */
  const steps: GamePlanStep[] = [];

  if (h.profile) {
    steps.push({
      ...profileStep(h.profile),
      body: (
        <div className="sx-gp-card">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <ArenaCount value={h.profile.percent} format="pct" delay={0.3} className={`sx-arena-num block text-[40px] leading-none ${h.profile.percent === 100 ? "text-success" : "text-athlete"}`} />
            <span className="text-[12px] text-muted">{h.profile.done} of {h.profile.total} sections done</span>
          </div>
          <div role="progressbar" aria-label="Profile completion" aria-valuenow={h.profile.percent} aria-valuemin={0} aria-valuemax={100} className="mt-3">
            <ArenaLane value={h.profile.percent / 100} tone={h.profile.percent === 100 ? "win" : "blue"} delay={0.4} />
          </div>
          {h.profile.missing.length > 0 && (
            <>
              <p className="sx-gp-label mt-4">Still to add</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {h.profile.missing.map((m) => (
                  <li key={m}><ArenaChip tone="ink">{m}</ArenaChip></li>
                ))}
              </ul>
            </>
          )}
          {h.status?.line && <p className="mt-4 text-[12px] leading-relaxed text-muted">{h.status.line}</p>}
        </div>
      ),
    });
  }

  if (rules || collab) {
    const row = (name: string, s: { current: boolean; required: boolean; byGuardian: boolean } | null) =>
      s && (
        <li className="sx-gp-item">
          <span className="sx-gp-item-mark" data-on={s.current ? "" : undefined} aria-hidden="true">{s.current ? "✓" : "!"}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-text">{name}</span>
            <span className="block text-[11px] text-muted">
              {s.current ? "Confirmed — nothing to do" : s.byGuardian && !viewerIsGuardian ? "Your guardian confirms this" : s.required ? "Needed before your next deal" : "Asked, not yet needed"}
            </span>
          </span>
          <ArenaChip tone={s.current ? "win" : s.byGuardian && !viewerIsGuardian ? "blue" : "warn"}>{s.current ? "Done" : s.byGuardian && !viewerIsGuardian ? "Guardian" : "To do"}</ArenaChip>
        </li>
      );
    steps.push({
      ...agreementsStep(confirmItems, viewerIsGuardian),
      body: (
        <ul className="sx-gp-list">
          {row(viewerIsGuardian ? "The athlete's own rules" : "Your own rules", rules)}
          {row("Content Collaboration Agreement", collab)}
        </ul>
      ),
    });
  }

  if (payout) {
    steps.push({
      ...payoutsStep(
        payout.show
          ? { show: true, guardianOnly: payout.guardianOnly, needsInfo: payout.title.startsWith("Stripe needs"), body: payout.body }
          : { show: false, readyLine: payout.readyLine },
      ),
      body: payout.show ? (
        <div className="sx-gp-card">
          <p className="text-sm font-semibold text-text">{payout.title}</p>
          {payout.minorLine && <p className="mt-1 text-xs leading-relaxed text-muted">{payout.minorLine}</p>}
          <ol className="sx-gp-howto mt-3">
            <li>Press the button — Stripe opens in this tab.</li>
            <li>Add your details and a bank account. Stripe keeps them, not SponsorX.</li>
            <li>You come back here, and this step turns green.</li>
          </ol>
          {!payout.guardianOnly && (
            <div className="mt-4">
              <StripeLinkButton cta={payout.cta} action={athletePayoutLinkAction} testBadge={payout.testBadge} />
            </div>
          )}
        </div>
      ) : (
        <p className="sx-gp-card text-[13px] text-muted">{payout.readyLine}</p>
      ),
    });
  }

  steps.push({
    ...answerStep({ invites: h.inviteCount, offers: offers ? offers.count : null, orders: shop ? waiting : null }),
    body:
      h.inviteCount + (offers?.count ?? 0) + waiting === 0 ? (
        <p className="sx-gp-card text-[13px] text-muted">Nothing to answer. A complete profile gets matched sooner — when a sponsor wants you, it lands here first.</p>
      ) : (
        <div className="space-y-4">
          {waiting > 0 && (
            <Link href="/athlete/sales" className="sx-gp-alert group">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text">
                  {waiting === 1 ? "1 order is waiting for your answer" : `${waiting} orders are waiting for your answer`}
                </span>
                <span className="mt-0.5 block text-xs text-muted">A sponsor ordered something you asked to approve first. Accept or decline within 48 hours, or it&rsquo;s cancelled.</span>
              </span>
              <span aria-hidden="true" className="text-athlete transition-transform duration-300 group-hover:translate-x-1">→</span>
            </Link>
          )}
          {offers && offers.count > 0 && (
            <Group title={`Offers waiting for your answer · ${offers.count}`} href="/athlete/offers" more="All offers">
              {offers.rows.map((o, i) => (
                <ArenaRow
                  key={o.id}
                  i={i}
                  href={`/athlete/offers/${encodeURIComponent(o.id)}`}
                  lead={o.mono}
                  title={o.sponsor}
                  sub={campaignAfterSponsor(o.campaign, o.sponsor)}
                  right={<><span className="sx-arena-num block text-sm text-text">{o.pay}</span><span className="block text-[11px] text-muted">{o.when}</span></>}
                />
              ))}
            </Group>
          )}
          {h.inviteCount > 0 && (
            <Group title={`Open invitations · ${h.inviteCount}`} href="/athlete/invitations" more="All invitations">
              {h.invites.map((inv, i) => (
                <ArenaRow
                  key={inv.id}
                  i={i}
                  href="/athlete/invitations"
                  lead={inv.mono}
                  title={inv.sponsor}
                  sub={campaignAfterSponsor(inv.campaign, inv.sponsor)}
                  right={<><span className="sx-arena-num block text-sm text-text">{inv.offer}</span><span className={`block text-[11px] ${inv.urgent ? "text-warn" : "text-muted"}`}>{inv.expires}</span></>}
                />
              ))}
            </Group>
          )}
        </div>
      ),
  });

  steps.push({
    ...deliverStep({ due: h.dueCount, overdue: overdueCount, upcomingSales: shop ? shop.upcoming.total : null }),
    body: (
      <div className="space-y-4">
        <Group title={`Deliverables due · ${h.dueCount}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`} href="/athlete/deliverables" more="All deliverables">
          {h.dueCount === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted">Nothing due. Deliverables show up here after you accept an invitation.</p>
          ) : (
            h.deliverables.map((x, i) => (
              <ArenaRow
                key={x.id}
                i={i}
                href={`/athlete/deliverables/${encodeURIComponent(x.id)}`}
                lead={<DayMark mon={x.mon} day={x.day} hot={x.overdue} />}
                title={x.title}
                sub={<span className={x.overdue ? "text-warn" : undefined}>{x.campaign} · {x.due}</span>}
                right={<ArenaChip tone={x.review === "Not started" ? "ink" : "blue"}>{x.review}</ArenaChip>}
              />
            ))
          )}
        </Group>
        {shop && shop.upcoming.total > 0 && (
          <Group title={`Marketplace sales coming up · ${shop.upcoming.total}`} href="/athlete/sales" more="All sales">
            {sales.map((x, i) => (
              <ArenaRow
                key={x.id}
                i={i}
                href={`/athlete/sales/${encodeURIComponent(x.id)}`}
                lead={<DayMark mon={x.mon} day={x.day} />}
                title={x.title}
                sub={`${x.sponsor} · ${x.when} · ${x.quantity}`}
                right={<ArenaChip tone={x.badge === "To deliver" ? "blue" : "ink"}>{x.badge}</ArenaChip>}
              />
            ))}
          </Group>
        )}
      </div>
    ),
  });

  steps.push({
    ...moneyStep({ paidCents, owedCents, year, availableCents: money ? money.totals.requestableCents : null, canRequest: Boolean(money?.canRequest) }),
    body: (
      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <Figure label={`Paid in ${year}`} cents={paidCents} note="from your Campaign Orders" tone="win" />
        <Figure label="On the way" cents={owedCents} note={`${eligible?.amount ?? "$0"} eligible · ${approved?.amount ?? "$0"} approved`} tone="blue" />
        {money ? (
          <Figure label="Ready to request" cents={money.totals.requestableCents} note={money.canRequest ? "marketplace money, yours to ask for" : "nothing to request yet"} tone="flare" />
        ) : (
          <Figure label="Still in progress" cents={h.earnings.find((e) => e.label === "Pending")?.cents ?? 0} note="work not yet verified" tone="ink" />
        )}
      </dl>
    ),
  });

  const clearKey = planKey(profile?.id);
  const hidePlan = planHidden(steps.map((s) => s.state), (await cookies()).get(PLAN_CLEARED_COOKIE)?.value, clearKey);

  return (
    <div className="sx-home space-y-8">
      <ArenaHead
        title="Dashboard"
        pill={<ArenaUpdated />}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <span>{h.firstName ? `Hi, ${h.firstName}` : "Hi there"}{h.subtitle ? ` · ${h.subtitle}` : ""}</span>
            {h.status && <ArenaChip tone={STATUS_TONE[h.status.tone]}>{h.status.label}</ArenaChip>}
          </span>
        }
      />

      {ageView && coming && <ComingOfAgeReminder view={ageView} seat={coming.seat ?? "athlete"} uploadPath={coming.uploadPath ?? null} />}
      {/* POL-FE-68 — the guardian notice is in the layout, on every page. */}

      {/* ------------------------------------------- 1 · what to do next */}
      {/* Owner, 2026-11-16: once everything is squared away and this browser
          has seen it celebrate, the plan is left out until a step needs the
          athlete again (lib/athlete-game-plan.ts). */}
      {!hidePlan && <AthleteGamePlan steps={steps} name={h.firstName || null} clearKey={clearKey} />}

      {/* ------------------------------------------- 2 · the numbers */}
      <section aria-label="At a glance">
        <ArenaSection title="At a glance" hint="Tap a card to open its page." delay={0.3} />
        <dl className={`grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 ${offers ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
          <GlanceTile
            id="invites"
            label="Invitations open"
            value={h.inviteCount}
            caption={h.inviteCount ? "waiting for your answer · soonest first" : "sent once your profile is live"}
            tone={h.inviteCount ? "flare" : "ink"}
            glyph={GLANCE_GLYPH.inbox}
            href="/athlete/invitations"
            delay={0.34}
          />
          {offers && (
            <GlanceTile
              id="offers"
              label="Offers waiting"
              value={offers.count}
              caption={offers.count ? "full terms to accept or decline" : "nothing waiting for you"}
              tone={offers.count ? "flare" : "ink"}
              glyph={GLANCE_GLYPH.mail}
              href="/athlete/offers"
              delay={0.38}
            />
          )}
          <GlanceTile
            id="due"
            label="Deliverables due"
            value={h.dueCount}
            caption={overdueCount ? `${overdueCount} overdue · shown first` : h.dueCount ? "all on schedule" : "nothing due"}
            tone={overdueCount ? "warn" : h.dueCount ? "blue" : "ink"}
            share={h.dueCount ? { value: (h.dueCount - overdueCount) / h.dueCount, short: "on time", label: `${h.dueCount - overdueCount} of ${h.dueCount} on time` } : undefined}
            glyph={GLANCE_GLYPH.calendar}
            href="/athlete/deliverables"
            delay={0.42}
          />
          <GlanceTile
            id="paid"
            label={`Paid in ${year}`}
            value={paidCents}
            format="usd"
            caption={owedCents > 0 ? `${eligible?.amount ?? "$0"} eligible · ${approved?.amount ?? "$0"} approved` : h.hasEarnings ? "nothing waiting to be paid" : "earnings start with your first Campaign Order"}
            tone={paidCents ? "win" : "ink"}
            share={paidCents + owedCents > 0 ? { value: paidCents / (paidCents + owedCents), short: "paid", label: `${Math.round((paidCents / (paidCents + owedCents)) * 100)}% of what you've earned is paid` } : undefined}
            glyph={GLANCE_GLYPH.wallet}
            href="/athlete/earnings"
            delay={0.46}
          />
        </dl>
      </section>

      {/* ------------------------------------------- 3 · money */}
      <div className={`grid gap-6 ${money ? "xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" : ""} [&>section]:min-w-0`}>
        <section>
          <ArenaSection
            title="Earnings"
            hint={h.hasEarnings ? `By status, from your Campaign Orders, ${year}.` : "Earnings appear once you accept a Campaign Order."}
            action={<ArenaLink href="/athlete/earnings">Earnings</ArenaLink>}
            delay={0.5}
          />
          <ArenaPanel delay={0.54} spot>
            <EarningsBars bars={h.earnings.map((e) => ({ label: e.label, cents: e.cents, hint: e.hint }))} year={year} delay={0.6} />
          </ArenaPanel>
        </section>

        {money && (
          <section>
            <ArenaSection title="Payouts" hint="Your marketplace money, from the ledger." action={<ArenaLink href="/athlete/money">Payouts</ArenaLink>} delay={0.56} />
            <Tiles tiles={payoutStatusTiles(money)} label="Payouts" from={0.6} cols={2} />
          </section>
        )}
      </div>

      {shop && (
        <section>
          <ArenaSection
            title="Your shop"
            hint="What you sell on the marketplace, counted from your own items, listings and orders."
            action={<ArenaLink href="/athlete/listings">Listings</ArenaLink>}
            delay={0.7}
          />
          <Tiles tiles={shopTiles(shop)} label="Your shop" from={0.74} />
        </section>
      )}

      {/* 5S1-FE-01 — the Certified Recruiting partner card, below the dashboard's own sections. Fixed content, no read. */}
      <CertifiedRecruitingCard variant="arena" />
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

/** A titled list inside a game-plan step: the heading, the rows, the way to all of them. */
function Group({ title, href, more, children }: { title: string; href: string; more: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="sx-gp-label">{title}</p>
        <ArenaLink href={href}>{more}</ArenaLink>
      </div>
      <div className="sx-gp-list">{children}</div>
    </div>
  );
}

/** One money figure in the Get paid step. */
function Figure({ label, cents, note, tone }: { label: string; cents: number; note: string; tone: "win" | "blue" | "flare" | "ink" }) {
  const text = { win: "text-success", blue: "text-athlete", flare: "text-accent", ink: "text-text" }[tone];
  return (
    <div className="sx-gp-card !p-4">
      <dt className="sx-gp-label">{label}</dt>
      <dd className="mt-1.5">
        <ArenaCount value={cents} format="usd" delay={0.3} className={`sx-arena-num block text-[26px] leading-none ${text}`} />
        <span className="mt-1 block text-[11px] text-faint">{note}</span>
      </dd>
    </div>
  );
}
