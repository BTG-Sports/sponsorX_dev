import Link from "next/link";

import { Badge, Card, SectionHeading } from "@/components/ui";
import { Monogram } from "@/components/hero";
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
import { GuardianControlNotice } from "@/components/guardian-control-notice";
import { comingOfAgeView, type ApiComingOfAge } from "@/lib/account-live";

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
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

async function read<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

/** A read this login may not have (403/404 → null); any other failure throws. */
async function optional<T>(res: Response | null, path: string): Promise<T | null> {
  if (!res || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

const TILE_TONE: Record<HomeTile["tone"], string> = { neutral: "", primary: "text-primary", accent: "text-accent", warn: "text-warn" };

function Tiles({ tiles, label }: { tiles: HomeTile[]; label: string }) {
  return (
    <ul aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <li key={t.key}>
          <Link href={t.href} className="block h-full rounded-xl border border-line bg-surface p-4 hover:border-primary/40">
            <p className="text-[11px] font-medium text-muted">{t.label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${TILE_TONE[t.tone]}`}>{t.value}</p>
            <p className="mt-0.5 text-[11px] text-faint">{t.sub}</p>
          </Link>
        </li>
      ))}
    </ul>
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
  const [me, inv, inbox, del, overdue, earnSummary, acctRes, ageRes, offersRes, shopRes, moneyRes] = await Promise.all([
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
  ]);
  const coming = ageRes?.ok ? ((await ageRes.json()) as { comingOfAge: ApiComingOfAge | null }).comingOfAge : null;
  const ageView = coming ? comingOfAgeView(coming, coming.seat ?? "athlete") : null;
  /* F-3: an ATHLETE role with no athlete record behind it is a provisioning
     gap BTG fixes, not an outage — say so instead of the error page. */
  if (me && (me.status === 403 || me.status === 404)) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">Your dashboard</h1>
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
  const payout = acctRes?.ok ? athleteBanner((await acctRes.json()) as ApiPayoutAccount) : null;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-faint">Your dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{h.firstName ? `Hi, ${h.firstName}` : "Hi there"}</h1>
          {h.subtitle && <p className="mt-1 text-xs text-muted">{h.subtitle}</p>}

        </div>
        {h.status && (
          <div className="max-w-xs text-right">
            <Badge tone={h.status.tone}>{h.status.label}</Badge>
            {h.status.line && <p className="mt-1 text-[11px] text-muted">{h.status.line}</p>}
          </div>
        )}
      </div>

      {ageView && coming && <ComingOfAgeReminder view={ageView} seat={coming.seat ?? "athlete"} uploadPath={coming.uploadPath ?? null} />}
      <GuardianControlNotice actor={actor} />

      {payout?.show && (
        <section
          aria-label="Payout account"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/40 bg-primary/5 px-5 py-4"
        >
          <div className="min-w-0 max-w-xl">
            <p className="text-sm font-semibold">{payout.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{payout.body}</p>
            {payout.minorLine && <p className="mt-1 text-xs leading-relaxed text-muted">{payout.minorLine}</p>}
          </div>
          <StripeLinkButton cta={payout.cta} action={athletePayoutLinkAction} testBadge={payout.testBadge} />
        </section>
      )}
      {payout && !payout.show && <p className="text-[11px] text-muted">{payout.readyLine}</p>}

      {h.profile && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted">Profile completion</p>
              <p className="text-2xl font-semibold tabular-nums">{h.profile.percent}%</p>
            </div>
            <Link href="/athlete/profile/edit" className="text-xs font-semibold text-primary hover:underline">
              Finish profile →
            </Link>
          </div>
          <div
            role="progressbar"
            aria-label="Profile completion"
            aria-valuenow={h.profile.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2"
          >
            <div className="h-full rounded-full bg-primary" style={{ width: `${h.profile.percent}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {h.profile.done} of {h.profile.total} sections done
            {h.profile.missing.length > 0 && ` · still missing: ${h.profile.missing.join(", ")}`}
          </p>
        </Card>
      )}

      {waiting > 0 && (
        <Link
          href="/athlete/sales"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn/5 px-5 py-4 hover:border-warn/70"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              {waiting === 1 ? "1 order is waiting for your answer" : `${waiting} orders are waiting for your answer`}
            </span>
            <span className="mt-1 block text-xs text-muted">A sponsor ordered something you asked to approve first. Accept or decline within 48 hours, or the order is cancelled.</span>
          </span>
          <span className="text-xs font-semibold text-primary">Answer →</span>
        </Link>
      )}

      <h2 className="-mb-3 text-sm font-semibold tracking-tight">Coming up</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        {offers && (
          <section>
            <SectionHeading
              title={`Offers waiting for your answer · ${offers.count}`}
              action={<Link href="/athlete/offers" className="text-xs text-primary hover:underline">All offers →</Link>}
            />
            {offers.rows.length === 0 ? (
              <Card>
                <p className="text-sm font-semibold">No offers waiting</p>
                <p className="mt-1 text-xs text-muted">BTG sends a formal offer with the full terms when a sponsor wants you for a campaign.</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {offers.rows.map((o) => (
                  <li key={o.id}>
                    <Link href={`/athlete/offers/${encodeURIComponent(o.id)}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-primary/40">
                      <Monogram text={o.mono} tone="primary" className="size-9 text-[11px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{o.sponsor}</span>
                        <span className="block truncate text-[11px] text-muted">{o.campaign}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums">{o.pay}</span>
                        <span className="block text-[11px] text-muted">{o.when}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section>
          <SectionHeading
            title={`Open invitations · ${h.inviteCount}`}
            action={<Link href="/athlete/invitations" className="text-xs text-primary hover:underline">All invitations →</Link>}
          />
          {h.invites.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold">No invitations yet</p>
              <p className="mt-1 text-xs text-muted">BTG invites you to campaigns once your profile is live. A complete profile gets matched sooner.</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {h.invites.map((i) => (
                <li key={i.id}>
                  <Link href="/athlete/invitations" className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-primary/40">
                    <Monogram text={i.mono} tone="accent" className="size-9 text-[11px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{i.sponsor}</span>
                      <span className="block truncate text-[11px] text-muted">{i.campaign}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">{i.offer}</span>
                      <span className={`block text-[11px] ${i.urgent ? "text-warn" : "text-muted"}`}>{i.expires}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeading
            title={`Deliverables due · ${h.dueCount}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}`}
            action={<Link href="/athlete/deliverables" className="text-xs text-primary hover:underline">All deliverables →</Link>}
          />
          {h.deliverables.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold">Nothing due</p>
              <p className="mt-1 text-xs text-muted">Deliverables show up here after you accept an invitation.</p>
            </Card>
          ) : (
            <ul className="space-y-2">
              {h.deliverables.map((d) => (
                <li key={d.id}>
                  <Link href={`/athlete/deliverables/${encodeURIComponent(d.id)}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-primary/40">
                    <span className="grid w-10 shrink-0 text-center">
                      <span className="text-[10px] font-medium text-muted">{d.mon}</span>
                      <span className="text-lg font-semibold tabular-nums">{d.day}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{d.title}</span>
                      <span className={`block truncate text-[11px] ${d.overdue ? "text-warn" : "text-muted"}`}>
                        {d.campaign} · {d.due}
                      </span>
                    </span>
                    <Badge tone={d.review === "Not started" ? "neutral" : "primary"}>{d.review}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {shop && (
          <section>
            <SectionHeading
              title={`Marketplace sales coming up · ${shop.upcoming.total}`}
              action={<Link href="/athlete/sales" className="text-xs text-primary hover:underline">All sales →</Link>}
            />
            {sales.length === 0 ? (
              <Card>
                <p className="text-sm font-semibold">No sales coming up</p>
                <p className="mt-1 text-xs text-muted">When a sponsor buys one of your listings, its dates show here until you&rsquo;ve delivered it.</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {sales.map((x) => (
                  <li key={x.id}>
                    <Link href={`/athlete/sales/${encodeURIComponent(x.id)}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 hover:border-primary/40">
                      <span className="grid w-10 shrink-0 text-center">
                        <span className="text-[10px] font-medium text-muted">{x.mon}</span>
                        <span className="text-lg font-semibold tabular-nums">{x.day}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{x.title}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {x.sponsor} · {x.when} · {x.quantity}
                        </span>
                      </span>
                      <Badge tone={x.badge === "To deliver" ? "primary" : "neutral"}>{x.badge}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {shop && (
        <section>
          <SectionHeading
            title="Your shop"
            hint="What you sell on the marketplace, counted from your own items, listings and orders."
            action={<Link href="/athlete/listings" className="text-xs text-primary hover:underline">Listings →</Link>}
          />
          <Tiles tiles={shopTiles(shop)} label="Your shop" />
        </section>
      )}

      {money && (
        <section>
          <SectionHeading
            title="Payouts"
            hint="Your marketplace money, from the ledger."
            action={<Link href="/athlete/money" className="text-xs text-primary hover:underline">My money →</Link>}
          />
          <Tiles tiles={payoutStatusTiles(money)} label="Payouts" />
        </section>
      )}

      <section>
        <SectionHeading
          title="Earnings"
          hint={h.hasEarnings ? "By status, from your Campaign Orders." : "Earnings appear once you accept a Campaign Order."}
          action={<Link href="/athlete/earnings" className="text-xs text-primary hover:underline">Earnings →</Link>}
        />
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {h.earnings.map((e) => (
            <li key={e.label} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] font-medium text-muted">{e.label}</p>
              <p className={`mt-1 text-xl font-semibold tabular-nums ${e.tone === "accent" ? "text-accent" : ""}`}>{e.amount}</p>
              <p className="mt-0.5 text-[11px] text-faint">{e.hint}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
