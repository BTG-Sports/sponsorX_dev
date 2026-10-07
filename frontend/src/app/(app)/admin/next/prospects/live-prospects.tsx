import { Badge, Card, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { ProspectDecision } from "@/components/prospect-decision";
import { PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { STUDENT_CATEGORIES } from "@/lib/students-live";
import {
  PROSPECT_DESK_VIEWS,
  PROSPECT_STATE_WORDS,
  REJECTION_REASONS,
  decidedBy,
  type ApiDeskProspect,
  type ProspectDeskPage,
  type ProspectDeskView,
} from "@/lib/prospects-live";
import { ViewTabs } from "./view-tabs";

/* --------------------------------------------------------------------------
   P9-FE-11 — BTG and Sales's prospect desk on GET /prospects (P9-BE-21).
   Held prospects by default, each with the reasons the system held it; the
   ones it decided carry a "Decided automatically" badge. Only the deciders
   read this — a student never sees why their prospect was held.
   -------------------------------------------------------------------------- */

const CATEGORY = Object.fromEntries(STUDENT_CATEGORIES);
const REASON = Object.fromEntries(REJECTION_REASONS);
const label = (c: string) => CATEGORY[c] ?? c.replace(/_/g, " ").toLowerCase();
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function ProspectRow({ p }: { p: ApiDeskProspect }) {
  const who = decidedBy(p);
  return (
    <Card className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="break-words text-sm font-medium">{p.businessName}</p>
        <p className="mt-1 break-words text-xs text-muted">
          {label(p.category)} · brought in by {p.student.displayName}, {p.student.property.name} · {fmt(p.createdAt)}
        </p>
        {p.reviewReasons.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-xs text-warn">
            {p.reviewReasons.map((r) => (
              <li key={r} className="break-words">
                Held: {r}
              </li>
            ))}
          </ul>
        )}
        {p.state === "REJECTED" && p.reasonCode && (
          <p className="mt-1 text-xs text-muted">Reason given: {REASON[p.reasonCode] ?? p.reasonCode.replace(/_/g, " ").toLowerCase()}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-1.5">
          <Badge tone={p.state === "ACCEPTED" ? "accent" : p.state === "REJECTED" ? "danger" : "warn"}>{PROSPECT_STATE_WORDS[p.state]}</Badge>
          <Badge tone={who.tone}>{who.label}</Badge>
        </div>
        {p.state === "SUBMITTED" && <ProspectDecision prospectId={p.id} />}
      </div>
    </Card>
  );
}

export function LiveProspectDesk({ desk, view }: { desk: ProspectDeskPage; view: ProspectDeskView }) {
  const sec = PROSPECT_DESK_VIEWS.find((v) => v.value === view)!;
  return (
    <ServerList>
      <div className="space-y-6">
        <div>
          <h1 className="sx-page-title">
            Student prospects{" "}
            <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-transparent">· SponsorX NEXT</span>
          </h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Businesses students bring in are decided automatically: refused when another sponsor holds the category, accepted when
            nothing is in the way. The rest wait here with the reason.
          </p>
        </div>
        <section className="min-w-0 space-y-3">
          <SectionHeading title={`${sec.label} · ${desk.page.total}`} hint={sec.hint} />
          <ViewTabs view={view} counts={desk.summary} />
          {desk.page.total === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">
              {view === "held" ? "Nothing is waiting on you — every prospect was decided automatically." : "No prospects here yet."}
            </p>
          ) : (
            <>
              <PagerRow page={desk.page} noun="Prospects" tone="next" position="top" filtered={view !== "held"} />
              <PendingList className="space-y-3">
                {desk.prospects.map((p) => (
                  <ProspectRow key={p.id} p={p} />
                ))}
              </PendingList>
              <PagerRow page={desk.page} noun="Prospects" tone="next" position="bottom" filtered={view !== "held"} />
            </>
          )}
        </section>
        <p className="flex items-center gap-1.5 text-[10px] text-faint">
          Student prospects, your tenant <MiniChip kind="ver">POSTGRES</MiniChip>
        </p>
      </div>
    </ServerList>
  );
}
