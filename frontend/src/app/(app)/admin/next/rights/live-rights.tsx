import { Badge, Card, Meter, SectionHeading } from "@/components/ui";
import { HeroBand, MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { AddAsset, EditionAdvance, GrantRight } from "@/components/edition-controls";
import { shortDate } from "@/lib/editions-live";
import { clearanceQueue, coverage, ledgerRows, type ApiRightsLedger, type GrantorKind } from "@/lib/rights-live";
import { noEditionHint, readJson, type LiveEditions } from "../live";
import { EditionSwitcher, NextHeading } from "../editions/live-editions";

/* --------------------------------------------------------------------------
   P9-FE-09 — the rights ledger and clearance queue on real ContentRight
   records (GET /editions/:id/rights-ledger). The queue is every asset the
   production gate would refuse; recording a right clears it the moment the
   ledger says so. "Send to production" / "Publish digital" run the real
   transition, so an uncleared item refuses publication with its title.
   -------------------------------------------------------------------------- */

const WRITERS = ["SUPER_ADMIN", "BTG_ADMIN"];

const GRANTOR_COPY: Record<GrantorKind, string> = {
  STUDENT: "Student",
  ATHLETE: "Athlete",
  GUARDIAN: "Guardian",
  BTG: "SponsorX",
  THIRD_PARTY: "Third party",
};

const PERMS = [
  { key: "mayPublishDigital", label: "Publish digital", short: "Digital" },
  { key: "mayPublishPrint", label: "Publish print", short: "Print" },
  { key: "mayPromote", label: "Promote the edition", short: "Promo" },
  { key: "mayReuseCommercially", label: "Reuse commercially", short: "Comm." },
] as const;

function PermMark({ granted, label }: { granted: boolean; label: string }) {
  return granted ? (
    <span role="img" aria-label={`${label}: granted`} className="grid size-5 place-items-center rounded-[4px] bg-next/15 text-[10px] font-bold text-next">
      ✓
    </span>
  ) : (
    <span role="img" aria-label={`${label}: not granted`} className="grid size-5 place-items-center rounded-[4px] border border-line text-[10px] text-faint">
      –
    </span>
  );
}

export async function LiveRights({ live, today }: { live: LiveEditions; today: string }) {
  const e = live.current;
  if (!e) {
    return (
      <div className="space-y-6">
        <NextHeading title="Rights" sub="What we may do with every asset, and the evidence for it" />
        <EmptyState mark="chart" {...noEditionHint(live, "Rights belong to an edition's assets — create the edition first.")} />
      </div>
    );
  }
  const { status, body } = await readJson<ApiRightsLedger>(`/editions/${encodeURIComponent(e.id)}/rights-ledger`);
  const switcher = <EditionSwitcher editions={live.editions} current={e} base="/admin/next/rights" />;
  if (status === 403 || !body) {
    return (
      <div className="space-y-6">
        <NextHeading title="Rights" sub={e.label} right={switcher} />
        <EmptyState mark="chart" title="The rights ledger is outside your scope" hint="Edition assets are read by BTG admin and the school's advisor and students (matrix §15.3)." />
      </div>
    );
  }

  const writer = live.roles.some((r) => WRITERS.includes(r));
  const queue = clearanceQueue(body.assets);
  const cov = coverage(body.assets);
  const rows = ledgerRows(body.assets);
  const grantsVisible = body.assets.every((a) => a.rights !== undefined);
  const gateState = e.state === "CLOSED" || e.state === "IN_PRODUCTION";

  return (
    <div className="space-y-6">
      <NextHeading
        title="Rights"
        sub={`${e.label} · ${e.publication.name} · what we may do with every asset, and the evidence for it`}
        right={
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Badge tone={queue.length ? "warn" : "accent"}>{queue.length ? `${queue.length} awaiting clearance` : "rights cleared"}</Badge>
            {switcher}
          </div>
        }
      />

      <HeroBand border="border-next/30" className="sx-animate">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">The gate — print and digital are separate permissions</p>
        {cov.total === 0 ? (
          <p className="mt-3 text-xs text-muted">No assets on this edition yet — nothing to clear, and nothing to publish.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {[
              { label: `Digital · on ${shortDate(body.edition.publishTarget)}`, n: cov.digital },
              { label: `Print · on ${body.edition.printDate ? shortDate(body.edition.printDate) : "today (no print date set)"}`, n: cov.print },
            ].map((m) => (
              <div key={m.label}>
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="text-muted">{m.label}</span>
                  <span className="tabular-nums text-faint">
                    {m.n} of {cov.total} assets
                  </span>
                </div>
                <div className="mt-1.5">
                  <Meter value={(m.n / cov.total) * 100} tone="next" />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Production and the digital edition need every asset covered for digital on the publish target; print is asked
          only when the edition is printed. These numbers are the gate&rsquo;s own query, not a second opinion.
        </p>
        {writer && gateState && (
          <div className="mt-3">
            <EditionAdvance editionId={e.id} state={e.state} />
          </div>
        )}
      </HeroBand>

      <section className="sx-animate sx-delay-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading title={`Clearance queue · ${queue.length}`} hint="What the gate is waiting on, and who can grant it" />
          {writer && <AddAsset editionId={e.id} />}
        </div>
        {queue.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">
            {cov.total ? "Every asset is covered for digital and print." : "Nothing waiting."}
          </p>
        ) : (
          <div className="space-y-3">
            {queue.map((q) => (
              <Card key={q.asset.id} className="flex flex-wrap items-center justify-between gap-3 border-warn/25">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-sm font-medium">{q.asset.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="font-medium text-warn">{q.missing} missing</span> · {q.asset.kind.replace("_", " ").toLowerCase()} · granted by {q.grantedBy}
                  </p>
                  {q.asset.rights && q.asset.rights.length > 0 && (
                    <p className="mt-1 text-[11px] text-faint">
                      {q.asset.rights.length} right{q.asset.rights.length === 1 ? "" : "s"} on file — none covers the missing use on its date.
                    </p>
                  )}
                </div>
                {writer && <GrantRight assetId={q.asset.id} source={q.asset.sourceKind} today={today} />}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="sx-animate sx-delay-2">
        <SectionHeading title="Rights ledger" hint="One row per grant — evidence is an acceptance or a licence, never both" />
        {!grantsVisible ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">Grants are outside your role&rsquo;s scope.</p>
        ) : rows.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">No rights recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2/50">
                  <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Asset</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Grantor</th>
                  {PERMS.map((p) => (
                    <th key={p.key} className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wide text-muted" title={p.label}>
                      {p.short}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Window</th>
                  <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-surface-2/40">
                    <td className="max-w-64 px-4 py-2.5">
                      <span className="block truncate font-medium" title={r.asset}>{r.asset}</span>
                      <span className="text-[10px] text-faint">{r.assetKind.replace("_", " ").toLowerCase()}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block">{r.grantorRef}</span>
                      <Badge tone={r.grantorKind === "THIRD_PARTY" ? "warn" : "neutral"}>{GRANTOR_COPY[r.grantorKind].toLowerCase()}</Badge>
                    </td>
                    {PERMS.map((p) => (
                      <td key={p.key} className="px-2 py-2.5">
                        <div className="grid place-items-center">
                          <PermMark granted={r[p.key]} label={p.label} />
                        </div>
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted">
                      {shortDate(r.startsAt)} → {r.endsAt ? shortDate(r.endsAt) : "open"}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.acceptanceId ? <Badge tone="primary">consent · {r.acceptanceId}</Badge> : <Badge tone="accent">licence · {r.licenseRef}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] leading-relaxed text-faint">
          SponsorX&rsquo;s own editorial content defaults to no commercial reuse (V3 §6) — granting it is a deliberate act, recorded here like any other.
          <MiniChip kind="ver">POSTGRES</MiniChip>
        </p>
      </section>
    </div>
  );
}
