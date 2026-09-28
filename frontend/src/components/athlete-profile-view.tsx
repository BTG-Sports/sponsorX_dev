"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HeroBand } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { Badge, Card, SourceLabel } from "@/components/ui";
import { INVENTORY_COPY, athletePublic } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete profile view — §9 screen 5, mockup screen 6. One component, two
   surfaces (2026-09-14 UX pass):

   - variant="public" → /athletes/[slug], the sponsor-facing page. Follow
     gives instant feedback; tabs actually switch.
   - variant="owner"  → /athlete/profile, the same content framed inside the
     Athlete Portal so athletes check their public face without ever leaving
     their portal. Sponsor-side actions make no sense against yourself, so
     Follow disappears and Request Partnership becomes a pointer to where
     those requests actually land — your Invitations inbox.

   Prices here are what a sponsor pays. AthleteRate.amount — what the athlete
   is paid — must never render in this component (guide §04, tested per §30).

   The active tab lives in the URL (?tab=, history.replaceState — the
   activity-explorer idiom) so a tabbed view survives refresh and can be
   shared; `initialTab` seeds it back from the server page.
   -------------------------------------------------------------------------- */

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "inventory", label: "Inventory" },
  { key: "media", label: "Media" },
  { key: "performance", label: "Performance" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const isTab = (v: string | undefined): v is TabKey =>
  TABS.some((t) => t.key === v);

/** Static stagger classes (globals.css) — index by clamped position. */
const STAGGER = [
  "sx-delay-1",
  "sx-delay-2",
  "sx-delay-3",
  "sx-delay-4",
  "sx-delay-5",
] as const;

const ICONS = {
  post: "M4 4h16v16H4V4Zm0 12 4-4 3 3 3-3 6 6",
  reel: "M4 4h16v16H4V4Zm0 5h16M9 4v5m-5 4 6 4v-8l-6 4Z",
  story: "M7 4h10v16H7V4Zm-4 3v10m18-10v10",
  event: "M4 5h16v16H4V5Zm0 5h16M9 3v4m6-4v4",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z",
} as const;

function InvIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0 text-muted"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

function VerifiedTick() {
  return (
    <span title="Verified athlete" className="inline-flex text-primary-soft">
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
        <path
          fill="currentColor"
          d="m12 2 2.4 1.8 3-.3 1 2.8 2.6 1.5-.9 2.9.9 2.9-2.6 1.5-1 2.8-3-.3L12 22l-2.4-1.8-3 .3-1-2.8L3 16.2l.9-2.9L3 10.4l2.6-1.5 1-2.8 3 .3L12 2Z"
        />
        <path
          fill="var(--sx-bg)"
          d="m10.9 15.2-2.8-2.8 1.2-1.2 1.6 1.6 3.9-3.9 1.2 1.2-5.1 5.1Z"
        />
      </svg>
    </span>
  );
}

/** §22 — what each provenance chip means, spelled out on the Performance tab. */
const SOURCE_EXPLAINED: Record<string, string> = {
  SELF_REPORTED:
    "Entered by the athlete during onboarding — not yet checked against the platform.",
  ESTIMATED:
    "Derived by BTG from comparable athletes and content — an informed estimate, not a measurement.",
};

function InventoryRows({ items }: { items: typeof athletePublic.inventory }) {
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((it) => (
        <li key={it.jobId} className="flex items-center gap-3 px-4 py-3">
          <InvIcon name={it.icon} />
          <span className="min-w-0 flex-1 truncate text-xs">{it.label}</span>
          {it.state !== "ACTIVE" && (
            <Badge tone="warn">{INVENTORY_COPY[it.state]}</Badge>
          )}
          <Badge tone="neutral">{it.jobId}</Badge>
          <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums">
            {it.price}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AthleteProfileView({
  variant,
  initialTab,
}: {
  variant: "public" | "owner";
  /** ?tab= from the server page — clamped, unknown values fall to Overview. */
  initialTab?: string;
}) {
  const a = athletePublic; // fixtures: one athlete, any slug resolves to it
  const owner = variant === "owner";

  const [tab, setTab] = useState<TabKey>(isTab(initialTab) ? initialTab : "overview");
  const [following, setFollowing] = useState(false);

  /* Tab in the URL without navigation, preserving ?from= etc. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (tab === "overview") p.delete("tab");
    else p.set("tab", tab);
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [tab]);

  /* Roving arrow keys across the tablist (Home/End jump to the edges). */
  const onTablistKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next === -1) return;
    e.preventDefault();
    setTab(TABS[next].key);
    document.getElementById(`profile-tab-${TABS[next].key}`)?.focus();
  };

  /* Below the inventory: the sponsor gets the CTA; the athlete gets told
     where that CTA's requests end up instead of a button aimed at herself. */
  const inventoryFooter = owner ? (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          Sponsors see a <span className="font-medium text-text">Request
          Partnership</span> button here — every request lands in your
          Invitations.
        </p>
        <Link
          href="/athlete/invitations"
          className="text-[11px] font-medium text-accent transition-colors hover:text-accent-soft"
        >
          Go to Invitations →
        </Link>
      </div>
      <p className="mt-3 text-[10px] leading-relaxed text-faint">
        These are sponsor prices from the SX job catalogue (§5) — what you are
        paid is your rate card, which never appears on this page.
      </p>
    </>
  ) : (
    <>
      <button
        type="button"
        title="Opens a CampaignBrief with this athlete attached — not wired"
        className="mt-4 w-full rounded-lg bg-primary py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
      >
        Request Partnership
      </button>
      <p className="mt-3 text-[10px] leading-relaxed text-faint">
        Sponsor prices, mapped to the SX job catalogue (§5). What the athlete
        is paid is a different number and does not appear here — guide §04,
        enforced as a §30 test.
      </p>
    </>
  );

  return (
    <div>
      {/* ---------------------------------------------------- header row */}
      <div className="grid gap-6 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
        {/* Portrait. Real photography comes from the R2 public bucket. */}
        <div className="relative aspect-3/4 overflow-hidden rounded-xl border border-line">
          <div className="absolute inset-0 bg-gradient-to-b from-surface-2 to-bg" />
          <div className="relative grid h-full place-items-center">
            <span className="text-3xl font-bold tracking-tight text-muted/30">
              {a.name
                .split(" ")
                .map((w) => w[0])
                .join("")}
            </span>
          </div>
          <p className="absolute bottom-2 left-0 right-0 text-center text-[9px] text-faint">
            photo pending
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-2xl font-bold tracking-tight">
                  {a.name}
                </h1>
                {a.verified && <VerifiedTick />}
              </div>
              <p className="mt-1 text-xs text-muted">
                {a.sport} | {a.position}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">{a.meta}</p>
            </div>
            {/* You don't follow yourself — owners see a quiet identity chip. */}
            {owner ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-athlete/30 bg-athlete/10 px-3 py-1.5 text-[11px] font-medium text-athlete">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3"
                  aria-hidden="true"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
                This is you
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setFollowing((v) => !v)}
                aria-pressed={following}
                title="Demo — kept for this visit only"
                className={[
                  "rounded-lg px-5 py-2 text-[11px] font-medium transition-colors",
                  following
                    ? "border border-line bg-surface text-text hover:bg-surface-2"
                    : "bg-primary text-cta-ink hover:bg-primary-soft",
                ].join(" ")}
              >
                {following ? "Following ✓" : "Follow"}
              </button>
            )}
          </div>

          {/* ------------------------------------------------ stat band */}
          <HeroBand border="border-athlete/30" className="mt-5 sx-animate">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
              {a.stats.map((s, i) => (
                /* dt before dd in the markup (a <dl> group is term then
                   value, nothing else — axe definition-list); the value still
                   reads first on screen via flex order, and the source chip
                   lives inside the dd it describes. */
                <div
                  key={s.label}
                  className={["sx-animate flex flex-col", STAGGER[Math.min(i, 4)]].join(" ")}
                >
                  <dt className="order-2 mt-1 text-[10px] leading-tight text-muted">
                    {s.label}
                  </dt>
                  <dd className="order-1">
                    <span className="block text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{s.value}</span>
                  </dd>
                  <dd className="order-3 mt-1.5">
                    <SourceLabel source={s.source} />
                  </dd>
                </div>
              ))}
            </dl>
          </HeroBand>
        </div>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div
        role="tablist"
        aria-label="Profile sections"
        onKeyDown={onTablistKey}
        className="mt-8 flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`profile-tab-${t.key}`}
              aria-selected={active}
              aria-controls={`profile-panel-${t.key}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTab(t.key)}
              className={[
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary-soft"
                  : "text-muted hover:bg-surface-2 hover:text-text",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`profile-panel-${tab}`}
        aria-labelledby={`profile-tab-${tab}`}
        className="mt-5"
      >
        {/* ------------------------------------------------------ Overview */}
        {tab === "overview" && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
            {/* min-w-0: the implicit single column below lg must be allowed
                to shrink under the inventory rows' min-content, or the page
                widens past 360 (P1-QA-03). */}
            <section className="min-w-0">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-tight">
                  Available Inventory
                </h2>
                <button
                  type="button"
                  onClick={() => setTab("inventory")}
                  className="text-[11px] font-medium text-accent transition-colors hover:text-accent-soft"
                >
                  View all {a.inventory.length} →
                </button>
              </div>
              <Card className="p-0">
                <InventoryRows items={a.inventory.slice(0, 3)} />
              </Card>
              {inventoryFooter}
            </section>

            <div className="min-w-0 space-y-5">
              <section>
                <h2 className="mb-3 text-sm font-semibold tracking-tight">
                  About
                </h2>
                <Card>
                  <p className="text-xs leading-relaxed text-muted">{a.about}</p>
                </Card>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold tracking-tight">
                  Interests
                </h2>
                <div className="flex flex-wrap gap-1.5">
                  {a.interests.map((i) => (
                    <span
                      key={i}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-muted"
                    >
                      {i}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="mb-3 text-sm font-semibold tracking-tight">
                  Restrictions
                </h2>
                <Card>
                  <p className="text-[11px] leading-relaxed text-muted">
                    Category conflicts are checked before an invitation is sent
                    (§26). Nothing is declared for this athlete yet.
                  </p>
                </Card>
              </section>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------- Inventory */}
        {tab === "inventory" && (
          <section className="min-w-0 lg:max-w-2xl">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              Available Inventory
            </h2>
            <Card className="p-0">
              <InventoryRows items={a.inventory} />
            </Card>
            {inventoryFooter}
          </section>
        )}

        {/* --------------------------------------------------------- Media */}
        {tab === "media" && (
          <EmptyState
            title="No media yet"
            hint={
              owner
                ? "Highlights and campaign content you deliver will appear here once the content pipeline (§12) ships."
                : "Highlights and campaign content appear here as this athlete delivers on campaigns."
            }
          />
        )}

        {/* --------------------------------------------------- Performance */}
        {tab === "performance" && (
          <section className="min-w-0 lg:max-w-2xl">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              Audience &amp; provenance
            </h2>
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {a.stats.map((s) => (
                  <li key={s.label} className="flex items-start gap-4 px-4 py-3">
                    <span className="w-20 shrink-0 text-lg font-bold tabular-nums tracking-tight">
                      {s.value}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium">{s.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                        {SOURCE_EXPLAINED[s.source] ??
                          "Measured through a connected platform account."}
                      </span>
                    </span>
                    <SourceLabel source={s.source} />
                  </li>
                ))}
              </ul>
            </Card>
            <p className="mt-3 text-[10px] leading-relaxed text-faint">
              Every metric declares where it came from (§22). Verified,
              API-measured analytics arrive with Phase 3 attribution — until
              then nothing self-reported can be mistaken for a measurement.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
