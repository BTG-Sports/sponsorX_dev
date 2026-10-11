import Link from "next/link";
import { notFound } from "next/navigation";
import { ArenaChip, ArenaHead, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles, type ArenaTone } from "@/components/arena-stage";
import { Badge } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { DeliverableUpload, PublishProof } from "@/components/deliverable-upload";
import {
  daysUntil,
  dueLabel,
  isOverdue,
  nextStep,
  type ApiDeliverableDetail,
} from "@/lib/deliverables-live";
import { submittedRoute } from "@/lib/content-trust";
import { apiFetch, fetchActor } from "@/server/api";
import { markPublished, presignUpload, registerUpload, submitDraft } from "./actions";

/* --------------------------------------------------------------------------
   One deliverable — where the athlete uploads a draft, answers a revision
   and records where it went live (P5-FE-03, §24, §21).

   Live only: a deliverable exists because a real Campaign Order was
   accepted, so there is no fixture version of this page — a visitor without
   an athlete session is sent back to the calendar's demo. What the page
   offers follows §21 exactly: upload while NOT_STARTED (which also submits),
   upload a new version while a revision is open, publish once APPROVED, and
   otherwise say whose move it is.

   P1-ART-22 (2026-10-11) — visual only, on the Arena: ArenaHead (the title,
   the step as a chip, campaign · sponsor · job as the lede, the back link
   as a pill), a KPI row from this same read (days left or overdue,
   versions uploaded, automatic checks passed), the revision notice and the
   versions list as plates, the action rail as a plate lit under the
   pointer. Every read, action and island (DeliverableUpload, PublishProof)
   is unchanged.
   -------------------------------------------------------------------------- */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const TONE: Record<"primary" | "warn" | "accent" | "neutral" | "danger", ArenaTone> = {
  primary: "blue", warn: "warn", accent: "win", neutral: "ink", danger: "danger",
};

function BackPill() {
  return (
    <Link
      href="/athlete/deliverables"
      className="sx-btn-secondary inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <span aria-hidden="true">←</span>
      Deliverables
    </Link>
  );
}

export default async function DeliverablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const who = await fetchActor();
  const isAthlete = who.status === "linked" && who.actor.roles.includes("ATHLETE");
  const isGuardian = who.status === "linked" && who.actor.roles.includes("GUARDIAN");
  if (!isAthlete && !isGuardian) {
    return (
      <div className="space-y-6">
        <ArenaHead title="Deliverable" actions={<BackPill />} />
        <ArenaPanel delay={0.1}>
          <p className="text-sm font-medium">Sign in as the athlete to open a deliverable</p>
          <p className="mt-1 text-xs text-muted">The calendar shows a demo in the meantime.</p>
        </ArenaPanel>
      </div>
    );
  }

  const res = await apiFetch(`/deliverables/${encodeURIComponent(id)}`);
  if (res.status === 403) notFound();
  if (!res.ok) throw new Error(`Deliverable unavailable (${res.status}).`);
  const d = (await res.json()) as ApiDeliverableDetail;

  const today = new Date();
  const step = nextStep(d);
  const route = submittedRoute(d);
  const overdue = isOverdue(d, today);
  const canUpload = isAthlete && (d.state === "NOT_STARTED" || Boolean(d.revision));
  const days = daysUntil(d.dueDate, today);
  const done = step.on === "done";
  const checksOk = d.checks ? d.checks.filter((c) => c.ok).length : 0;
  const readAt = today.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-6">
      <ArenaHead
        title={d.title}
        pill={`Postgres · read ${readAt}`}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <ArenaChip tone={TONE[step.tone]}>{step.label}</ArenaChip>
            {d.appearance && <MiniChip kind="warn">APPEARANCE</MiniChip>}
            <span>{d.campaign.name} · {d.campaign.sponsorName} · {d.jobId} {d.jobName}</span>
          </span>
        }
        actions={<BackPill />}
      >
        {/* The figures, all from this one read: the clock, the versions, the checks. */}
        <ArenaTiles cols={d.checks ? 3 : 2}>
          {done ? (
            <ArenaTile label="Complete" value={d.assets.length} caption={`verified · was due ${fmt(d.dueDate)}`} tone="win" delay={0.1} />
          ) : days < 0 ? (
            <ArenaTile label="Days overdue" value={-days} caption={`was due ${fmt(d.dueDate)}`} tone={overdue ? "danger" : "warn"} delay={0.1} />
          ) : (
            <ArenaTile label="Days left" value={days} caption={`${dueLabel(d.dueDate, today)} · ${fmt(d.dueDate)}`} tone={days <= 2 ? "flare" : "blue"} delay={0.1} />
          )}
          <ArenaTile
            label="Versions uploaded"
            value={d.assets.length}
            caption={d.assets.length ? "BTG reviews the latest" : "nothing uploaded yet"}
            tone={d.assets.length ? "blue" : "ink"}
            delay={0.16}
          />
          {d.checks && (
            <ArenaTile
              label="Checks passed"
              value={checksOk}
              caption={`of ${d.checks.length} automatic checks`}
              tone={checksOk === d.checks.length ? "win" : "warn"}
              share={d.checks.length ? checksOk / d.checks.length : undefined}
              delay={0.22}
            />
          )}
        </ArenaTiles>
      </ArenaHead>

      {d.revision && d.revision.by === "SYSTEM" ? (
        /* P5-BE-09 — the automatic checks sent it back: each failure in
           words. It hasn't gone to BTG; fixing these and resubmitting does. */
        <ArenaPanel tone="danger" delay={0.28}>
          <p className="text-xs font-semibold text-danger">Fix before review</p>
          <p className="mt-1 text-xs leading-relaxed text-text">
            Your draft didn&rsquo;t pass our automatic checks, so it hasn&rsquo;t gone to BTG yet:
          </p>
          <ul className="mt-2 space-y-1">
            {(d.revision.failed ?? d.revision.reason.split("\n")).map((f) => (
              <li key={f} className="flex items-start gap-2 text-xs leading-relaxed text-text">
                <span aria-hidden="true" className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-danger/15 text-[10px] font-bold text-danger">!</span>
                <span className="min-w-0 flex-1">{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-faint">
            Checked {fmt(d.revision.at)} · fix these and submit again below
          </p>
        </ArenaPanel>
      ) : d.revision ? (
        <ArenaPanel tone="danger" delay={0.28}>
          <p className="text-xs font-semibold text-danger">Changes requested</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-text">{d.revision.reason}</p>
          <p className="mt-2 text-[10px] text-faint">
            Asked {fmt(d.revision.at)} · {d.checks ? "make the change and resubmit below" : "upload a new version to answer it"}
          </p>
        </ArenaPanel>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section className="min-w-0">
          <ArenaSection
            title="Versions"
            hint={d.assets.length ? `${d.assets.length} uploaded — BTG reviews the latest` : "nothing uploaded yet"}
            delay={0.32}
          />
          <ArenaPanel flush delay={0.36} className="pl-2">
            {d.assets.length === 0 ? (
              <p className="px-5 py-6 text-center text-xs text-muted">
                {d.appearance
                  ? "Upload a photo or short video from the appearance as proof."
                  : "Your first upload goes to BTG for review."}
              </p>
            ) : (
              <ul>
                {d.assets.map((a, i) => (
                  <li key={a.version} className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5 text-xs last:border-0">
                    <span className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-athlete/25 bg-athlete/10">
                        <span className="sx-arena-num text-sm text-athlete">v{a.version}</span>
                      </span>
                      <span className="font-medium">
                        Version {a.version}
                        {i === 0 && <ArenaChip tone="blue">latest</ArenaChip>}
                      </span>
                    </span>
                    <span className="text-[11px] text-faint">{fmt(a.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </ArenaPanel>
          {d.publishedUrl && (
            <p className="mt-3 text-[11px] text-muted">
              Live at{" "}
              <a href={d.publishedUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-athlete underline underline-offset-2">
                {d.publishedUrl}
              </a>
            </p>
          )}
        </section>

        <ArenaPanel tone={canUpload ? "flare" : d.state === "APPROVED" && isAthlete ? "win" : "blue"} delay={0.4} spot>
          {canUpload ? (
            <>
              <ArenaSection title={d.revision ? "Upload the revised version" : d.appearance ? "Upload proof" : "Upload your draft"} />
              <DeliverableUpload
                deliverableId={d.id}
                firstUpload={d.state === "NOT_STARTED"}
                label={d.appearance ? "Choose a photo or video from the appearance" : "Choose your draft"}
                presign={presignUpload}
                register={registerUpload}
                submit={submitDraft}
                captioned
                requiredDisclosures={d.requiredDisclosures ?? []}
                initialCaption={d.caption ?? ""}
                canResubmitAsIs={Boolean(d.revision) && d.assets.length > 0}
              />
            </>
          ) : d.state === "APPROVED" && isAthlete ? (
            <>
              <ArenaSection title="Publish it" />
              <p className="mb-3 text-[11px] leading-relaxed text-muted">
                Approved — post it with the disclosure BTG gave you, then paste
                the link here.
              </p>
              <PublishProof deliverableId={d.id} publish={markPublished} />
            </>
          ) : (
            <>
              <ArenaSection title="Where it stands" />
              {/* P5-BE-10 — where the submitted draft went: straight to the
                  sponsor (it skipped BTG's review), or to BTG first. */}
              {route && (
                <div className="mb-2">
                  <Badge tone={route.on === "sponsor" ? "accent" : "neutral"}>{route.label}</Badge>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{route.hint}</p>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-muted">
                {step.on === "btg" && "It's with BTG — you'll be told the moment it moves."}
                {step.on === "sponsor" && "The sponsor is reviewing it."}
                {step.on === "done" && "Verified — this deliverable is complete."}
                {step.on === "you" && "Only the athlete can act on this deliverable."}
              </p>
              {/* P5-BE-09 — what was submitted, and that it passed the checks. */}
              {d.caption && (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[11px] leading-relaxed text-text">
                  {d.caption}
                </p>
              )}
              {d.checks && d.checks.every((c) => c.ok) && (
                <p className="mt-2 text-[10px] leading-relaxed text-faint">Passed the automatic checks.</p>
              )}
            </>
          )}
        </ArenaPanel>
      </div>
    </div>
  );
}
