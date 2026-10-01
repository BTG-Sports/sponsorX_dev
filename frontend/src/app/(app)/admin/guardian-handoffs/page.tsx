import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  DESK_PAGE, HANDOFF_TABS, handoffTab, settingBanner, stepBadge, type ApiHandoffDesk, type HandoffGroup,
} from "@/lib/guardian-handoffs-desk-live";
import { dayOf } from "@/lib/new-signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Guardian handoffs — 2S1-FE-10, BTG half (Claude Design
   GuardianHandoffs.dc.html, states HO-1 list on, HO-1-phone, HO-2 list off,
   HO-9 empty). A new guardian asks to take over a minor's account and the
   current guardian hands off. BTG has a step only when "BTG staff confirm
   minors" is on: a handed-off request then waits here (Waiting for BTG).
   With it off the desk is a record. Disputes come in through support.

   Reads  GET /signup-rules/settings                      { staffConfirmMinors } (the banner)
          GET /guardian-handoffs?group=…                  one tab, with every tab's count (2S1-BE-15)
   Writes none here — each row opens /admin/guardian-handoffs/:id.
   BTG admins and super admins (guardianHandoff read is tenant-wide for
   them); ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/guardian-handoffs";
const TITLE = "Guardian handoffs";
const COLS = "md:grid-cols-[1.2fr_1.1fr_1.2fr_1.5fr_5rem_6rem]";
const EMPTY_COUNTS: Record<HandoffGroup, number> = { WAITING_FOR_BTG: 0, IN_PROGRESS: 0, SWITCHED: 0, DECLINED: 0, CANCELLED: 0 };

async function readDesk(group: HandoffGroup): Promise<ApiHandoffDesk> {
  const res = await apiFetch(`/guardian-handoffs?group=${group}`);
  if (!res.ok) throw new Error(`Guardian handoffs unavailable (${res.status}).`);
  return (await res.json()) as ApiHandoffDesk;
}

export default async function GuardianHandoffsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const raw = (await searchParams).tab;
  const empty = demo === "empty";

  const settingsRes = await apiFetch("/signup-rules/settings");
  const staffConfirmMinors = settingsRes.ok ? ((await settingsRes.json()) as { staffConfirmMinors: boolean }).staffConfirmMinors : null;
  let tab = handoffTab(raw, { staffConfirmMinors });
  let desk: ApiHandoffDesk = empty ? { handoffs: [], counts: EMPTY_COUNTS } : await readDesk(tab.group);
  /* With the setting off the desk opens on Switched — unless something still waits for BTG (it was handed off while the setting was on). */
  if (!empty && !raw && staffConfirmMinors === false && desk.counts.WAITING_FOR_BTG > 0) {
    tab = handoffTab(raw, { staffConfirmMinors, waiting: desk.counts.WAITING_FOR_BTG });
    desk = await readDesk(tab.group);
  }
  const rows = desk.handoffs;
  const banner = settingBanner(staffConfirmMinors);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          A new guardian asks to take over a minor&rsquo;s account, and the current guardian hands off. Disputes aren&rsquo;t decided here; they come in through support.
        </p>
      </div>

      <p role="status"
        className={`flex flex-wrap items-center gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-normal ${banner.on ? "border-warn/45 bg-warn/8" : "border-line bg-surface"}`}>
        <strong className={`min-w-0 flex-1 basis-60 font-semibold ${banner.on ? "text-warn" : "text-text"}`}>{banner.text}</strong>
        <Link href="/admin/new-signups/rules" className="text-xs font-semibold text-primary-soft hover:underline">Change in Sign-up rules →</Link>
      </p>

      <nav aria-label="Handoff state" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 sm:w-fit">
        {HANDOFF_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = desk.counts[t.group];
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${t.group === "WAITING_FOR_BTG" && n ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={tab.empty[0]} hint={tab.empty[1]} />
      ) : (
        <div className="space-y-2.5">
          <Card className="overflow-hidden p-0">
            <section aria-label="Guardian handoffs">
              <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid ${COLS}`}>
                <span>Athlete</span><span>Current guardian</span><span>New guardian</span><span>Step</span><span>Asked</span><span className="sr-only">Action</span>
              </div>
              <ul className="divide-y divide-line-soft">
                {rows.map((h) => {
                  const b = stepBadge(h);
                  const yours = h.state === "HANDED_OFF";
                  return (
                    <li key={h.id} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-start ${COLS}`}>
                      <strong className="min-w-0 text-[13px] font-semibold">{h.athlete.name}</strong>
                      <span className="hidden md:block">{h.current.name}</span>
                      <span className="hidden md:block">{h.requester.name}<span className="block text-[11px] text-muted">{h.requester.relationship}</span></span>
                      <span><Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{b.label}</Badge></span>
                      <span className="hidden md:block">{dayOf(h.requestedAt)}</span>
                      <span className="text-muted md:hidden">
                        From {h.current.name} to {h.requester.name} ({h.requester.relationship}) · asked {dayOf(h.requestedAt)}
                      </span>
                      <span className="md:text-right">
                        <Link href={`${PATH}/${h.id}`} aria-label={`Open ${h.athlete.name}`}
                          className={`inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 text-xs font-semibold md:min-h-9 ${yours ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}>
                          Open →
                        </Link>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </Card>
          {desk.counts[tab.group] > rows.length && (
            <p className="text-[11px] text-faint">Showing the latest {DESK_PAGE} of {desk.counts[tab.group]}.</p>
          )}
        </div>
      )}
    </div>
  );
}
