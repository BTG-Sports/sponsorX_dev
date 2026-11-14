import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { OpenAttachment } from "@/components/support-message-attachments";
import { ProblemTags } from "@/components/problem-tags";
import { SupportReply } from "@/components/support-reply";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { dayOf, stamp } from "@/lib/order-automation-live";
import { fileKind, fileSize, stateWords } from "@/lib/support-message-live";
import { recordKind, statusBadge, type ApiSupportThread } from "@/lib/support-inbox-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   A support message — 2S1-FE-14. The support email links here when a
   message has attachments (2S0-SEC-01: the files never travel by mail).
   The sender, the topic, when it arrived, the text, and each file as a
   stage-table row with an Open button that fetches its five-minute link.

   Reads GET /support-messages/:id   BTG admin (own tenant) and SUPER_ADMIN.
   A message outside the caller's books is 403 from the API — shown as
   "No support message matches this link".

   POL-FE-41 — the message is answered here: its status, the cases ticked
   (POL-BE-43), the account it came from, BTG's earlier replies, the reply
   box and "Mark closed", and "This person on SponsorX": what the sender has
   on SponsorX, held records first, each tagged with what is wrong
   (POL-BE-42) and linked to its review page. The inbox is /admin/support.
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
          hint="The message may be in another tenant’s books, or the link is old." action={{ label: "Back to Support", href: PATH }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Support message unavailable (${res.status}).`);
  const m = (await res.json()) as ApiSupportThread;
  const state = stateWords(m);
  const status = statusBadge(m.status);
  const records = m.sender?.records ?? [];

  const columns: Column[] = [
    { key: "file", label: "File" },
    { key: "type", label: "Type" },
    { key: "size", label: "Size", num: true },
    { key: "arrived", label: "Arrived" },
    { key: "action", label: "Open", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <Link href={PATH} className="text-xs text-muted hover:text-text">← Support</Link>

      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 text-xs text-muted">
          From <span className="font-medium text-text">{m.name}</span> · <a href={`mailto:${m.email}`} className="text-accent hover:text-accent-soft">{m.email}</a> · {stamp(m.createdAt)}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone="primary">{m.topicLabel}</Badge>
          {m.state !== "QUEUED" && <Badge tone={state.tone}>{state.label}</Badge>}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {m.cases.length > 0 && (
            <section>
              <SectionHeading title={`Cases ticked · ${m.cases.length}`} hint="What the sender picked on the help desk form, in today’s wording." />
              <Card>
                <ul className="space-y-1.5 text-sm">
                  {m.cases.map((c) => (
                    <li key={c.id} className="flex gap-2">
                      <span className="shrink-0 font-mono text-[11px] leading-5 text-muted">{c.id}</span>
                      <span>{c.retired ? <span className="text-muted">A case no longer on the form</span> : c.text}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}

          <section>
            <SectionHeading title="Message" />
            <Card>
              {m.message.trim()
                ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.message}</p>
                : <p className="text-xs text-muted">No text — the sender only ticked the cases above.</p>}
            </Card>
          </section>

          <section>
            <SectionHeading title={`Replies · ${m.replies.length}`} hint="Each was emailed to the sender from noreply@sponsorx.net." />
            {m.replies.length > 0 && (
              <ol className="mb-3 space-y-3">
                {m.replies.map((r) => (
                  <li key={r.id}>
                    <Card>
                      <p className="mb-1.5 text-[11px] text-muted">BTG · {stamp(r.createdAt)}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.body}</p>
                    </Card>
                  </li>
                ))}
              </ol>
            )}
            <Card>
              <SupportReply messageId={m.id} email={m.email} status={m.status} ready={m.state === "QUEUED"} />
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

        <aside className="space-y-6">
          <Card>
            <SectionHeading title="This person on SponsorX" hint={records.length ? `Found by ${m.email}.${m.sender.held ? ` ${m.sender.held} waiting on BTG.` : ""}` : undefined} />
            {records.length === 0 ? (
              <p className="text-xs text-muted">Nothing on SponsorX uses {m.email}.</p>
            ) : (
              <ul className="space-y-3">
                {records.map((r) => (
                  <li key={`${r.kind}-${r.id}-${r.relation}`} className="space-y-1.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
                    <p className="text-[11px] text-muted">{recordKind(r)}{r.held && <span className="ml-1.5 align-middle"><Badge tone="warn">Waiting on BTG</Badge></span>}</p>
                    <p className="text-sm font-medium">
                      {r.adminPath ? <Link href={r.adminPath} className="text-accent hover:text-accent-soft">{r.label} →</Link> : r.label}
                    </p>
                    <ProblemTags problems={r.problems ?? []} />
                    {!r.emailConfirmed && !(r.problems ?? []).some((p) => p.type === "EMAIL_NOT_CONFIRMED") && (
                      <p className="text-[11px] text-warn">Email not confirmed yet.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeading title="Facts" />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted">Status</dt><dd>{status.label}{m.status === "ANSWERED" && m.answeredAt ? ` · ${stamp(m.answeredAt)}` : ""}{m.status === "CLOSED" && m.closedAt ? ` · ${stamp(m.closedAt)}` : ""}</dd>
              <dt className="text-muted">Topic</dt><dd>{m.topicLabel}</dd>
              <dt className="text-muted">Signed in as</dt><dd className="break-all">{m.account ? m.account.email : "Not signed in"}</dd>
              <dt className="text-muted">Received</dt><dd>{stamp(m.createdAt)}</dd>
              <dt className="text-muted">Reached the inbox</dt><dd>{m.queuedAt ? stamp(m.queuedAt) : "Not yet"}</dd>
              <dt className="text-muted">Message id</dt><dd className="break-all font-mono text-[11px]">{m.id}</dd>
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
