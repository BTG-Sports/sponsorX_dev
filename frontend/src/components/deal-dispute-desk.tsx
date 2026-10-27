"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  getDealDisputeDocumentAction,
  openDealDisputeAction,
  resolveDealDisputeAction,
  type DocumentLink,
  type OpenResult,
} from "@/app/(app)/admin/deal-disputes/actions";
import { DialogError, NoteField, OrderDialog, btn } from "@/components/order-dialog";
import { Primary, StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { Badge, Card } from "@/components/ui";
import { useDialogFocus } from "@/components/use-dialog-focus";
import { useMounted } from "@/components/use-mounted";
import { VaultChip, VaultPanel, type VaultTone } from "@/components/vault-stage";
import {
  DEAL_DISPUTE_SOURCES,
  dealDisputeFacts,
  dealStateLabel,
  dealStateTone,
  outcomeWords,
  raisedByWords,
  sourceLabel,
  type ApiDealDispute,
  type ApiDealDisputeDocument,
  type DealDisputeOutcome,
  type DealDisputeSource,
} from "@/lib/deal-disputes-live";
import {
  documentKind,
  documentSub,
  linkLifeWords,
  openFormProblem,
  orderStateTone,
  orderStateWords,
  resolveNoteProblem,
  type OpenDisputeForm,
} from "@/lib/deal-dispute-desk";
import { agoLabel } from "@/lib/marketplace-ops-live";
import { dayOf, type Tone } from "@/lib/order-automation-live";

/* --------------------------------------------------------------------------
   P8-FE-05 — BTG's deal dispute desk, the pieces the admin desk and its
   Finance twin share:

   - DealDisputeTable  the list's rows (the page keeps the title, tiles and tabs)
   - DealDisputeDetail one dispute: the decision, the concern, what BTG asked
                       for, the documents, the facts
   - OpenDealDispute   "Raise a concern" — the form dialog, from the desk
                       (an order id typed in) or from a campaign's roster
                       drawer (the order known); openDealDisputeAction →
                       POST /orders/:id/disputes
   - ResolveDealDispute resume or cancel with a note; resolveDealDisputeAction
   - DealDisputeDocuments + Viewer: a document opens through a five-minute
                       link the API signs and records (getDealDisputeDocumentAction)
                       — fetched when opened, never before, never stored.

   `skin` picks the stage: "admin" (Mission Control: Badge, Card) or "vault"
   (the Finance portal: VaultChip, VaultPanel). `canManage` and
   `canOpenDocuments` come from the page's actor; Finance and campaign
   managers get the read-only words instead of buttons.
   -------------------------------------------------------------------------- */

export type Skin = "admin" | "vault";
export type OpenAction = (orderId: string, form: OpenDisputeForm) => Promise<OpenResult>;
export type ResolveAction = (id: string, outcome: DealDisputeOutcome, note: string) => Promise<{ ok: true } | { ok: false; message: string }>;
export type GetDocumentAction = (id: string, documentId: string) => Promise<DocumentLink>;

const CHIP: Record<Tone, VaultTone> = { warn: "you", primary: "info", accent: "good", danger: "late", neutral: "done" };
const MUTED: Record<Skin, string> = { admin: "text-muted", vault: "text-[color:var(--vault-muted)]" };
const LINK: Record<Skin, string> = { admin: "text-accent hover:text-accent-soft", vault: "text-[color:var(--vault-gold-hi)] hover:underline" };

const primarySmall =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-cta-ink hover:bg-primary-soft md:min-h-9 md:w-auto md:text-xs";
const quietSmall =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line px-3.5 text-sm font-medium text-text hover:bg-surface-2 md:min-h-9 md:w-auto md:text-xs";
const inputCls = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal text-text focus:border-primary/60 focus:outline-none";

/** A state word on either stage. */
export function DealChip({ skin, tone, children }: { skin: Skin; tone: Tone; children: ReactNode }) {
  return skin === "vault" ? <VaultChip tone={CHIP[tone]}>{children}</VaultChip> : <Badge tone={tone}>{children}</Badge>;
}

function Panel({ skin, children, className = "" }: { skin: Skin; children: ReactNode; className?: string }) {
  return skin === "vault" ? <VaultPanel className={className}>{children}</VaultPanel> : <Card className={className}>{children}</Card>;
}

/* ----------------------------------------------------------------- list */

const COLUMNS: Column[] = [
  { key: "athlete", label: "Athlete" },
  { key: "campaign", label: "Campaign · job" },
  { key: "raisedBy", label: "Raised by" },
  { key: "opened", label: "Opened" },
  { key: "documents", label: "Documents", num: true },
  { key: "state", label: "State" },
  { key: "action", label: "Action", srOnly: true },
];

/** The rows of one tab. `now` comes from the page so server and client print the same "ago". */
export function DealDisputeTable({ rows, base, skin, label, now }: { rows: ApiDealDispute[]; base: string; skin: Skin; label: string; now: number }) {
  return (
    <StageTable label={label} columns={COLUMNS}>
      {rows.map((d, i) => {
        const href = `${base}/${encodeURIComponent(d.id)}`;
        return (
          <Tr key={d.id} i={i} tone={d.state === "OPEN" ? "warn" : d.state === "DOCUMENTS_IN" ? "accent" : undefined}>
            <Td>
              <Link href={href} className="block hover:underline">
                <Primary sub={orderStateWords(d.orderState)}>{d.athleteName}</Primary>
              </Link>
            </Td>
            <Td label="Campaign · job" muted>
              {d.campaignName}
              <span className="block text-[11px]">{d.job}</span>
            </Td>
            <Td label="Raised by" muted>{raisedByWords(d)}</Td>
            <Td label="Opened" muted><span title={d.openedAt}>{agoLabel(d.openedAt, now)}</span></Td>
            <Td label="Documents" num className="tabular-nums">{d.documents.length}</Td>
            <Td label="State"><DealChip skin={skin} tone={dealStateTone(d.state)}>{dealStateLabel(d.state)}</DealChip></Td>
            <Td act>
              <Link href={href} aria-label={`Open ${d.athleteName}’s dispute`} className={quietSmall}>Open →</Link>
            </Td>
          </Tr>
        );
      })}
    </StageTable>
  );
}

/* --------------------------------------------------------------- detail */

export function DealDisputeDetail({
  dispute: d,
  skin,
  canManage,
  canOpenDocuments,
  resolve = resolveDealDisputeAction,
  getDocument = getDealDisputeDocumentAction,
}: {
  dispute: ApiDealDispute;
  skin: Skin;
  /** BTG admin: the Resolve button while the deal is paused. */
  canManage: boolean;
  /** BTG admin: the audited document links. */
  canOpenDocuments: boolean;
  resolve?: ResolveAction;
  getDocument?: GetDocumentAction;
}) {
  const muted = MUTED[skin];
  const facts = dealDisputeFacts(d);
  return (
    <div className="space-y-6">
      <Panel skin={skin} className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {d.paused ? (
          <>
            <p className="min-w-0 flex-1 text-xs leading-relaxed">
              <strong className="font-semibold">The deal is paused.</strong>{" "}
              <span className={muted}>
                {d.state === "OPEN"
                  ? "Nothing on the order moves and its earning is held until BTG resumes or cancels it. Waiting on the documents."
                  : `The documents are in (${d.documents.length === 1 ? "one file" : `${d.documents.length} files`}). A BTG admin resumes or cancels the deal.`}
              </span>
            </p>
            {canManage ? <ResolveDealDispute dispute={d} resolve={resolve} /> : <p className={`text-xs ${muted}`}>BTG admin decides these.</p>}
          </>
        ) : (
          <div className="min-w-0 flex-1 text-xs leading-relaxed">
            <p>
              <strong className="font-semibold">{d.state === "RESUMED" ? "BTG resumed the deal" : "BTG cancelled the deal"}</strong>
              {d.resolvedAt && <span className={muted}> · {dayOf(d.resolvedAt)}</span>}
            </p>
            <p className={`mt-1 ${muted}`}>{d.state === "RESUMED" ? "The order picked up where it left off and the held earning went back to where it was." : "The order is cancelled and the earning stays held."}</p>
            {d.resolutionNote && <blockquote className="mt-2 border-l-2 border-line pl-3 text-[13px] leading-relaxed [overflow-wrap:anywhere]">{d.resolutionNote}</blockquote>}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Panel skin={skin}>
            <h2 className="text-sm font-semibold">The concern</h2>
            <p className={`mt-1 text-[11px] ${muted}`}>Raised by {raisedByWords(d)}. The athlete reads this as written.</p>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">{d.reason}</p>
          </Panel>
          <Panel skin={skin}>
            <h2 className="text-sm font-semibold">What BTG asked for</h2>
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed [overflow-wrap:anywhere]">{d.documentsRequested}</p>
          </Panel>
          <DealDisputeDocuments id={d.id} documents={d.documents} skin={skin} canOpen={canOpenDocuments} getDocument={getDocument} />
        </div>

        <aside>
          <Panel skin={skin}>
            <h2 className="mb-3 text-sm font-semibold">Facts</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
              <div className="contents">
                <dt className={muted}>Order</dt>
                <dd className="min-w-0"><DealChip skin={skin} tone={orderStateTone(d.orderState)}>{orderStateWords(d.orderState)}</DealChip></dd>
              </div>
              {facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className={muted}>{f.label}</dt>
                  <dd className="min-w-0 break-words">{f.value}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className={muted}>Order id</dt>
                <dd className="min-w-0 break-all font-mono text-[11px]">{d.orderId}</dd>
              </div>
            </dl>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ open one */

export function OpenDealDispute({
  base,
  orderId,
  athleteName,
  open = openDealDisputeAction,
  label = "Open a dispute…",
  className = primarySmall,
}: {
  /** Where the new dispute's page lives ("/admin/deal-disputes"). */
  base: string;
  /** Known from a roster drawer; the desk's button asks for one. */
  orderId?: string;
  athleteName?: string;
  open?: OpenAction;
  label?: string;
  className?: string;
}) {
  const [on, setOn] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOn(true)} className={className}>{label}</button>
      {on && <OpenDialog base={base} orderId={orderId} athleteName={athleteName} open={open} onClose={() => setOn(false)} />}
    </>
  );
}

function OpenDialog({ base, orderId, athleteName, open, onClose }: { base: string; orderId?: string; athleteName?: string; open: OpenAction; onClose: () => void }) {
  const router = useRouter();
  const [order, setOrder] = useState(orderId ?? "");
  const [form, setForm] = useState<OpenDisputeForm>({ source: "SCHOOL", sourceName: "", reason: "", documentsRequested: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof OpenDisputeForm>(k: K) => (v: OpenDisputeForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const off = !order.trim() || openFormProblem(form) !== null;
  const key = `dd-open-${orderId ?? "desk"}`;
  const who = athleteName ?? "The athlete";

  /* Two submits in one tick both see pending=false; the ref stops the second POST (QA round, 2026-10-23). */
  const busy = useRef(false);
  const submit = () => {
    setError(null);
    if (!order.trim()) return setError("Paste the order id.");
    const problem = openFormProblem(form);
    if (problem) return setError(problem);
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        const res = await open(order.trim(), form);
        if (!res.ok) return setError(res.message);
        setDone(res.id);
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };

  if (done) {
    return (
      <OrderDialog id={key} title="The deal is paused" onClose={onClose} onSubmit={onClose}>
        <p className="text-sm leading-relaxed">{who} has been asked for the documents. Nothing on the order moves, and its earning is held, until BTG resumes or cancels it.</p>
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={btn.quiet} onClick={onClose}>Close</button>
          <Link href={`${base}/${encodeURIComponent(done)}`} className={btn.primary}>Open the dispute →</Link>
        </div>
      </OrderDialog>
    );
  }

  return (
    <OrderDialog id={key} title={athleteName ? `Raise a concern about ${athleteName}’s order?` : "Raise a concern about an order?"} onClose={onClose} onSubmit={submit}>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
        <li>The order pauses now — nothing on it moves until BTG resumes or cancels it, and its earning is held.</li>
        <li>{who} (or their guardian) is told what the concern is and what to send.</li>
        <li>The sponsor sees none of this.</li>
      </ul>
      {!orderId && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${key}-order`} className="text-[13px] font-semibold">Order id <span className="font-medium text-warn">(required)</span></label>
          <p className="-mt-1 text-[11px] text-muted">From the email or the note that brought you here. Only a sent, accepted or live order can be paused.</p>
          <input id={`${key}-order`} data-autofocus value={order} onChange={(e) => setOrder(e.target.value)} className={`${inputCls} font-mono`} autoComplete="off" spellCheck={false} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${key}-source`} className="text-[13px] font-semibold">Who raised it <span className="font-medium text-warn">(required)</span></label>
          <select id={`${key}-source`} value={form.source} onChange={(e) => set("source")(e.target.value as DealDisputeSource)} className={inputCls}>
            {DEAL_DISPUTE_SOURCES.map((s) => (
              <option key={s} value={s}>{sourceLabel(s)}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${key}-name`} className="text-[13px] font-semibold">Their name <span className="font-normal text-muted">(optional)</span></label>
          <input id={`${key}-name`} value={form.sourceName} onChange={(e) => set("sourceName")(e.target.value)} maxLength={160} placeholder="Northside High" className={inputCls} />
        </div>
      </div>
      <NoteField id={`${key}-reason`} label="The concern" value={form.reason} onChange={set("reason")} hint={`What was raised, in plain words. ${who} reads this as written.`} />
      <NoteField id={`${key}-ask`} label="What to send" value={form.documentsRequested} onChange={set("documentsRequested")} hint="The documents that would settle it — a PDF, a photo or a scan, up to ten." />
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={off || pending} className={btn.primary}>{pending ? "Pausing…" : "Pause the deal"}</button>
      </div>
      {off && <p className="text-[11px] text-muted">Fill in {!orderId && !order.trim() ? "the order id, " : ""}the concern and what to send to turn on “Pause the deal”.</p>}
    </OrderDialog>
  );
}

/* ------------------------------------------------------------- resolve */

export function ResolveDealDispute({ dispute, resolve = resolveDealDisputeAction }: { dispute: ApiDealDispute; resolve?: ResolveAction }) {
  const [on, setOn] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOn(true)} aria-label={`Resolve ${dispute.athleteName}’s dispute`} className={dispute.state === "DOCUMENTS_IN" ? primarySmall : quietSmall}>
        Resolve…
      </button>
      {on && <ResolveDialog dispute={dispute} resolve={resolve} onClose={() => setOn(false)} />}
    </>
  );
}

function ResolveDialog({ dispute: d, resolve, onClose }: { dispute: ApiDealDispute; resolve: ResolveAction; onClose: () => void }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<DealDisputeOutcome>("RESUME");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = resolveNoteProblem(note) !== null;
  const key = `dd-resolve-${d.id}`;
  const busy = useRef(false);
  const submit = () => {
    setError(null);
    const problem = resolveNoteProblem(note);
    if (problem) return setError(problem);
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        const res = await resolve(d.id, outcome, note.trim());
        if (!res.ok) return setError(res.message);
        onClose();
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  };
  return (
    <OrderDialog id={key} title={`Decide ${d.athleteName}’s dispute`} onClose={onClose} onSubmit={submit}>
      <p className="text-sm leading-relaxed">
        {d.campaignName} · {d.job} · {d.documents.length === 0 ? "no documents yet" : d.documents.length === 1 ? "one document in" : `${d.documents.length} documents in`}
      </p>
      {d.state === "OPEN" && <p className="text-[12px] leading-relaxed text-warn">The documents haven’t come in yet. You can still decide now.</p>}
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 p-0 text-[13px] font-semibold">What happens to the deal</legend>
        <div className="space-y-1.5">
          {(["RESUME", "CANCEL"] as const).map((o) => (
            <label key={o} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs ${outcome === o ? "border-primary-soft bg-primary/12" : "border-line bg-bg"}`}>
              <input type="radio" name={`${key}-outcome`} value={o} checked={outcome === o} onChange={() => setOutcome(o)} className="mt-0.5 accent-primary" />
              <span className="min-w-0">
                <span className="block font-semibold">{o === "RESUME" ? "Resume the deal" : "Cancel the deal"}</span>
                <span className="block text-muted">{outcomeWords(o)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <NoteField id={`${key}-note`} label="Your note" value={note} onChange={setNote} hint={`Why. ${d.athleteName} reads this, and so does the next person on the desk.`} />
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Back</button>
        <button type="submit" disabled={off || pending} className={outcome === "CANCEL" ? btn.danger : btn.primary}>
          {pending ? "Saving…" : outcome === "CANCEL" ? "Cancel the deal" : "Resume the deal"}
        </button>
      </div>
      {off && <p className="text-[11px] text-muted">Write the note to turn on the decision.</p>}
    </OrderDialog>
  );
}

/* ----------------------------------------------------------- documents */

export function DealDisputeDocuments({
  id,
  documents,
  skin,
  canOpen,
  getDocument = getDealDisputeDocumentAction,
}: {
  id: string;
  documents: ApiDealDisputeDocument[];
  skin: Skin;
  canOpen: boolean;
  getDocument?: GetDocumentAction;
}) {
  const [open, setOpen] = useState<ApiDealDisputeDocument | null>(null);
  const muted = MUTED[skin];
  return (
    <Panel skin={skin}>
      <h2 className="text-sm font-semibold">Documents</h2>
      {documents.length === 0 ? (
        <p className={`mt-2 text-xs ${muted}`}>Nothing sent yet.</p>
      ) : (
        <ul className="mt-2" aria-label="Documents">
          {/* flex-wrap: on a phone the full-width Open button drops under the name instead of squeezing it to one letter a line (QA 2026-10-23). */}
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft py-2.5 text-[13px]">
              <span className="min-w-0 flex-1">
                <span className="block break-all">{doc.filename}</span>
                <span className={`block text-[11px] ${muted}`}>{documentSub(doc)}</span>
              </span>
              {canOpen && (
                <button type="button" onClick={() => setOpen(doc)} aria-label={`Open ${doc.filename}`} className={quietSmall}>Open</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className={`mt-2 text-[11px] ${muted}`}>
        {canOpen ? "Each open signs a link that lasts 5 minutes. Opens are recorded." : "BTG admin opens these."}
      </p>
      {open && <Viewer id={id} doc={open} getDocument={getDocument} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

function Viewer({ id, doc, getDocument, onClose }: { id: string; doc: ApiDealDisputeDocument; getDocument: GetDocumentAction; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [link, setLink] = useState<{ url: string; expiresInSeconds: number } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const kind = documentKind(doc.contentType);
  const title = doc.filename;
  const load = () =>
    start(async () => {
      const r = await getDocument(id, doc.id);
      setLink(r.ok ? { url: r.url, expiresInSeconds: r.expiresInSeconds } : { error: r.message });
    });
  /* Portaled to <body> like OrderDialog: the admin stage's cards carry a backdrop-filter, which
     makes `fixed` lay out against the card — the viewer sat inside the Documents panel with its
     bottom cut off (QA 2026-10-23). */
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="dd-vw-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/90" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:py-10">
        <div className="sx-pop relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
            <h2 id="dd-vw-title" className="min-w-0 flex-1 break-all text-sm font-semibold">{title}</h2>
            <button type="button" data-autofocus onClick={onClose} className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">Close</button>
          </div>
          <p role="status" className="border-b border-warn/30 bg-warn/8 px-4 py-2 text-xs font-semibold text-warn">
            <span aria-hidden="true">● </span>{link && "url" in link ? linkLifeWords(link.expiresInSeconds) : "Opening it signs a 5-minute link."} This view is recorded.
          </p>
          {link && "url" in link ? (
            <>
              {kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived R2 URL; never optimised or cached by the app
                <img src={link.url} alt={title} className="m-4 max-h-[28rem] self-center rounded-xl border border-line bg-bg object-contain" />
              ) : kind === "pdf" ? (
                <iframe title={title} src={link.url} className="m-4 h-72 rounded-xl border border-line bg-bg sm:h-[28rem]" />
              ) : (
                <p className="m-4 rounded-xl border border-dashed border-line bg-bg px-4 py-10 text-center text-[13px] text-muted">This file can’t be shown here. Download it instead.</p>
              )}
              <p className="flex flex-wrap items-center gap-3 px-4 pb-4 text-[11px] text-faint">
                <a href={link.url} target="_blank" rel="noopener" download={doc.filename} className="font-semibold text-accent hover:text-accent-soft">Download</a>
                <span>{documentSub(doc)}</span>
              </p>
            </>
          ) : (
            <div className="m-4 grid h-72 place-items-center rounded-xl border border-dashed border-line bg-bg px-4 text-center text-[13px] text-muted sm:h-[28rem]">
              <span className="space-y-3">
                <span className="block">{documentSub(doc)}</span>
                <button type="button" onClick={load} disabled={pending} className="min-h-11 rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-50">
                  {pending ? "Opening…" : "Open the document"}
                </button>
                {link && "error" in link && <span role="alert" className="block text-xs text-danger">{link.error}</span>}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------- the pause */

/** The one-line "why" beside a paused order or a held earning, with the way to the dispute. */
export function PausedLink({ note, href, skin = "admin" }: { note: string; href: string; skin?: Skin }) {
  return (
    <span className={`block text-[11px] leading-snug ${skin === "vault" ? "text-[color:var(--vault-gold-hi)]" : "text-warn"}`}>
      {note} ·{" "}
      <Link href={href} className={`font-semibold ${LINK[skin]}`}>Open the dispute →</Link>
    </span>
  );
}
