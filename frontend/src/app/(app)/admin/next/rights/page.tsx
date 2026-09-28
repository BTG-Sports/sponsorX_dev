import { BlockedNotice, Badge, Button, Card, Meter, SectionHeading } from "@/components/ui";
import { HeroBand } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { liveEditions, requestTime } from "../live";
import { LiveRights } from "./live-rights";
import {
  clearanceQueue,
  contentRights,
  studentEdition,
  type ContentRightRow,
  type RightsGrantorKind,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Rights ledger + clearance queue — P1-FE-29, spec §5.3, §6.1. One table
   answers the production gate's one question: what may we do with this asset?

   Print and digital are separate permissions, so the hero shows coverage per
   use — a digital-first edition can clear while print rights are still
   outstanding, and this screen is where that difference is visible. The
   queue names what is missing and who can grant it; recording consent is
   wired by P9-FE-09 against ContentRight.
   -------------------------------------------------------------------------- */

const GRANTOR_COPY: Record<RightsGrantorKind, string> = {
  STUDENT: "Student",
  ATHLETE: "Athlete",
  GUARDIAN: "Guardian",
  BTG: "SponsorX",
  THIRD_PARTY: "Third party",
};

const PERMS: Array<{ key: keyof ContentRightRow; label: string; short: string }> = [
  { key: "mayPublishDigital", label: "Publish digital", short: "Digital" },
  { key: "mayPublishPrint", label: "Publish print", short: "Print" },
  { key: "mayPromote", label: "Promote the edition", short: "Promo" },
  { key: "mayReuseCommercially", label: "Reuse commercially", short: "Comm." },
];

function PermMark({ granted, label }: { granted: boolean; label: string }) {
  return granted ? (
    <span
      role="img"
      aria-label={`${label}: granted`}
      className="grid size-5 place-items-center rounded-[4px] bg-next/15 text-[10px] font-bold text-next"
    >
      ✓
    </span>
  ) : (
    <span
      role="img"
      aria-label={`${label}: not granted`}
      className="grid size-5 place-items-center rounded-[4px] border border-line text-[10px] text-faint"
    >
      –
    </span>
  );
}

const WIRING_TITLE =
  "Consent capture and licence records are wired by P9-FE-09 against ContentRight (Stage 9)";

export default async function RightsLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* P9-FE-09 — a signed-in NEXT desk reads the real ContentRight ledger. */
  if (!demo) {
    const sp = await searchParams;
    const live = await liveEditions(typeof sp.edition === "string" ? sp.edition : undefined);
    if (live) return <LiveRights live={live} today={new Date(requestTime()).toISOString().slice(0, 10)} />;
  }

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Rights{" "}
          <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-transparent">
            · SponsorX NEXT
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {studentEdition.label} · what we may do with every asset, and the
          evidence for it
        </p>
      </div>
      <Badge tone={clearanceQueue.length ? "warn" : "accent"}>
        {clearanceQueue.length
          ? `${clearanceQueue.length} awaiting clearance`
          : "rights cleared"}
      </Badge>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No assets yet"
          hint="Rights rows appear as content lands — each one names its grantor and its evidence."
        />
      </div>
    );
  }

  const totalAssets = contentRights.length + clearanceQueue.length;
  const digital = contentRights.filter((r) => r.mayPublishDigital).length;
  const print = contentRights.filter((r) => r.mayPublishPrint).length;

  return (
    <div className="space-y-6">
      {heading}

      {/* P7-QA-02: without ?demo= this fixture render reaches only signed-in
          staff outside NEXT_DESK_ROLES (CAMPAIGN_MGR, NETWORK_MGR) — the
          edition, rack and split figures below are sample data. */}
      {!demo && (
        <BlockedNotice>
          Demo data — your role doesn&rsquo;t read the live NEXT edition ledger,
          so every figure below is a sample edition&rsquo;s.
        </BlockedNotice>
      )}

      {/* -------------------------------------------- coverage per use */}
      <HeroBand border="border-next/30" className="sx-animate">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
          The gate — print and digital are separate permissions
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {[
            { label: "Digital coverage", n: digital },
            { label: "Print coverage", n: print },
          ].map((m) => (
            <div key={m.label}>
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-muted">{m.label}</span>
                <span className="tabular-nums text-faint">
                  {m.n} of {totalAssets} assets
                </span>
              </div>
              <div className="mt-1.5">
                <Meter value={(m.n / totalAssets) * 100} tone="next" />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          The edition sets <span className="font-medium text-text">rightsCleared</span>{" "}
          only when every asset covers its intended use for the publication
          date. A digital-first issue can clear while print rights are still
          outstanding — which is exactly where {studentEdition.label} stands.
        </p>
      </HeroBand>

      {/* ------------------------------------------------ clearance queue */}
      <section className="sx-animate sx-delay-1">
        <SectionHeading
          title={`Clearance queue · ${clearanceQueue.length}`}
          hint="What the gate is waiting on, and who can grant it"
        />
        <div className="space-y-3">
          {clearanceQueue.map((q) => (
            <Card
              key={q.id}
              className="flex flex-wrap items-center justify-between gap-3 border-warn/25"
            >
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-medium">{q.asset}</p>
                <p className="mt-0.5 text-xs text-muted">
                  <span className="font-medium text-warn">{q.missing}</span> ·{" "}
                  {GRANTOR_COPY[q.grantorKind]}: {q.grantor} · asked{" "}
                  {q.requestedOn}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-faint">
                  {q.note}
                </p>
              </div>
              <Button disabled title={WIRING_TITLE}>
                Record consent
              </Button>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ the ledger */}
      <section className="sx-animate sx-delay-2">
        <SectionHeading
          title="Rights ledger"
          hint="One row per grant — evidence is an acceptance or a licence, never both"
        />
        <div className="overflow-x-auto rounded-xl border border-line bg-surface" tabIndex={0} role="region" aria-label="Rights ledger — scrollable table">
          <table className="w-full min-w-[44rem] text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-surface-2/50">
                <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Asset
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Grantor
                </th>
                {PERMS.map((p) => (
                  <th
                    key={p.key as string}
                    className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
                    title={p.label}
                  >
                    {p.short}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Window
                </th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Evidence
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {contentRights.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-surface-2/40">
                  <td className="max-w-64 px-4 py-2.5">
                    <span className="block truncate font-medium" title={r.asset}>
                      {r.asset}
                    </span>
                    <span className="text-[10px] text-faint">{r.assetKind}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block">{r.grantor}</span>
                    <Badge tone={r.grantorKind === "THIRD_PARTY" ? "warn" : "neutral"}>
                      {GRANTOR_COPY[r.grantorKind].toLowerCase()}
                    </Badge>
                  </td>
                  {PERMS.map((p) => (
                    <td key={p.key as string} className="px-2 py-2.5">
                      <div className="grid place-items-center">
                        <PermMark granted={Boolean(r[p.key])} label={p.label} />
                      </div>
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted">
                    {r.startsAt} → {r.endsAt ?? "open"}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.acceptanceId ? (
                      <Badge tone="primary">consent · {r.acceptanceId}</Badge>
                    ) : (
                      <Badge tone="accent">licence · {r.licenseRef}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-faint">
          SponsorX&rsquo;s own editorial content defaults to no commercial
          reuse (V3 §6): editorial use is not a licence to resell journalism
          inside a sponsor&rsquo;s campaign. Granting it is a deliberate act,
          recorded here like any other.
        </p>
      </section>
    </div>
  );
}
