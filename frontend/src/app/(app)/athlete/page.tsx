import Link from "next/link";

import {
  ArenaChip,
  ArenaHead, ArenaUpdated,
  ArenaLane,
  ArenaLink,
  ArenaPanel,
  ArenaRow,
  ArenaSection,
  ArenaTile,
  ArenaTiles,
  type ArenaTone,
} from "@/components/arena-stage";
import { ArenaCount } from "@/components/arena-fx";
import {
  DUE_STATES, buildHome, openOffers, payoutStatusTiles, shopTiles, upcomingSales, type ApiSellerSummary, type HomeTile,
} from "@/lib/athlete-home-live";
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
import { ConfirmationsBanner } from "@/components/confirmations-banner";
import { GuardianControlNotice } from "@/components/guardian-control-notice";
import { comingOfAgeView, type ApiComingOfAge } from "@/lib/account-live";
import type { ApiMyCollab, ApiMyRules } from "@/lib/confirmations-live";
import { campaignAfterSponsor } from "@/lib/campaign-title";

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
function Tiles({ tiles, label, from }: { tiles: HomeTile[]; label: string; from: number }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <ArenaTile key={t.key} label={t.label} value={t.n} format={t.format} caption={t.sub} tone={TILE_TONE[t.tone]} href={t.href} delay={from + i * 0.06} />
      ))}
    </dl>
  );
}

function Mono({ text, tone = "blue" }: { text: string; tone?: "blue" | "flare" }) {
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-xl border text-[12px] font-bold ${tone === "flare" ? "border-accent/30 bg-accent/10 text-accent" : "border-athlete/25 bg-athlete/10 text-athlete"}`}>
      {text}
    </span>
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

/** One "coming up" plate: an eyebrow with the count, the rows or a quiet line. */
function UpPanel({
  title, count, extra, href, hrefLabel, empty, children, delay,
}: {
  title: string;
  count: number;
  /** A note after the count ("2 overdue"). */
  extra?: string;
  href: string;
  hrefLabel: string;
  empty: { title: string; hint: string };
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <section>
      <ArenaSection title={`${title} · ${count}${extra ? ` · ${extra}` : ""}`} action={<ArenaLink href={href}>{hrefLabel}</ArenaLink>} delay={delay} />
      {count === 0 ? (
        <ArenaPanel delay={delay + 0.05}>
          <p className="text-sm font-semibold">{empty.title}</p>
          <p className="mt-1 text-xs text-muted">{empty.hint}</p>
        </ArenaPanel>
      ) : (
        <ArenaPanel flush delay={delay + 0.05} className="pl-2">
          {children}
        </ArenaPanel>
      )}
    </section>
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

  return (
    <div className="space-y-8">
      <ArenaHead
        title="Dashboard"
        pill={<ArenaUpdated />}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <span>{h.firstName ? `Hi, ${h.firstName}` : "Hi there"}{h.subtitle ? ` · ${h.subtitle}` : ""}</span>
            {h.status && <ArenaChip tone={STATUS_TONE[h.status.tone]}>{h.status.label}</ArenaChip>}
          </span>
        }
      >
        {/* The KPI row: what needs the athlete's move, each plate the door to its page. */}
        <ArenaTiles>
          <ArenaTile
            label="Invitations open"
            value={h.inviteCount}
            caption={h.inviteCount ? "waiting for your answer · soonest expiry first" : "BTG invites you once your profile is live"}
            tone={h.inviteCount ? "flare" : "ink"}
            href="/athlete/invitations"
            delay={0.1}
          />
          {offers && (
            <ArenaTile
              label="Offers waiting"
              value={offers.count}
              caption={offers.count ? "full terms to accept or decline" : "nothing waiting for you"}
              tone={offers.count ? "flare" : "ink"}
              href="/athlete/offers"
              delay={0.16}
            />
          )}
          <ArenaTile
            label="Deliverables due"
            value={h.dueCount}
            caption={overdueCount ? `${overdueCount} overdue · shown first` : h.dueCount ? "on schedule" : "nothing due"}
            tone={overdueCount ? "warn" : h.dueCount ? "blue" : "ink"}
            share={h.dueCount ? overdueCount / h.dueCount : undefined}
            href="/athlete/deliverables"
            delay={0.22}
          />
          <ArenaTile
            label={`Paid in ${now.getUTCFullYear()}`}
            value={paid?.cents ?? 0}
            format="usd"
            caption={owedCents > 0 ? `${eligible?.amount ?? "$0"} eligible · ${approved?.amount ?? "$0"} approved` : h.hasEarnings ? "nothing waiting to be paid" : "earnings start with your first Campaign Order"}
            tone={paid?.cents ? "win" : "ink"}
            href="/athlete/earnings"
            delay={0.28}
          />
        </ArenaTiles>
      </ArenaHead>

      {ageView && coming && <ComingOfAgeReminder view={ageView} seat={coming.seat ?? "athlete"} uploadPath={coming.uploadPath ?? null} />}
      <ConfirmationsBanner rules={rules} collab={collab} viewerIsGuardian={Boolean(actor.actingFor)} />
      <GuardianControlNotice actor={actor} />

      {(payout?.show || waiting > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {payout?.show && (
            <ArenaPanel tone="flare" delay={0.32} spot>
              <section aria-label="Payout account" className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 max-w-xl">
                  <p className="text-sm font-semibold">{payout.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{payout.body}</p>
                  {payout.minorLine && <p className="mt-1 text-xs leading-relaxed text-muted">{payout.minorLine}</p>}
                </div>
                {!payout.guardianOnly && <StripeLinkButton cta={payout.cta} action={athletePayoutLinkAction} testBadge={payout.testBadge} />}
              </section>
            </ArenaPanel>
          )}
          {waiting > 0 && (
            <Link href="/athlete/sales" data-spot="" className="sx-arena-plate sx-arena-in group relative block px-5 pb-5 pt-4 pl-7" style={{ "--tone": "var(--sx-warn)", "--sx-reveal-delay": "0.36s" } as React.CSSProperties}>
              <span aria-hidden="true" className="sx-arena-shine" />
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {waiting === 1 ? "1 order is waiting for your answer" : `${waiting} orders are waiting for your answer`}
                  </span>
                  <span className="mt-1 block text-xs text-muted">A sponsor ordered something you asked to approve first. Accept or decline within 48 hours, or the order is cancelled.</span>
                </span>
                <span className="text-xs font-semibold text-athlete transition-transform duration-300 group-hover:translate-x-1">Answer →</span>
              </span>
            </Link>
          )}
        </div>
      )}
      {payout && !payout.show && <p className="-mt-4 text-[11px] text-muted">{payout.readyLine}</p>}

      {/* ----------------------------------------------------- coming up */}
      {/* min-w-0 on the cells: a section's header row (title + link) would
          otherwise set the phone column's min-content past the viewport */}
      <div className="grid gap-6 lg:grid-cols-2 [&>section]:min-w-0">
        {offers && (
          <UpPanel
            title="Offers waiting for your answer"
            count={offers.count}
            href="/athlete/offers"
            hrefLabel="All offers"
            empty={{ title: "No offers waiting", hint: "BTG sends a formal offer with the full terms when a sponsor wants you for a campaign." }}
            delay={0.4}
          >
            {offers.rows.map((o, i) => (
              <ArenaRow
                key={o.id}
                i={i}
                href={`/athlete/offers/${encodeURIComponent(o.id)}`}
                lead={<Mono text={o.mono} />}
                title={o.sponsor}
                sub={campaignAfterSponsor(o.campaign, o.sponsor)}
                right={
                  <>
                    <span className="sx-arena-num block text-sm text-text">{o.pay}</span>
                    <span className="block text-[11px] text-muted">{o.when}</span>
                  </>
                }
              />
            ))}
          </UpPanel>
        )}

        <UpPanel
          title="Open invitations"
          count={h.inviteCount}
          href="/athlete/invitations"
          hrefLabel="All invitations"
          empty={{ title: "No invitations yet", hint: "BTG invites you to campaigns once your profile is live. A complete profile gets matched sooner." }}
          delay={0.44}
        >
          {h.invites.map((inv, i) => (
            <ArenaRow
              key={inv.id}
              i={i}
              href="/athlete/invitations"
              lead={<Mono text={inv.mono} tone="flare" />}
              title={inv.sponsor}
              sub={campaignAfterSponsor(inv.campaign, inv.sponsor)}
              right={
                <>
                  <span className="sx-arena-num block text-sm text-text">{inv.offer}</span>
                  <span className={`block text-[11px] ${inv.urgent ? "text-warn" : "text-muted"}`}>{inv.expires}</span>
                </>
              }
            />
          ))}
        </UpPanel>

        <UpPanel
          title="Deliverables due"
          count={h.dueCount}
          extra={overdueCount > 0 ? `${overdueCount} overdue` : undefined}
          href="/athlete/deliverables"
          hrefLabel="All deliverables"
          empty={{ title: "Nothing due", hint: "Deliverables show up here after you accept an invitation." }}
          delay={0.48}
        >
          {h.deliverables.map((d, i) => (
            <ArenaRow
              key={d.id}
              i={i}
              href={`/athlete/deliverables/${encodeURIComponent(d.id)}`}
              lead={<DayMark mon={d.mon} day={d.day} hot={d.overdue} />}
              title={d.title}
              sub={<span className={d.overdue ? "text-warn" : undefined}>{d.campaign} · {d.due}</span>}
              right={<ArenaChip tone={d.review === "Not started" ? "ink" : "blue"}>{d.review}</ArenaChip>}
            />
          ))}
        </UpPanel>

        {shop && (
          <UpPanel
            title="Marketplace sales coming up"
            count={shop.upcoming.total}
            href="/athlete/sales"
            hrefLabel="All orders"
            empty={{ title: "No sales coming up", hint: "When a sponsor buys one of your listings, its dates show here until you've delivered it." }}
            delay={0.52}
          >
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
          </UpPanel>
        )}
      </div>

      {/* ------------------------------------------- profile + earnings */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] [&>section]:min-w-0">
        {h.profile && (
          <section>
            <ArenaSection title="Profile" action={<ArenaLink href="/athlete/profile/edit">Finish profile</ArenaLink>} delay={0.56} />
            <ArenaPanel delay={0.6} spot>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Completion</p>
              <ArenaCount value={h.profile.percent} format="pct" delay={0.6} className={`sx-arena-num mt-1.5 block text-[34px] leading-none ${h.profile.percent === 100 ? "text-success" : "text-athlete"}`} />
              <div
                role="progressbar"
                aria-label="Profile completion"
                aria-valuenow={h.profile.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                className="mt-3"
              >
                <ArenaLane value={h.profile.percent / 100} tone={h.profile.percent === 100 ? "win" : "blue"} delay={0.8} />
              </div>
              <p className="mt-2.5 text-[11px] text-muted">
                {h.profile.done} of {h.profile.total} sections done
              </p>
              {h.profile.missing.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {h.profile.missing.map((m) => (
                    <li key={m}>
                      <ArenaChip tone="ink">{m}</ArenaChip>
                    </li>
                  ))}
                </ul>
              )}
            </ArenaPanel>
          </section>
        )}

        <section>
          <ArenaSection
            title="Earnings"
            hint={h.hasEarnings ? "By status, from your Campaign Orders." : "Earnings appear once you accept a Campaign Order."}
            action={<ArenaLink href="/athlete/earnings">Earnings</ArenaLink>}
            delay={0.58}
          />
          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {h.earnings.map((e, i) => (
              <ArenaTile
                key={e.label}
                label={e.label}
                value={e.cents}
                format="usd"
                caption={e.hint}
                tone={e.tone === "accent" ? "win" : e.tone === "primary" ? "blue" : "ink"}
                href="/athlete/earnings"
                delay={0.62 + i * 0.06}
              />
            ))}
          </dl>
        </section>
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

      {money && (
        <section>
          <ArenaSection
            title="Payouts"
            hint="Your marketplace money, from the ledger."
            action={<ArenaLink href="/athlete/money">Payouts</ArenaLink>}
            delay={0.8}
          />
          <Tiles tiles={payoutStatusTiles(money)} label="Payouts" from={0.84} />
        </section>
      )}
    </div>
  );
}
