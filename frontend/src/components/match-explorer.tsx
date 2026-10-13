"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";

import { saveShortlistAction } from "@/app/(app)/admin/intelligence/matching/actions";
import { CloseIcon } from "@/components/filter-kit";
import { PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { Primary, StageTable, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui";
import { useDrawerFocus } from "@/components/use-drawer-focus";
import { useMounted } from "@/components/use-mounted";
import { confidenceLabel, pct } from "@/lib/intelligence";
import {
  KIND_LABEL,
  MATCH_KINDS,
  byImpact,
  factorFit,
  factorLabel,
  filteredOutLine,
  groupEntries,
  kindHref,
  matchBand,
  selectionFrom,
  shortlistChanged,
  toEntry,
  toggleEntry,
  topReasons,
  utcMinute,
  type ApiMatch,
  type ApiMatchPage,
  type ApiShortlist,
  type MatchBand,
  type ShortlistEntry,
} from "@/lib/match-explorer-live";

/* --------------------------------------------------------------------------
   3S3-FE-01 — the match explorer's island: kind tabs, the ranked page, the
   factor drawer and the shortlist being assembled.

   The ranked list is SERVER-PAGED (?kind ?page ?size → the engine answers
   one page); the tabs are links, so the island stays mounted and the
   shortlist selection — held here by match id, with each entry's name and
   score — survives paging and switching kind. Save sends the ids; the
   engine replaces the brief's shortlist and the page re-reads it.

   Every number is the engine's: score, rank, factor weights and points,
   confidence, counts. Nothing is computed here but a factor's fit
   (its points ÷ its share), which is a restatement of two engine numbers.
   -------------------------------------------------------------------------- */

const BAND_FILL: Record<MatchBand, string> = { strong: "bg-accent", good: "bg-primary", weak: "bg-warn" };
const BAND_TEXT: Record<MatchBand, string> = { strong: "text-accent", good: "text-primary", weak: "text-warn" };

export function MatchExplorer(props: { briefId: string; data: ApiMatchPage; sample: boolean }) {
  return (
    <ServerList>
      <Explorer {...props} />
    </ServerList>
  );
}

function Explorer({ briefId, data, sample }: { briefId: string; data: ApiMatchPage; sample: boolean }) {
  const sp = useSearchParams();
  const [saved, setSaved] = useState<ApiShortlist | null>(data.shortlist);
  const [selected, setSelected] = useState<Record<string, ShortlistEntry>>(() => selectionFrom(data.shortlist));
  /* The server's shortlist moved (our save re-read, or someone else's):
     follow it. Adjusting state during render, not in an effect. */
  const [seen, setSeen] = useState(data.shortlist?.savedAt ?? null);
  if ((data.shortlist?.savedAt ?? null) !== seen) {
    setSeen(data.shortlist?.savedAt ?? null);
    setSaved(data.shortlist);
    setSelected(selectionFrom(data.shortlist));
  }
  const [open, setOpen] = useState<ApiMatch | null>(null);
  const [saving, startSave] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const ids = Object.keys(selected);
  const dirty = shortlistChanged(saved, ids);
  const toggle = (m: Pick<ApiMatch, "id" | "kind" | "name" | "score">) => {
    setNote(null);
    setSelected((s) => toggleEntry(s, toEntry(m)));
  };
  const save = () =>
    startSave(async () => {
      const out = await saveShortlistAction(briefId, ids);
      if (out.ok) {
        setSaved(out.shortlist);
        setSeen(out.shortlist.savedAt);
        setNote({ ok: true, text: `Shortlist saved — ${out.shortlist.entries.length} on it.` });
      } else setNote({ ok: false, text: out.error });
    });

  const kind = data.kind;
  const filtered = filteredOutLine(data.filteredOut);
  const columns: Column[] = [
    { key: "pick", label: "Shortlist", srOnly: true },
    { key: "rank", label: "#", num: true },
    { key: "match", label: KIND_LABEL[kind].one },
    { key: "score", label: "Match score" },
    { key: "conf", label: "Confidence" },
    { key: "avail", label: "Availability" },
    { key: "act", label: "Details", srOnly: true },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <section aria-label="Ranked matches" className="min-w-0 space-y-3">
        <TabStrip label="What to match">
          {MATCH_KINDS.map((k) => (
            <TabLink key={k} href={kindHref(sp.toString(), k)} on={k === kind} count={data.counts[k]}>
              {KIND_LABEL[k].many}
            </TabLink>
          ))}
        </TabStrip>

        {filtered && (
          <p className="text-[11px] text-muted">
            <span className="font-medium text-text">{filtered}.</span> The engine removes these before ranking; they are never listed.
          </p>
        )}

        {data.matches.length === 0 ? (
          <EmptyState
            mark="users"
            title={`No ${KIND_LABEL[kind].many.toLowerCase()} match this brief`}
            hint="Nothing available and conflict-free scored against it. Widen the brief's sports, states or categories and it re-ranks."
          />
        ) : (
          <div className="space-y-3">
            <PagerRow page={data.page} noun={KIND_LABEL[kind].many} tone="admin" position="top" />
            <PendingList>
              <StageTable label={`Ranked ${KIND_LABEL[kind].many.toLowerCase()}`} columns={columns}>
                {data.matches.map((m, i) => {
                  const on = Boolean(selected[m.id]);
                  const band = matchBand(m.score);
                  return (
                    <Tr key={m.id} i={i} tone={on ? "accent" : undefined}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(m)}
                          aria-label={`Shortlist ${m.name}`}
                          className="size-4 accent-[var(--sx-primary)]"
                        />
                      </Td>
                      <Td label="Rank" num muted>
                        {m.rank}
                      </Td>
                      <Td>
                        <button type="button" onClick={() => setOpen(m)} className="block min-w-0 text-left">
                          <Primary sub={m.sub}>{m.name}</Primary>
                        </button>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {topReasons(m).map((r) => (
                            <span key={r} className="rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] text-muted">
                              {r}
                            </span>
                          ))}
                        </span>
                      </Td>
                      <Td label="Score">
                        <ScoreBar score={m.score} band={band} />
                      </Td>
                      <Td label="Confidence" muted>
                        <span className="tabular-nums">{pct(m.stamp.confidence)}</span>
                      </Td>
                      <Td label="Availability">
                        <Availability m={m} />
                      </Td>
                      <Td act>
                        <button
                          type="button"
                          onClick={() => setOpen(m)}
                          aria-label={`Why ${m.name} ranks ${m.rank}`}
                          className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs font-semibold text-text hover:bg-surface-2"
                        >
                          Why →
                        </button>
                      </Td>
                    </Tr>
                  );
                })}
              </StageTable>
            </PendingList>
            <p className="text-[11px] text-faint">
              Ranked by {data.run.modelVersion}, {utcMinute(data.run.computedAt)}. A score is the sum of its factors&rsquo; points out of 100.
            </p>
            <PagerRow page={data.page} noun={KIND_LABEL[kind].many} tone="admin" position="bottom" />
          </div>
        )}
      </section>

      <ShortlistPanel
        selected={selected}
        saved={saved}
        dirty={dirty}
        saving={saving}
        sample={sample}
        note={note}
        onRemove={(e) => {
          setNote(null);
          setSelected((s) => toggleEntry(s, e));
        }}
        onSave={save}
      />

      {open && <FactorDrawer match={open} on={Boolean(selected[open.id])} onToggle={() => toggle(open)} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ScoreBar({ score, band }: { score: number; band: MatchBand }) {
  return (
    <span className="flex items-center gap-2" title={`${band} match`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span className={`block h-full rounded-full ${BAND_FILL[band]}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </span>
      <span className={`text-sm font-semibold tabular-nums ${BAND_TEXT[band]}`}>{score}</span>
      <span className="sr-only">out of 100, {band} match</span>
    </span>
  );
}

function Availability({ m }: { m: ApiMatch }) {
  if (m.availability.state === "AVAILABLE") return <span className="text-xs text-accent">Available</span>;
  return (
    <span className="block min-w-0">
      <span className="text-xs text-warn">Limited</span>
      {m.availability.note && <span className="block text-[11px] text-muted">{m.availability.note}</span>}
    </span>
  );
}

function ShortlistPanel({
  selected,
  saved,
  dirty,
  saving,
  sample,
  note,
  onRemove,
  onSave,
}: {
  selected: Record<string, ShortlistEntry>;
  saved: ApiShortlist | null;
  dirty: boolean;
  saving: boolean;
  sample: boolean;
  note: { ok: boolean; text: string } | null;
  onRemove: (e: ShortlistEntry) => void;
  onSave: () => void;
}) {
  const groups = groupEntries(selected);
  const count = Object.keys(selected).length;
  return (
    <aside aria-label="Shortlist" className="space-y-3 self-start rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Shortlist</h2>
        <span className="text-[11px] tabular-nums text-muted">{count} picked</span>
      </div>
      <p className="text-[11px] text-muted">
        {saved ? `Saved ${utcMinute(saved.savedAt)} by ${saved.savedBy}.` : "Nothing saved for this brief yet."}
      </p>

      {count === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[11px] text-muted">
          Tick a match to add it. Picks stay while you page and switch tabs.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.kind}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">{KIND_LABEL[g.kind].many}</p>
              <ul className="mt-1 space-y-1">
                {g.entries.map((e) => (
                  <li key={e.matchId} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{e.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="tabular-nums text-muted">{e.score}</span>
                      <button
                        type="button"
                        onClick={() => onRemove(e)}
                        aria-label={`Remove ${e.name} from the shortlist`}
                        className="grid size-6 place-items-center rounded-full text-faint hover:bg-surface-2 hover:text-text"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {dirty && <p className="text-[11px] font-medium text-warn">Unsaved changes</p>}
      <Button full onClick={onSave} disabled={!dirty || saving || sample}>
        {saving ? "Saving…" : count === 0 && saved ? "Clear saved shortlist" : "Save shortlist"}
      </Button>
      {sample && <p className="text-[11px] text-faint">Saving is off in the sample preview.</p>}
      {note && (
        <p role="status" className={`text-[11px] ${note.ok ? "text-accent" : "text-danger"}`}>
          {note.text}
        </p>
      )}
    </aside>
  );
}

/* The drawer portals to <body>, like the anomaly and make-good drawers: in
   the page's main column its z-50 sat under the shell's sticky header and
   the phone dock (both stack at shell level), which covered its title, its
   Close button and "Add to shortlist". On <body> it is above all of it, and
   still themed — StagePortals keeps the stage's class on <body>. The page
   behind stops scrolling while it is open; focus is trapped in the panel and
   returns to the opener on close (useDrawerFocus); Escape closes. */
function FactorDrawer({ match, on, onToggle, onClose }: { match: ApiMatch; on: boolean; onToggle: () => void; onClose: () => void }) {
  const mounted = useMounted();
  const [closing, setClosing] = useState(false);
  const { panelRef, onKeyDown } = useDrawerFocus<HTMLDivElement>(true);
  const band = matchBand(match.score);
  const titleId = `mx-${match.id}-title`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);
  /* Unmount rides the slide-out; the timer covers reduced motion. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClose, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  if (!mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 z-50 ${closing ? "pointer-events-none" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={() => setClosing(true)} className={`${closing ? "sx-backdrop-out" : "sx-backdrop"} absolute inset-0 cursor-default bg-black/60`} />
      <div
        ref={panelRef}
        tabIndex={-1}
        onAnimationEnd={(e) => {
          if (closing && e.animationName === "sx-drawer-out") onClose();
        }}
        className={`${closing ? "sx-drawer-out" : "sx-drawer"} absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl shadow-black/40 outline-none`}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line-soft p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-faint">
              #{match.rank} · {KIND_LABEL[match.kind].one}
            </p>
            <h2 id={titleId} className="mt-0.5 text-base font-semibold tracking-tight">
              {match.name}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{match.sub}</p>
          </div>
          <button
            type="button"
            onClick={() => setClosing(true)}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          <div>
            <div className="flex items-end justify-between gap-3 rounded-xl border border-line bg-surface-2/40 p-4">
              <div>
                <p className="text-[11px] text-muted">Match score</p>
                <p className={`text-4xl font-semibold tabular-nums leading-none ${BAND_TEXT[band]}`}>
                  {match.score}
                  <span className="ml-1 text-sm font-normal text-faint">/ 100</span>
                </p>
              </div>
              <div className="text-right">
                <Availability m={match} />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-faint">
              {match.stamp.modelVersion} · {confidenceLabel(match.stamp.confidence)} · {utcMinute(match.stamp.computedAt)}
            </p>
          </div>

          {match.reasons.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">In a sentence</p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {match.reasons.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Every factor</p>
            <ul className="mt-2 space-y-3">
              {byImpact(match.factors).map((f) => (
                <li key={f.key}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-medium">{factorLabel(f)}</span>
                    <span className="shrink-0 tabular-nums text-muted">
                      +{f.contribution} of {Math.round(f.weight * 100)} pts
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(factorFit(f) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-muted">{f.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="shrink-0 border-t border-line-soft p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button full variant={on ? "secondary" : "primary"} onClick={onToggle}>
            {on ? "Remove from shortlist" : "Add to shortlist"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
