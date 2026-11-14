import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { Badge } from "@/components/ui";
import { apiListQuery } from "@/lib/list-query";
import { stamp } from "@/lib/order-automation-live";
import {
  SUPPORT_PATH, SUPPORT_TABS, SUPPORT_TOPICS, caseParam, casesSummary, emptyInboxTitle, statusBadge, supportTab, topicParam,
  type ApiSupportInbox,
} from "@/lib/support-inbox-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Support — POL-FE-41. BTG's inbox for the contact form and help desk:
   one tab per status (New, Answered, Closed) with the API's counts, a
   server-paged table (12 / 24 / 60), and a filter by topic or case.
   A row is who wrote, the topic, the cases they ticked, whether they were
   signed in, when, and how many files and replies — the text is read on
   the message. BTG admin (own tenant) and SUPER_ADMIN.

   Reads  GET /support-messages?status&topic&case&page&size   the tab's page + every count
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "Support";

export default async function SupportInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(SUPPORT_PATH);
  if (lacking) return <NotInRole path={SUPPORT_PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tab = supportTab(sp.tab);
  const topic = topicParam(sp.topic);
  const kase = caseParam(sp.case);
  const filtered = !!(topic || kase);
  const res = await apiFetch(`/support-messages${apiListQuery(sp, { status: tab.status, topic, case: kase })}`);
  if (res.status === 403) return <NotInRole path={SUPPORT_PATH} title={TITLE} roles={["BTG_ADMIN"]} />;
  if (!res.ok) throw new Error(`Support inbox unavailable (${res.status}).`);
  const list = (await res.json()) as ApiSupportInbox;
  const page = list.page ?? { page: 1, size: list.messages.length || 12, total: list.messages.length, pages: 1 };
  /* Tabs keep the filter; the filter keeps the tab. */
  const keep = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(topic ? { topic } : {}), ...(kase ? { case: kase } : {}), ...extra });
    return `${SUPPORT_PATH}?${u}`;
  };

  const whenLabel = tab.status === "NEW" ? "Received" : tab.status === "ANSWERED" ? "Answered" : "Closed";
  const columns: Column[] = [
    { key: "from", label: "From" },
    { key: "topic", label: "Topic" },
    { key: "cases", label: "Cases ticked" },
    { key: "when", label: whenLabel },
    { key: "files", label: "Files · replies", num: true },
    { key: "action", label: "Open", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">
          Messages from the contact form and help desk. Reply here: the reply is kept with the message and emailed from noreply@sponsorx.net.
        </p>
      </div>

      <TabStrip label="Message status">
        {SUPPORT_TABS.map((t) => (
          <TabLink key={t.key} href={keep({ tab: t.key })} on={t.key === tab.key} count={list.counts[t.status]} hot={t.status === "NEW"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      <form method="get" action={SUPPORT_PATH} className="flex flex-wrap items-end gap-3 text-xs" aria-label="Filter messages">
        <input type="hidden" name="tab" value={tab.key} />
        <label className="flex flex-col gap-1">
          <span className="text-muted">Topic</span>
          <select name="topic" defaultValue={topic} className="min-h-9 rounded-lg border border-line bg-surface-2 px-2.5">
            <option value="">Any topic</option>
            {SUPPORT_TOPICS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Case</span>
          <input name="case" defaultValue={kase} placeholder="e.g. ACC-30" maxLength={6} className="min-h-9 w-28 rounded-lg border border-line bg-surface-2 px-2.5 uppercase placeholder:normal-case" />
        </label>
        <button type="submit" className="min-h-9 rounded-lg border border-line px-3.5 font-semibold hover:bg-surface-2">Filter</button>
        {filtered && <Link href={`${SUPPORT_PATH}?tab=${tab.key}`} className="min-h-9 content-center text-muted hover:text-text">Clear</Link>}
      </form>

      {list.messages.length === 0 ? (
        <EmptyState mark="inbox" title={emptyInboxTitle(tab.status, filtered)} hint={tab.status === "NEW" && !filtered ? "New messages appear here as people send the contact form." : ""} />
      ) : (
        <PagedTable page={page} noun="Messages" filtered={filtered} label={`${tab.label} support messages`} columns={columns}>
          {list.messages.map((m, i) => {
            const when = tab.status === "NEW" ? m.createdAt : tab.status === "ANSWERED" ? m.answeredAt ?? m.createdAt : m.closedAt ?? m.createdAt;
            const badge = statusBadge(m.status);
            return (
              <Tr key={m.id} i={i}>
                <Td><Primary sub={m.email}>{m.name}{m.signedIn && <span className="ml-1.5 align-middle"><Badge tone="primary">signed in</Badge></span>}</Primary></Td>
                <Td label="Topic" muted>{m.topicLabel}</Td>
                <Td label="Cases ticked" muted><span className="line-clamp-2 min-w-0 break-words" title={m.cases.map((c) => `${c.id} ${c.text ?? "(retired)"}`).join("\n")}>{casesSummary(m.cases)}</span></Td>
                <Td label={whenLabel} muted>{stamp(when)}{tab.status !== "NEW" && <span className="sr-only"> · {badge.label}</span>}</Td>
                <Td label="Files · replies" num className="tabular-nums">{m.attachments} · {m.replies}</Td>
                <Td act>
                  <Link href={`${SUPPORT_PATH}/${m.id}`} aria-label={`Open the message from ${m.name}`} className="font-medium text-primary hover:underline">
                    {tab.status === "NEW" ? "Read →" : "Open →"}
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
