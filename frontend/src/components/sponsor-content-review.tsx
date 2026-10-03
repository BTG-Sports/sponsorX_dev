"use client";

import { Badge, Card } from "@/components/ui";
import { Decisions, OpenFile } from "@/components/edition-artwork";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import { waitingBadge } from "@/lib/content-checks";

/* --------------------------------------------------------------------------
   P4-FE-08 (P5-BE-09) — the sponsor's content review: athlete content BTG has
   sent for the sponsor's sign-off, on the campaign page. Each shows the
   caption the athlete will post and how long it has waited for the sponsor
   (after 48 hours the sponsor's admins are reminded, once). Approve, or ask
   for changes — the API's matrix decides who may (SPONSOR_ADMIN; an analyst
   sees the list and decides nothing).
   -------------------------------------------------------------------------- */

type Result = { ok: true; state: string } | { ok: false; message: string };
type LinkResult = { ok: true; url: string } | { ok: false; message: string };
type Move = "approve" | "revision";

const LABELS: Record<Move, string> = { approve: "Approve", revision: "Ask for changes" };

export function SponsorContentReview({
  items,
  now,
  canDecide,
  act,
  link,
}: {
  items: ApiDeliverable[];
  now: number;
  canDecide: boolean;
  act: (id: string, kind: Move, note?: string) => Promise<Result>;
  link: (id: string, version: number) => Promise<LinkResult>;
}) {
  const at = new Date(now);
  return (
    <ul className="space-y-3">
      {items.map((d) => {
        const wait = waitingBadge(d.waitingSince, at);
        const version = d.latestAsset?.version ?? null;
        return (
          <li key={d.id}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold [overflow-wrap:anywhere]">{d.title}</p>
                  <p className="text-[11px] text-muted [overflow-wrap:anywhere]">
                    {d.athlete.displayName} · {d.jobName}
                    {version ? ` · v${version}` : ""}
                  </p>
                </div>
                {wait && <Badge tone={wait.late ? "warn" : "neutral"}>{wait.label}</Badge>}
              </div>
              <p className="mt-3 text-[11px] font-medium text-muted">Caption they&rsquo;ll post</p>
              {d.caption ? (
                <p className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs leading-relaxed text-text">
                  {d.caption}
                </p>
              ) : (
                <p className="mt-1 text-xs text-faint">No caption was submitted with this draft.</p>
              )}
              {version !== null && (
                <div className="mt-2">
                  <OpenFile id={d.id} version={version} link={(id) => link(id, version)} />
                </div>
              )}
              <Decisions<Move>
                id={d.id}
                moves={canDecide ? ["approve", "revision"] : []}
                labels={LABELS}
                act={act}
                noteHint="The athlete gets these words exactly."
                done={(k) => (k === "approve" ? "Approved — the athlete has been told they can post it." : "Sent back with your notes — the athlete has been told.")}
              />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
