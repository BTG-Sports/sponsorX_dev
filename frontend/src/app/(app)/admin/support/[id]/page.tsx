import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { OpenAttachment } from "@/components/support-message-attachments";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { dayOf, stamp } from "@/lib/order-automation-live";
import { fileKind, fileSize, stateWords, type ApiSupportMessage } from "@/lib/support-message-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   A support message — 2S1-FE-14. The support email links here when a
   message has attachments (2S0-SEC-01: the files never travel by mail).
   The sender, the topic, when it arrived, the text, and each file as a
   stage-table row with an Open button that fetches its five-minute link.

   Reads GET /support-messages/:id   BTG admin (own tenant) and SUPER_ADMIN.
   A message outside the caller's books is 403 from the API — shown as
   "No support message matches this link". No nav entry.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/support";
const TITLE = "Support message";

export default async function SupportMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const res = await apiFetch(`/support-messages/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="inbox" title="No support message matches this link"
          hint="The message may be in another tenant’s books, or the link is old. The text itself is in the support mailbox." action={{ label: "Back to the Operations Board", href: "/admin" }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Support message unavailable (${res.status}).`);
  const m = (await res.json()) as ApiSupportMessage;
  const state = stateWords(m);

  const columns: Column[] = [
    { key: "file", label: "File" },
    { key: "type", label: "Type" },
    { key: "size", label: "Size", num: true },
    { key: "arrived", label: "Arrived" },
    { key: "action", label: "Open", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-xs text-muted hover:text-text">← Operations Board</Link>

      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">
          From <span className="font-medium text-text">{m.name}</span> · <a href={`mailto:${m.email}`} className="text-accent hover:text-accent-soft">{m.email}</a> · {stamp(m.createdAt)}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone="primary">{m.topicLabel}</Badge>
          <Badge tone={state.tone}>{state.label}</Badge>
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section>
            <SectionHeading title="Message" />
            <Card>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.message}</p>
            </Card>
          </section>

          <section>
            <SectionHeading title={`Attachments · ${m.attachments.length}`} hint="Each file opens through its own five-minute, audited link, in a new tab." />
            {m.attachments.length === 0 ? (
              <Card><p className="text-xs text-muted">No files were attached to this message.</p></Card>
            ) : (
              <StageTable label="Attachments" columns={columns}>
                {m.attachments.map((a, i) => (
                  <Tr key={a.id} i={i} tone={a.arrived ? undefined : "warn"}>
                    <Td><span className="block min-w-0 break-all text-[13px] font-semibold">{a.filename}</span></Td>
                    <Td label="Type" muted>{fileKind(a.contentType)}</Td>
                    <Td label="Size" num className="tabular-nums">{fileSize(a.bytes)}</Td>
                    <Td label="Arrived" muted>{a.uploadedAt ? dayOf(a.uploadedAt) : <span className="text-warn">Never finished uploading</span>}</Td>
                    <Td act><OpenAttachment messageId={m.id} attachment={a} /></Td>
                  </Tr>
                ))}
              </StageTable>
            )}
          </section>
        </div>

        <aside>
          <Card>
            <SectionHeading title="Facts" />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted">Topic</dt><dd>{m.topicLabel}</dd>
              <dt className="text-muted">Received</dt><dd>{stamp(m.createdAt)}</dd>
              <dt className="text-muted">Sent to support</dt><dd>{m.queuedAt ? stamp(m.queuedAt) : "Not yet"}</dd>
              <dt className="text-muted">Message id</dt><dd className="break-all font-mono text-[11px]">{m.id}</dd>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
