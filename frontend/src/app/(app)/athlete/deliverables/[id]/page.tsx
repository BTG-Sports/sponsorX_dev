import { notFound } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { DeliverableUpload, PublishProof } from "@/components/deliverable-upload";
import {
  dueLabel,
  isOverdue,
  nextStep,
  type ApiDeliverableDetail,
} from "@/lib/deliverables-live";
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
   -------------------------------------------------------------------------- */

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function DeliverablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const back = { href: "/athlete/deliverables", label: "Back to deliverables" };

  const who = await fetchActor();
  const isAthlete = who.status === "linked" && who.actor.roles.includes("ATHLETE");
  const isGuardian = who.status === "linked" && who.actor.roles.includes("GUARDIAN");
  if (!isAthlete && !isGuardian) {
    return (
      <div className="space-y-4">
        <BackLink target={back} />
        <Card>
          <p className="text-sm font-medium">Sign in as the athlete to open a deliverable</p>
          <p className="mt-1 text-xs text-muted">The calendar shows a demo in the meantime.</p>
        </Card>
      </div>
    );
  }

  const res = await apiFetch(`/deliverables/${encodeURIComponent(id)}`);
  if (res.status === 403) notFound();
  if (!res.ok) throw new Error(`Deliverable unavailable (${res.status}).`);
  const d = (await res.json()) as ApiDeliverableDetail;

  const today = new Date();
  const step = nextStep(d);
  const overdue = isOverdue(d, today);
  const canUpload = isAthlete && (d.state === "NOT_STARTED" || Boolean(d.revision));

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{d.title}</h1>
            {d.appearance && <MiniChip kind="warn">APPEARANCE</MiniChip>}
            <Badge tone={step.tone}>{step.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {d.campaign.name} · {d.campaign.sponsorName} · {d.jobId} {d.jobName}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted">Due</p>
          <p className="text-sm font-semibold">{fmt(d.dueDate)}</p>
          <p className={`text-[11px] ${overdue ? "font-medium text-danger" : "text-faint"}`}>
            {step.on === "done" ? "complete" : dueLabel(d.dueDate, today)}
          </p>
        </div>
      </div>

      {d.revision && (
        <Card className="border-danger/30 bg-danger/5">
          <p className="text-xs font-semibold text-danger">Changes requested</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-text">{d.revision.reason}</p>
          <p className="mt-2 text-[10px] text-faint">
            Asked {fmt(d.revision.at)} · upload a new version to answer it
          </p>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section className="min-w-0">
          <SectionHeading
            title="Versions"
            hint={d.assets.length ? `${d.assets.length} uploaded — BTG reviews the latest` : "nothing uploaded yet"}
          />
          <Card className="p-0">
            {d.assets.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">
                {d.appearance
                  ? "Upload a photo or short video from the appearance as proof."
                  : "Your first upload goes to BTG for review."}
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {d.assets.map((a, i) => (
                  <li key={a.version} className="flex items-center justify-between px-4 py-3 text-xs">
                    <span className="font-medium">
                      Version {a.version}
                      {i === 0 && <span className="ml-2 text-[10px] font-normal text-athlete">latest</span>}
                    </span>
                    <span className="text-[11px] text-faint">{fmt(a.uploadedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {d.publishedUrl && (
            <p className="mt-3 text-[11px] text-muted">
              Live at{" "}
              <a href={d.publishedUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-athlete underline underline-offset-2">
                {d.publishedUrl}
              </a>
            </p>
          )}
        </section>

        <Card>
          {canUpload ? (
            <>
              <SectionHeading title={d.revision ? "Upload the revised version" : d.appearance ? "Upload proof" : "Upload your draft"} />
              <DeliverableUpload
                deliverableId={d.id}
                firstUpload={d.state === "NOT_STARTED"}
                label={d.appearance ? "Choose a photo or video from the appearance" : "Choose your draft"}
                presign={presignUpload}
                register={registerUpload}
                submit={submitDraft}
              />
            </>
          ) : d.state === "APPROVED" && isAthlete ? (
            <>
              <SectionHeading title="Publish it" />
              <p className="mb-3 text-[11px] leading-relaxed text-muted">
                Approved — post it with the disclosure BTG gave you, then paste
                the link here.
              </p>
              <PublishProof deliverableId={d.id} publish={markPublished} />
            </>
          ) : (
            <>
              <SectionHeading title="Where it stands" />
              <p className="text-[11px] leading-relaxed text-muted">
                {step.on === "btg" && "It's with BTG — you'll be told the moment it moves."}
                {step.on === "sponsor" && "The sponsor is reviewing it."}
                {step.on === "done" && "Verified — this deliverable is complete."}
                {step.on === "you" && "Only the athlete can act on this deliverable."}
              </p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
