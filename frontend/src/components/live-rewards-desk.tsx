"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "./use-mounted";
import { useDialogFocus } from "./use-dialog-focus";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { CloseIcon, SearchInput } from "@/components/filter-kit";
import {
  capLine,
  holdLabel,
  ELIGIBILITY,
  expiryFor,
  fanPath,
  fmtEt,
  HOLD_PRESETS,
  holdPreset,
  parseCap,
  redemptionRate,
  rewardMoves,
  STATE_COPY,
  type ApiReward,
  type ApiRewardDetail,
  type ApiRewardState,
  type CreateRewardResult,
  type HoldPreset,
  type LinkResult,
  type NewReward,
  type RewardEligibility,
  type SimpleResult,
} from "@/lib/rewards-live";

/* --------------------------------------------------------------------------
   LiveRewardsDesk — /admin/rewards on real rewards (P6-FE-01, §9 screen 10,
   §16). The fixture desk's list-first idiom, on what Postgres holds:

   - Summary strip and per-card funnels are the four event kinds from
     RewardEvent (P6-BE-03), summed per reward — never one counter.
   - Lifecycle moves are reward-state.ts's (go live, pause, resume, end,
     archive); nothing else is offered.
   - "QR codes" opens the reward's tokens — one per athlete — with the fan
     page link and the worker-rendered PNG through an audited signed URL,
     ready to print.
   - "Create reward" persists what the model holds: campaign, offer, terms,
     expiry, single-use, who it is for, a redemption cap, the fan page's
     headline and subhead (P6-BE-08), a token per signed athlete, and
     optionally live at once. The consent line fans see is shown, not edited
     (versioned centrally, P6-SEC-01): the claim records which words the fan
     saw, and a per-reward edit would break that record.
   -------------------------------------------------------------------------- */

type Actions = {
  create: (r: NewReward) => Promise<CreateRewardResult>;
  move: (id: string, to: ApiRewardState) => Promise<SimpleResult>;
  detail: (id: string) => Promise<{ ok: true; reward: ApiRewardDetail } | { ok: false; message: string }>;
  qrLink: (tokenId: string) => Promise<LinkResult>;
  athletes: (campaignId: string) => Promise<{ ok: true; athletes: { id: string; name: string }[] } | { ok: false; message: string }>;
};

type CampaignOption = { id: string; name: string; sponsorName: string; endDate: string };

const TONE: Record<ApiRewardState, "neutral" | "primary" | "accent" | "warn" | "danger"> = {
  DRAFT: "neutral",
  ACTIVE: "accent",
  PAUSED: "warn",
  EXPIRED: "neutral",
  ARCHIVED: "neutral",
};
const LABEL: Record<ApiRewardState, string> = {
  DRAFT: "Draft",
  ACTIVE: "Live",
  PAUSED: "Paused",
  EXPIRED: "Ended",
  ARCHIVED: "Archived",
};
const TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "live", label: "Live", match: (s: ApiRewardState) => s === "ACTIVE" },
  { key: "draft", label: "Draft", match: (s: ApiRewardState) => s === "DRAFT" },
  { key: "paused", label: "Paused", match: (s: ApiRewardState) => s === "PAUSED" },
  { key: "ended", label: "Ended", match: (s: ApiRewardState) => s === "EXPIRED" || s === "ARCHIVED" },
] as const;

/* F-08 — one reward time convention everywhere (desk, creator, fan page):
   US Eastern, labelled "ET". This desk used to print UTC. */
const fmtDay = fmtEt;

export function LiveRewardsDesk({
  rewards,
  campaigns,
  consent,
  actions,
  openNew,
}: {
  rewards: ApiReward[];
  campaigns: CampaignOption[];
  consent: { version: string; text: string };
  actions: Actions;
  openNew?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(Boolean(openNew));
  const mounted = useMounted();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /* One clock per mount for "has this expired?" — stable across renders. */
  const [renderedAt] = useState(() => Date.now());

  const totals = useMemo(
    () =>
      rewards.reduce(
        (t, r) => ({
          live: t.live + (r.state === "ACTIVE" ? 1 : 0),
          SCAN: t.SCAN + (r.funnel?.SCAN ?? 0),
          CLAIM: t.CLAIM + (r.funnel?.CLAIM ?? 0),
          REDEEM: t.REDEEM + (r.funnel?.REDEEM ?? 0),
        }),
        { live: 0, SCAN: 0, CLAIM: 0, REDEEM: 0 },
      ),
    [rewards],
  );
  const needle = q.trim().toLowerCase();
  const matcher = TABS.find((t) => t.key === tab)!.match;
  const shown = rewards.filter(
    (r) =>
      matcher(r.state) &&
      (!needle || [r.offerText, r.campaign.name, r.campaign.sponsorName].join(" ").toLowerCase().includes(needle)),
  );

  const move = async (r: ApiReward, to: ApiRewardState) => {
    setBusy(r.id);
    setError(null);
    const res = await actions.move(r.id, to);
    setBusy(null);
    if (res.ok) router.refresh();
    else setError({ id: r.id, message: res.message });
  };

  return (
    <div className="space-y-5">
      <Card className="grid grid-cols-2 divide-line-soft p-0 sm:grid-cols-4 sm:divide-x">
        {[
          ["Live rewards", totals.live],
          ["Scans", totals.SCAN],
          ["Claims", totals.CLAIM],
          ["Redeemed", totals.REDEEM],
        ].map(([k, v]) => (
          <div key={k as string} className="px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-faint">
              {k}
              {/* P7-QA-02: counted from RewardEvent / Reward rows. */}
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">{Number(v).toLocaleString("en-US")}</p>
          </div>
        ))}
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={t.key === tab}
              onClick={() => setTab(t.key)}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                t.key === tab ? "bg-admin/15 text-text" : "text-muted hover:text-text",
              ].join(" ")}
            >
              {t.label}
              <span className="text-[10px] tabular-nums text-text/80">{rewards.filter((r) => t.match(r.state)).length}</span>
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Offer, campaign or sponsor…" label="Search rewards" tone="admin" />
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
        >
          <span aria-hidden="true" className="text-sm leading-none">+</span> Create reward
        </button>
      </div>

      {toast && (
        <p role="status" className="sx-pop rounded-xl border border-accent/30 bg-accent/8 px-4 py-3 text-xs text-text">
          {toast}
        </p>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-5 py-12 text-center">
          <p className="text-sm font-semibold">{rewards.length ? "No rewards match" : "No fan rewards yet"}</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            {rewards.length
              ? "Try another tab or search."
              : "Create the first one — every athlete on the campaign gets their own QR token (§16)."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const f = r.funnel;
            /* F-04 — "—" (with the reason) rather than a rate over 100%. */
            const { rate, hint: rateHint } = redemptionRate(f);
            /* The database's counter where the API gives it (capped rewards);
               else the funnel's REDEEM rows. */
            const redeemed = r.redeemed ?? f?.REDEEM;
            return (
              <li key={r.id} className="min-w-0">
                <Card className="flex h-full flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold tracking-tight">{r.offerText}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {r.campaign.name} · {r.campaign.sponsorName}
                      </p>
                    </div>
                    <Badge tone={TONE[r.state]}>{LABEL[r.state]}</Badge>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-faint">{STATE_COPY[r.state]}</p>

                  {f && (
                    <ol className="mt-3 grid grid-cols-4 gap-1 text-center" aria-label="Scan to redemption">
                      {(["SCAN", "LANDING", "CLAIM", "REDEEM"] as const).map((k) => (
                        <li key={k} className="rounded-lg bg-surface-2/60 px-1 py-1.5">
                          <p className="text-xs font-semibold tabular-nums">{f[k].toLocaleString("en-US")}</p>
                          <p className="text-[9px] uppercase tracking-wide text-faint">{k.toLowerCase()}</p>
                        </li>
                      ))}
                    </ol>
                  )}

                  <dl className="mt-3 space-y-1 text-[11px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Tokens</dt>
                      <dd className="text-muted">{r.tokenCount} across {r.athletes} athlete{r.athletes === 1 ? "" : "s"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Expires</dt>
                      <dd className="text-muted">{fmtDay(r.expiresAt)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="shrink-0 text-faint">Redeemed of claimed</dt>
                      <dd className="min-w-0 text-right text-muted">
                        {rate === null ? "—" : `${rate}%`}
                        {rateHint && <span className="mt-0.5 block text-[10px] leading-snug text-faint">{rateHint}</span>}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Per fan</dt>
                      <dd className="text-muted">{r.singleUse ? "single use" : "reusable"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">For</dt>
                      <dd className="min-w-0 truncate text-muted" title={r.eligibilityNote ?? undefined}>
                        {ELIGIBILITY[r.eligibility ?? "ANYONE"].label}
                        {r.eligibilityNote ? ` · ${r.eligibilityNote}` : ""}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-faint">Redemption cap</dt>
                      {/* "left" only with a funnel to count from — without one, just the cap. */}
                      <dd className="text-muted">
                        {redeemed !== undefined || r.redemptionCap == null
                          ? capLine(r.redemptionCap, redeemed, r.held ?? 0)
                          : `${r.redemptionCap.toLocaleString("en-US")} total`}
                      </dd>
                    </div>
                    {r.redemptionCap != null && r.reserveMinutes != null && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-faint">A claim holds a unit for</dt>
                        <dd className="text-muted">{holdLabel(r.reserveMinutes)}</dd>
                      </div>
                    )}
                  </dl>
                  {r.landing?.headline && (
                    <p className="mt-2 truncate text-[11px] text-faint" title={r.landing.subhead ?? undefined}>
                      Fan page: &ldquo;{r.landing.headline}&rdquo;
                    </p>
                  )}

                  {error?.id === r.id && (
                    <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error.message}</p>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2 pt-4">
                    {rewardMoves(r.state, new Date(r.expiresAt).getTime() <= renderedAt).map((m, i) => (
                      <button
                        key={m.to}
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => move(r, m.to)}
                        className={
                          i === 0
                            ? "rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:opacity-40"
                            : "rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-text transition-colors hover:bg-surface-2 disabled:opacity-40"
                        }
                      >
                        {m.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setQrFor(r.id)}
                      className="ml-auto rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
                    >
                      QR codes
                    </button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {qrFor && mounted &&
        createPortal(
          <QrPanel rewardId={qrFor} actions={actions} onClose={() => setQrFor(null)} />,
          document.body,
        )}
      {creating && mounted &&
        createPortal(
          <Creator
            campaigns={campaigns}
            consent={consent}
            actions={actions}
            onClose={() => setCreating(false)}
            onCreated={(msg) => {
              setCreating(false);
              setToast(msg);
              router.refresh();
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/* --------------------------------------------------------------- QR panel */

function QrPanel({ rewardId, actions, onClose }: { rewardId: string; actions: Actions; onClose: () => void }) {
  const [state, setState] = useState<{ reward?: ApiRewardDetail; error?: string }>({});
  /* F-05: focus in, Tab trapped, Escape closes, focus back to the trigger. */
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose);
  const [linkErr, setLinkErr] = useState<Record<string, string>>({});

  /* Tokens load when the panel opens — they're per reward, and a desk of
     a hundred rewards shouldn't fetch a hundred token lists up front. */
  useEffect(() => {
    let alive = true;
    void actions.detail(rewardId).then((r) => {
      if (alive) setState(r.ok ? { reward: r.reward } : { error: r.message });
    });
    return () => {
      alive = false;
    };
  }, [rewardId, actions]);

  const download = async (tokenId: string) => {
    const w = window.open("about:blank", "_blank");
    const r = await actions.qrLink(tokenId);
    if (r.ok && w) w.location.href = r.url;
    else {
      w?.close();
      setLinkErr((e) => ({ ...e, [tokenId]: r.ok ? "Your browser blocked the new tab." : r.message }));
    }
  };

  const rw = state?.reward;
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="QR codes">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="sx-drawer absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b border-line-soft p-5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">{rw?.offerText ?? "QR codes"}</p>
            <p className="text-[11px] text-muted">One token per athlete — each QR says who drove the scan.</p>
          </div>
          <button type="button" data-autofocus onClick={onClose} aria-label="Close QR codes" className="grid size-8 place-items-center rounded-full border border-line text-muted hover:text-text">
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {state?.error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{state.error}</p>}
          {!rw && !state?.error && <p className="text-xs text-muted">Loading tokens…</p>}
          {rw && rw.tokens.length === 0 && <p className="text-xs text-muted">No tokens on this reward yet.</p>}
          {rw && rw.tokens.length > 0 && (
            <ul className="divide-y divide-line-soft">
              {rw.tokens.map((t) => (
                <li key={t.id} className="py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-medium">{t.athlete?.displayName ?? "No athlete"}</p>
                    {t.qrReady ? (
                      <button
                        type="button"
                        onClick={() => download(t.id)}
                        className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-text hover:bg-surface-2"
                      >
                        Download QR ↗
                      </button>
                    ) : (
                      <span className="shrink-0 text-[11px] text-faint">QR generating…</span>
                    )}
                  </div>
                  {t.token && (
                    <a href={fanPath(t.token)} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate font-mono text-[10px] text-muted underline underline-offset-2">
                      {fanPath(t.token)}
                    </a>
                  )}
                  {linkErr[t.id] && <p className="mt-1 text-[10px] text-danger">{linkErr[t.id]}</p>}
                </li>
              ))}
            </ul>
          )}
          {rw && (
            <p className="mt-4 text-[10px] leading-relaxed text-faint">
              Print at poster or table-tent size with the white border intact — the quiet zone is what lets a phone
              find the code in a dim venue.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- creator */

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-admin/60";

function Creator({
  campaigns,
  consent,
  actions,
  onClose,
  onCreated,
}: {
  campaigns: CampaignOption[];
  consent: { version: string; text: string };
  actions: Actions;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [offer, setOffer] = useState("");
  const [terms, setTerms] = useState("");
  const [expiry, setExpiry] = useState<"30" | "60" | "90" | "campaign">("campaign");
  const [singleUse, setSingleUse] = useState(true);
  /* P6-BE-08 — who it is for, the cap, and the fan page's own words. */
  const [eligibility, setEligibility] = useState<RewardEligibility>("ANYONE");
  const [eligibilityNote, setEligibilityNote] = useState("");
  const [capInput, setCapInput] = useState("");
  const [headline, setHeadline] = useState("");
  const [subhead, setSubhead] = useState("");
  const [activate, setActivate] = useState(false);
  /* QA-09 — how long a claim holds a unit of a capped reward. */
  const [hold, setHold] = useState<HoldPreset>("60");
  const [holdCustom, setHoldCustom] = useState("");
  /* A create that failed part-way leaves a reward behind; the retry
     finishes THAT one (missing tokens, go-live) instead of making a
     duplicate (QA pass 5, suspected duplicate on retry). */
  const [resumeId, setResumeId] = useState<string | null>(null);
  /* F-05: focus in, Tab trapped, Escape closes, focus back to the trigger. */
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose);
  /* Signed athletes per campaign, fetched once each as campaigns are picked. */
  const [rosters, setRosters] = useState<Record<string, { athletes?: { id: string; name: string }[]; error?: string }>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId || rosters[campaignId]) return;
    let alive = true;
    void actions.athletes(campaignId).then((r) => {
      if (alive) setRosters((m) => ({ ...m, [campaignId]: r.ok ? { athletes: r.athletes } : { error: r.message } }));
    });
    return () => {
      alive = false;
    };
  }, [campaignId, rosters, actions]);

  const roster = rosters[campaignId];
  const campaign = campaigns.find((c) => c.id === campaignId);
  const athletes = roster?.athletes ?? [];
  const cap = parseCap(capInput);
  const reserveMinutes = holdPreset(hold, holdCustom);
  const holdBad = typeof cap === "number" && reserveMinutes === "invalid";
  const ready = campaign && offer.trim() && terms.trim() && picked.size > 0 && cap !== "invalid" && !holdBad && !busy;
  /* QA pass 6 (P6-FE-03): once a part-way failure has saved the reward, its
     own fields are what they are — a retry issues the missing tokens and
     goes live, it cannot edit (no edit route). Lock them rather than accept
     edits that would be silently dropped. The athletes and "go live" stay
     open: they are what finishing does. */
  const locked = resumeId !== null;

  const create = async () => {
    if (!campaign || cap === "invalid" || holdBad) return;
    setBusy(true);
    setError(null);
    const r = await actions.create({
      campaignId,
      offerText: offer.trim(),
      terms: terms.trim(),
      expiresAt: expiryFor(expiry, new Date(), campaign.endDate),
      singleUse,
      eligibility,
      eligibilityNote: eligibilityNote.trim() || null,
      redemptionCap: cap,
      landingHeadline: headline.trim() || null,
      landingSubhead: subhead.trim() || null,
      reserveMinutes: reserveMinutes === "invalid" ? 60 : reserveMinutes,
      athleteIds: [...picked],
      activate,
      ...(resumeId ? { resumeRewardId: resumeId } : {}),
    });
    setBusy(false);
    if (!r.ok && r.rewardId) setResumeId(r.rewardId);
    if (r.ok) {
      /* The saved offer, not the form's — the two can differ only if the
         form changed after a part-way failure, which `locked` prevents. */
      onCreated(
        `${r.offerText ?? offer.trim()} created ${r.activated ? "and live" : "as a draft"} — ${r.tokens} QR token${r.tokens === 1 ? "" : "s"}, one per athlete; the images render in a moment.`,
      );
    } else setError(r.message);
  };

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Create fan reward">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-stretch justify-center sm:items-center sm:p-4">
        <div className="sx-pop relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden bg-bg shadow-2xl sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-line">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft bg-surface px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Create Fan Reward</h2>
              <p className="text-[11px] text-muted">§16 · one reward, one token per athlete · scan → claim → redeem</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full border border-line text-muted hover:text-text">
              <CloseIcon />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {campaigns.length === 0 ? (
              <p className="text-xs text-muted">No campaign can take a reward yet — rewards belong to a campaign with signed athletes.</p>
            ) : (
              <>
                {locked && (
                  <p role="status" className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
                    This reward already exists — its details below are saved and can&rsquo;t be changed here. Finishing issues the remaining QR codes
                    {activate ? " and makes it live" : ""}.
                  </p>
                )}
                <fieldset disabled={locked} aria-label="Reward details" className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-60">
                <label className="block">
                  <span className="text-[11px] font-medium text-muted">Campaign</span>
                  <select
                    value={campaignId}
                    onChange={(e) => {
                      setCampaignId(e.target.value);
                      setPicked(new Set());
                    }}
                    className={inputCls}
                  >
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.sponsorName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted">Offer — what the fan gets</span>
                  <input value={offer} onChange={(e) => setOffer(e.target.value)} maxLength={500} placeholder="Free coffee with any service" className={inputCls} />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted">Terms — shown on the fan page</span>
                  <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} maxLength={4000} placeholder="One per fan. Show this screen at the counter." className={inputCls} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Expires</span>
                    <select value={expiry} onChange={(e) => setExpiry(e.target.value as typeof expiry)} className={inputCls}>
                      <option value="campaign">When the campaign ends{campaign ? ` (${fmtDay(campaign.endDate)})` : ""}</option>
                      <option value="30">In 30 days</option>
                      <option value="60">In 60 days</option>
                      <option value="90">In 90 days</option>
                    </select>
                  </label>
                  <label className="mt-6 flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={singleUse} onChange={(e) => setSingleUse(e.target.checked)} className="size-3.5 accent-[var(--sx-primary)]" />
                    Single use per fan
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Who it&rsquo;s for</span>
                    <select value={eligibility} onChange={(e) => setEligibility(e.target.value as RewardEligibility)} className={inputCls}>
                      {(Object.keys(ELIGIBILITY) as RewardEligibility[]).map((k) => (
                        <option key={k} value={k}>{ELIGIBILITY[k].label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Redemption cap <span className="text-faint">(blank = unlimited)</span></span>
                    <input
                      value={capInput}
                      onChange={(e) => setCapInput(e.target.value)}
                      inputMode="numeric"
                      placeholder="e.g. 200"
                      aria-invalid={cap === "invalid"}
                      aria-describedby="cap-hint"
                      className={inputCls}
                    />
                  </label>
                </div>
                <p id="cap-hint" className={`-mt-2 text-[10px] ${cap === "invalid" ? "text-danger" : "text-faint"}`}>
                  {cap === "invalid"
                    ? "A whole number from 1 — or leave it blank for no cap."
                    : "Total redemptions across every athlete's QR. Enforced at the till by the API; once it's used up the fan page says the reward has run out."}
                </p>
                {typeof cap === "number" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[11px] font-medium text-muted">Hold a claimed reward for</span>
                      <select value={hold} onChange={(e) => setHold(e.target.value as HoldPreset)} aria-describedby="hold-hint" className={inputCls}>
                        {HOLD_PRESETS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </label>
                    {hold === "custom" && (
                      <label className="block">
                        <span className="text-[11px] font-medium text-muted">Minutes <span className="text-faint">(5 – 10,080)</span></span>
                        <input
                          value={holdCustom}
                          onChange={(e) => setHoldCustom(e.target.value)}
                          inputMode="numeric"
                          placeholder="e.g. 90"
                          aria-invalid={holdBad}
                          aria-describedby="hold-hint"
                          className={inputCls}
                        />
                      </label>
                    )}
                    <p id="hold-hint" className={`-mt-1 text-[10px] sm:col-span-2 ${holdBad ? "text-danger" : "text-faint"}`}>
                      {holdBad
                        ? "A whole number of minutes, from 5 up to 7 days (10,080)."
                        : "A fan who claims gets one unit set aside until then — the till honours it even if the rest run out. After that the unit goes back in the pool."}
                    </p>
                  </div>
                )}
                <label className="block">
                  <span className="text-[11px] font-medium text-muted">Eligibility note <span className="text-faint">(optional)</span></span>
                  <input value={eligibilityNote} onChange={(e) => setEligibilityNote(e.target.value)} maxLength={280} placeholder="Show your wristband at the booth" className={inputCls} />
                  <span className="mt-1 block text-[10px] text-faint">
                    Shown to the fan and to booth staff. The page has no login, so eligibility is checked by staff at the till, not by the system.
                  </span>
                </label>

                <fieldset className="space-y-3 rounded-lg border border-line-soft p-3">
                  <legend className="px-1 text-[11px] font-medium text-muted">Landing page — what the fan reads first</legend>
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Headline <span className="text-faint">(blank = &ldquo;You&rsquo;ve got a reward&rdquo;)</span></span>
                    <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} placeholder="You've got a reward" className={inputCls} />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-medium text-muted">Subhead <span className="text-faint">(optional)</span></span>
                    <input value={subhead} onChange={(e) => setSubhead(e.target.value)} maxLength={280} placeholder="Thanks for coming out — this one's on us." className={inputCls} />
                  </label>
                </fieldset>
                </fieldset>

                <div>
                  <p className="text-[11px] font-medium text-muted">Athletes carrying a QR</p>
                  {roster?.error && <p className="mt-1 text-[11px] text-danger">{roster.error}</p>}
                  {!roster?.athletes && !roster?.error && <p className="mt-1 text-[11px] text-faint">Loading the roster…</p>}
                  {roster?.athletes && athletes.length === 0 && (
                    <p className="mt-1 text-[11px] text-faint">Nobody has signed onto this campaign yet — a token needs an athlete behind it.</p>
                  )}
                  {athletes.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {athletes.map((a) => (
                        <li key={a.id}>
                          <label className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={picked.has(a.id)}
                              onChange={() =>
                                setPicked((p) => {
                                  const n = new Set(p);
                                  if (n.has(a.id)) n.delete(a.id);
                                  else n.add(a.id);
                                  return n;
                                })
                              }
                              className="size-3.5 accent-[var(--sx-primary)]"
                            />
                            {a.name}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-faint">What fans see if they give an email · v{consent.version}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">{consent.text}</p>
                  <p className="mt-1 text-[10px] text-faint">Versioned for every reward, not edited per reward — the claim records which words the fan saw.</p>
                </div>

                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="size-3.5 accent-[var(--sx-primary)]" />
                  Go live as soon as it&rsquo;s created
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
                {error}
                {resumeId && " The reward itself was saved — trying again finishes it rather than creating a second one."}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line-soft bg-surface px-5 py-3.5">
            <p className="mr-auto text-[10px] text-faint">
              {!offer.trim() ? "Name the offer." : !terms.trim() ? "Add the terms." : cap === "invalid" ? "Fix the redemption cap." : holdBad ? "Fix the hold window." : picked.size === 0 ? "Pick at least one athlete." : resumeId ? "Finishes the reward already saved." : `${picked.size} token${picked.size === 1 ? "" : "s"} will be issued.`}
            </p>
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface-2">
              Cancel
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={create}
              className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:opacity-40"
            >
              {busy ? (resumeId ? "Finishing…" : "Creating…") : resumeId ? "Finish creating" : "Create reward"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
