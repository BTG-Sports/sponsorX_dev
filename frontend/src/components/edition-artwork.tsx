"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge, Card } from "@/components/ui";
import { DeliverableUpload } from "@/components/deliverable-upload";
import {
  artworkNext,
  artworkStatus,
  boardMoves,
  BOARD_MOVE_LABEL,
  canUploadArtwork,
  sponsorMoves,
  submittedAgo,
  type ApiArtwork,
  type ApiCampaignArtworkSlot,
  type BoardMove,
  type SponsorMove,
} from "@/lib/edition-artwork-live";

/* --------------------------------------------------------------------------
   P9-BE-16 — edition ad artwork, the second kind of subject on the approval
   board. Two islands over the same rows:

   - <ArtworkQueue> — BTG's desk on /admin/approvals, beside the deliverable
     queue: start the review, send it to the sponsor, ask for changes. There
     is no Approve here: the sign-off is the buying sponsor's alone.
   - <SponsorArtwork> — the sponsor's campaign page: upload the file (the
     athlete upload, reused — straight to the private bucket), then Approve or
     Request changes once BTG sends it.

   Nothing is optimistic: each decision is a server action, the API decides,
   audits and emails the other party, and the page refreshes from Postgres.
   -------------------------------------------------------------------------- */

type Result = { ok: true; state: string } | { ok: false; message: string };
type LinkResult = { ok: true; url: string } | { ok: false; message: string };
type Fail = { ok: false; message: string };

const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:opacity-40";
const BTN_SECONDARY =
  "inline-flex items-center justify-center rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2 disabled:opacity-40";

function OpenFile({ id, version, link }: { id: string; version: number; link: (id: string) => Promise<LinkResult> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className={BTN_SECONDARY}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          /* Open synchronously so the browser doesn't treat it as a popup. */
          const w = window.open("about:blank", "_blank");
          const r = await link(id);
          setBusy(false);
          if (r.ok && w) w.location.href = r.url;
          else {
            w?.close();
            setErr(r.ok ? "Your browser blocked the new tab." : r.message);
          }
        }}
      >
        {busy ? "Signing…" : `Open v${version}`} <span aria-hidden="true" className="ml-1">↗</span>
      </button>
      {err && <span className="mt-1 text-[10px] text-danger">{err}</span>}
    </span>
  );
}

/** The buttons for one artwork, with the note box a change request needs. */
function Decisions<K extends string>({
  id,
  moves,
  labels,
  act,
  noteHint,
  done,
}: {
  id: string;
  moves: K[];
  labels: Record<K, string>;
  act: (id: string, kind: K, note?: string) => Promise<Result>;
  noteHint: string;
  done: (kind: K) => string;
}) {
  const router = useRouter();
  const [writing, setWriting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<K | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const go = async (kind: K) => {
    setBusy(kind);
    setError(null);
    const r = await act(id, kind, kind === ("revision" as K) ? note : undefined);
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setWriting(false);
    setNote("");
    setMessage(done(kind));
    router.refresh();
  };

  if (moves.length === 0 && !message) return null;
  const primary = moves.filter((m) => m !== ("revision" as K));
  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div aria-live="polite">
        {message && <p className="mb-2 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2 text-xs text-text">{message}</p>}
        {error && <p role="alert" className="mb-2 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
      </div>
      {writing ? (
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted">What needs to change?</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={noteHint}
              className="mt-1 w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-admin/60"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!note.trim() || busy !== null} onClick={() => go("revision" as K)} className={`${BTN_PRIMARY} flex-1`}>
              {busy ? "Sending…" : "Send the change request"}
            </button>
            <button type="button" onClick={() => setWriting(false)} className={BTN_SECONDARY}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {primary.map((m, i) => (
            <button key={m} type="button" disabled={busy !== null} onClick={() => go(m)} className={i === 0 ? `${BTN_PRIMARY} flex-1` : BTN_SECONDARY}>
              {busy === m ? "Working…" : labels[m]}
            </button>
          ))}
          {moves.includes("revision" as K) && (
            <button type="button" disabled={busy !== null} onClick={() => setWriting(true)} className={BTN_SECONDARY}>
              {labels["revision" as K]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ ArtworkQueue */

/** BTG's desk: the edition artwork waiting on, or cleared by, the board. */
export function ArtworkQueue({
  rows,
  now,
  act,
  link,
}: {
  rows: ApiArtwork[];
  now: number;
  act: (id: string, kind: BoardMove, note?: string) => Promise<Result>;
  link: (id: string) => Promise<LinkResult>;
}) {
  const at = new Date(now);
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {rows.map((a) => {
        const s = artworkStatus(a.state, Boolean(a.revision));
        return (
          <li key={a.id}>
            <Card className="h-full p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-next">Edition ad · {a.slot?.slotCode ?? "slot"}</p>
                  <p className="mt-0.5 break-words text-sm font-semibold [overflow-wrap:anywhere]">{a.campaign?.sponsorName ?? a.title}</p>
                  <p className="text-[11px] text-muted [overflow-wrap:anywhere]">
                    {a.edition.label} · {a.edition.publication}
                    {a.campaign ? ` · ${a.campaign.name}` : ""}
                  </p>
                </div>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              <p className="mt-2 text-[11px] text-faint">
                v{a.version} · {submittedAgo(a.submittedAt, at)}
              </p>
              {a.revision && (
                <p className="mt-2 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] text-text">“{a.revision.reason}”</p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-muted">{artworkNext(a.state, Boolean(a.revision), "BTG")}</p>
              {a.version > 0 && (
                <div className="mt-2">
                  <OpenFile id={a.id} version={a.version} link={link} />
                </div>
              )}
              <Decisions<BoardMove>
                id={a.id}
                moves={boardMoves(a.state, Boolean(a.revision))}
                labels={BOARD_MOVE_LABEL}
                act={act}
                noteHint="The sponsor gets these words exactly."
                done={(k) =>
                  k === "revision"
                    ? `Sent back to ${a.campaign?.sponsorName ?? "the sponsor"} with your notes.`
                    : k === "sponsor-review"
                      ? `Sent to ${a.campaign?.sponsorName ?? "the sponsor"} for their sign-off.`
                      : "Review started — it's on the BTG desk now."
                }
              />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------- SponsorArtwork */

const SPONSOR_LABEL: Record<SponsorMove, string> = { approve: "Approve", revision: "Request changes" };

/** The sponsor's campaign page: each edition slot they bought and its artwork. */
export function SponsorArtwork({
  slots,
  now,
  canDecide,
  act,
  link,
  presign,
  register,
}: {
  slots: ApiCampaignArtworkSlot[];
  now: number;
  /** SPONSOR_ADMIN — an analyst sees the status, and decides nothing. */
  canDecide: boolean;
  act: (id: string, kind: SponsorMove, note?: string) => Promise<Result>;
  link: (id: string) => Promise<LinkResult>;
  presign: (slotId: string, contentType: string) => Promise<({ ok: true } & { url: string; key: string }) | Fail>;
  register: (slotId: string, key: string) => Promise<({ ok: true } & { version: number }) | Fail>;
}) {
  const at = new Date(now);
  const noSubmit = async () => ({ ok: true as const, state: "DRAFT_SUBMITTED" });
  return (
    <ul className="space-y-3">
      {slots.map((slot) => {
        const a = slot.artwork;
        const revisionOpen = Boolean(a?.revision);
        const s = artworkStatus(a?.state ?? null, revisionOpen);
        const uploadable = canDecide && canUploadArtwork(a?.state ?? null, slot.open);
        return (
          <li key={slot.slotId}>
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                    {slot.edition.label} · {slot.slotCode}
                  </p>
                  <p className="text-[11px] text-muted [overflow-wrap:anywhere]">
                    {slot.edition.publication} · {slot.kind.replace("_", " ").toLowerCase()}
                  </p>
                </div>
                <Badge tone={s.tone}>{s.label}</Badge>
              </div>
              {a && (
                <p className="mt-2 text-[11px] text-faint">
                  v{a.version} · {submittedAgo(a.submittedAt, at)}
                </p>
              )}
              {a?.revision && (
                <p className="mt-2 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] text-text">“{a.revision.reason}”</p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {slot.open || a?.state === "APPROVED" ? artworkNext(a?.state ?? null, revisionOpen, "SPONSOR") : "This edition is in production — its artwork is final."}
              </p>
              {a && a.version > 0 && (
                <div className="mt-2">
                  <OpenFile id={a.id} version={a.version} link={link} />
                </div>
              )}
              {uploadable && (
                <div className="mt-3">
                  <DeliverableUpload
                    deliverableId={slot.slotId}
                    firstUpload={false}
                    label={a ? "Upload a new version" : "Upload your ad artwork"}
                    presign={presign}
                    register={register}
                    submit={noSubmit}
                  />
                </div>
              )}
              {a && (
                <Decisions<SponsorMove>
                  id={a.id}
                  moves={sponsorMoves(a.state, canDecide)}
                  labels={SPONSOR_LABEL}
                  act={act}
                  noteHint="BTG gets these words exactly."
                  done={(k) => (k === "approve" ? "Approved — BTG has been told. It prints as you see it." : "Sent back with your notes — BTG has been told.")}
                />
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
