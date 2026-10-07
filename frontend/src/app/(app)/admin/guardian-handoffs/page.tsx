import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { Badge } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  HANDOFF_TABS, handoffTab, settingBanner, stepBadge, type ApiHandoffDesk, type HandoffGroup,
} from "@/lib/guardian-handoffs-desk-live";
import { apiListQuery, type SearchParams } from "@/lib/list-query";
import { dayOf } from "@/lib/new-signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Guardian handoffs — 2S1-FE-10, BTG half (Claude Design
   GuardianHandoffs.dc.html, states HO-1 list on, HO-1-phone, HO-2 list off,
   HO-9 empty). A new guardian asks to take over a minor's account and the
   current guardian hands off. BTG has a step only when "BTG staff confirm
   minors" is on: a handed-off request then waits here (Waiting for BTG).
   With it off the desk is a record. Disputes come in through support.

   P1-FE-31 (2026-10-07): one SERVER-PAGED table per tab (the house pager)
   in place of "the latest 100".

   Reads  GET /signup-rules/settings                        { staffConfirmMinors } (the banner)
          GET /guardian-handoffs?group=…&page&size          one tab's page, with every tab's count (2S1-BE-15)
   Writes none here — each row opens /admin/guardian-handoffs/:id.
   BTG admins and super admins (guardianHandoff read is tenant-wide for
   them); ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/guardian-handoffs";
const TITLE = "Guardian handoffs";
const EMPTY_COUNTS: Record<HandoffGroup, number> = { WAITING_FOR_BTG: 0, IN_PROGRESS: 0, SWITCHED: 0, DECLINED: 0, CANCELLED: 0 };

async function readDesk(sp: SearchParams, group: HandoffGroup): Promise<ApiHandoffDesk> {
  const res = await apiFetch(`/guardian-handoffs${apiListQuery(sp, { group })}`);
  if (!res.ok) throw new Error(`Guardian handoffs unavailable (${res.status}).`);
  return (await res.json()) as ApiHandoffDesk;
}

const COLUMNS: Column[] = [
  { key: "athlete", label: "Athlete" },
  { key: "current", label: "Current guardian" },
  { key: "new", label: "New guardian" },
  { key: "step", label: "Step" },
  { key: "asked", label: "Asked" },
  { key: "action", label: "Open", srOnly: true },
];

export default async function GuardianHandoffsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const raw = sp.tab;
  const empty = demo === "empty";

  const settingsRes = await apiFetch("/signup-rules/settings");
  const staffConfirmMinors = settingsRes.ok ? ((await settingsRes.json()) as { staffConfirmMinors: boolean }).staffConfirmMinors : null;
  let tab = handoffTab(raw, { staffConfirmMinors });
  let desk: ApiHandoffDesk = empty ? { handoffs: [], counts: EMPTY_COUNTS } : await readDesk(sp, tab.group);
  /* With the setting off the desk opens on Switched — unless something still waits for BTG (it was handed off while the setting was on). */
  if (!empty && !raw && staffConfirmMinors === false && desk.counts.WAITING_FOR_BTG > 0) {
    tab = handoffTab(raw, { staffConfirmMinors, waiting: desk.counts.WAITING_FOR_BTG });
    desk = await readDesk(sp, tab.group);
  }
  const rows = desk.handoffs;
  const page = desk.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };
  const banner = settingBanner(staffConfirmMinors);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          A new guardian asks to take over a minor&rsquo;s account, and the current guardian hands off. Disputes aren&rsquo;t decided here; they come in through support.
        </p>
      </div>

      <p role="status"
        className={`flex flex-wrap items-center gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-normal ${banner.on ? "border-warn/45 bg-warn/8" : "border-line bg-surface"}`}>
        <strong className={`min-w-0 flex-1 basis-60 font-semibold ${banner.on ? "text-warn" : "text-text"}`}>{banner.text}</strong>
        <Link href="/admin/new-signups/rules" className="text-xs font-semibold text-primary-soft hover:underline">Change in Sign-up rules →</Link>
      </p>

      <TabStrip label="Handoff state">
        {HANDOFF_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={desk.counts[t.group]} hot={t.group === "WAITING_FOR_BTG"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={tab.empty[0]} hint={tab.empty[1]} />
      ) : (
        <PagedTable page={page} noun="Handoffs" label={`${tab.label} guardian handoffs`} columns={COLUMNS}>
          {rows.map((h, i) => {
            const b = stepBadge(h);
            const yours = h.state === "HANDED_OFF";
            return (
              <Tr key={h.id} i={i} tone={yours ? "warn" : undefined}>
                <Td><Primary>{h.athlete.name}</Primary></Td>
                <Td label="From">{h.current.name}</Td>
                <Td label="To">{h.requester.name}<span className="block text-[11px] text-muted">{h.requester.relationship}</span></Td>
                <Td label="Step"><Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{b.label}</Badge></Td>
                <Td label="Asked" muted>{dayOf(h.requestedAt)}</Td>
                <Td act>
                  <Link href={`${PATH}/${h.id}`} aria-label={`Open ${h.athlete.name}`}
                    className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3.5 text-xs font-semibold ${yours ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}>
                    Open →
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
