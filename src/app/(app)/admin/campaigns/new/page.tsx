import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Card, SectionHeading } from "@/components/ui";
import { resolveBack } from "@/lib/back";
import { builderDraft, builderSteps, eligibleAthletes, money } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign Builder + Athlete Matching — §9 screen 8, mockup screen 8.

   The mockup's builder is a media-buy form: name, dates, budget, CPM,
   platforms. §9.8 also requires the eligible-athlete roster and the matching
   step, and §13 step 3 makes filtering by sport, geography, availability,
   restrictions and tier the substance of Phase 1. That panel is added here —
   it is the core of the managed marketplace, not an extra.

   §26 requires a category conflict check before invitations go out, so a
   conflicting athlete is shown blocked rather than hidden.
   -------------------------------------------------------------------------- */

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={[
              "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold",
              i === current
                ? "bg-primary text-white"
                : i < current
                  ? "bg-accent/15 text-accent"
                  : "bg-surface-2 text-faint",
            ].join(" ")}
          >
            {i < current ? "✓" : i + 1}
          </span>
          <span
            className={[
              "text-[11px] font-medium",
              i === current ? "text-text" : "text-faint",
            ].join(" ")}
          >
            {s}
          </span>
          {i < steps.length - 1 && (
            <span className="mx-1 hidden h-px w-6 bg-line sm:block" />
          )}
        </li>
      ))}
    </ol>
  );
}

function Field({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted">{label}</label>
      <div className="mt-1.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs">
        {value}
      </div>
      {hint && <p className="mt-1 text-[10px] text-faint">{hint}</p>}
    </div>
  );
}

export default async function CampaignBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const back = resolveBack(from, "admin");
  const d = builderDraft;
  const selected = eligibleAthletes.filter((a) => a.selected).length;

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Create Campaign</h1>
        <p className="mt-1 text-xs text-muted">
          Brief, inventory, athlete matching and approval — §13&rsquo;s managed
          workflow.
        </p>
      </div>

      <Card>
        <Stepper steps={builderSteps} current={1} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        {/* ------------------------------------------------ details form */}
        <div className="space-y-6">
          <section>
            <SectionHeading title="Campaign details" />
            <Card className="space-y-4">
              <Field label="Campaign Name" value={d.name} />
              <Field label="Campaign Dates" value={d.dates} />

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Budget" value={money(d.budget)} />
                <Field label="CPM" value={`$${d.cpm}`} />
                <Field
                  label="Est. Views"
                  value={d.estViews.toLocaleString()}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-muted">
                  Platforms
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.platforms.map((p) => (
                    <label
                      key={p.label}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5"
                    >
                      <input
                        type="checkbox"
                        defaultChecked={p.on}
                        className="size-3 accent-[var(--sx-primary)]"
                      />
                      <span className="text-[11px] text-muted">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </Card>
          </section>

          {/* ------------------------------------------ athlete matching */}
          <section>
            <SectionHeading
              title="Eligible athletes"
              hint="§13 step 3 — filtered by sport, geography, availability, restrictions and tier"
              action={
                <span className="text-[11px] text-muted">
                  {selected} selected
                </span>
              }
            />
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left">
                  <thead>
                    <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                      <th className="px-4 py-2.5 font-medium">Athlete</th>
                      <th className="px-4 py-2.5 font-medium">Sport</th>
                      <th className="px-4 py-2.5 font-medium">Geography</th>
                      <th className="px-4 py-2.5 font-medium">Tier</th>
                      <th className="px-4 py-2.5 font-medium">Score</th>
                      <th className="px-4 py-2.5 font-medium">Invite</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {eligibleAthletes.map((a) => (
                      <tr key={a.slug} className={a.conflict ? "opacity-60" : ""}>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/athletes/${a.slug}?from=builder`}
                            className="text-xs font-medium hover:text-accent"
                          >
                            {a.name}
                          </Link>
                          {a.conflict && (
                            <p className="mt-0.5 text-[10px] text-danger">
                              {a.conflict}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted">
                          {a.sport}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted">
                          {a.geo}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone="primary">{a.tier}</Badge>
                        </td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-muted">
                          {a.score}
                        </td>
                        <td className="px-4 py-2.5">
                          {a.conflict ? (
                            <Badge tone="danger">Blocked</Badge>
                          ) : (
                            <input
                              type="checkbox"
                              defaultChecked={a.selected}
                              className="size-3.5 accent-[var(--sx-primary)]"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="mt-2 text-[10px] leading-relaxed text-faint">
              Score is the Content Value Score (§14) — engagement, content
              quality, audience, reliability, geography, fit and sponsor
              performance. Rules-based in Phase 1; §14 makes algorithmic
              scoring a Phase 3 job.
            </p>
          </section>
        </div>

        {/* ---------------------------------------------------- side rail */}
        <div className="space-y-4">
          <Card>
            <SectionHeading title="Summary" />
            <dl className="space-y-2.5">
              {[
                ["Inventory", "Player of the Week"],
                ["Budget", money(d.budget)],
                ["Athletes", `${selected} of ${eligibleAthletes.length}`],
                ["Platforms", String(d.platforms.filter((p) => p.on).length)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <dt className="text-[11px] text-muted">{k}</dt>
                  <dd className="text-[11px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 space-y-2">
              <button
                type="button"
                title="Sends CampaignInvites and moves the campaign to STAFFING — not wired"
                className="w-full rounded-lg bg-primary py-2.5 text-xs font-medium text-white transition-colors hover:bg-primary-soft"
              >
                Next: Rewards
              </button>
              <Link
                href="/admin"
                className="block rounded-lg border border-line py-2.5 text-center text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Cancel
              </Link>
            </div>
          </Card>

          <BlockedNotice>
            Sending invitations creates Campaign Orders, and acceptance is
            blocked until counsel approves the Campaign Order template (guide
            §08). The builder can be finished; the invitations cannot go out.
          </BlockedNotice>

          <Card>
            <p className="text-[11px] font-medium text-muted">Conflict check</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
              §26 requires category conflicts to be checked before an
              invitation is sent. One athlete is blocked on a competing apparel
              deal — shown rather than silently filtered out, so the campaign
              manager knows why the roster is short.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
