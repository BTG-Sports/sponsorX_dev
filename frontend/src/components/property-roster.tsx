"use client";

import { useState, useTransition, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";

import { addRosterAthleteAction, setTeamShareAction, withdrawShareChangeAction } from "@/app/(app)/property/roster/actions";
import {
  EMPTY_ROSTER_DRAFT, shareAskedLine, shareAskedTag, shareInput, shareText, validateRosterDraft, type ApiTeamShareChange, type RosterDraft, type ShareOutcome,
} from "@/lib/property-p2-live";

/* --------------------------------------------------------------------------
   2S2-FE-04 — the roster's two interactive pieces: the "Add athlete" form
   (POST /team/roster) and the inline team-share editor per row (PATCH
   /team/roster/:athleteId). The share is typed as a percentage and stored
   in basis points; an emptied field clears it ("Not set").

   POL-FE-03 (POL-BE-03) — a raise, a first share, or clearing one is a
   request the athlete answers (the guardian, for a minor): the editor says
   "Waiting for Jordan's answer", never "Saved", and the row carries the
   open request with Withdraw (PropertyShareAsked → POST
   /team/roster/:id/share-change/withdraw). Lowering applies at once and
   says so. "Add athlete" says when the typed share waits for their yes.
   -------------------------------------------------------------------------- */

const field =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none aria-[invalid=true]:border-danger";
const lbl = "block text-[11px] font-medium text-muted";

export function PropertyRosterAdd({ teamName }: { teamName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RosterDraft>(EMPTY_ROSTER_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<keyof RosterDraft, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof RosterDraft>(k: K, v: RosterDraft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = () => {
    setMessage(null);
    const v = validateRosterDraft(draft);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    start(async () => {
      const r = await addRosterAthleteAction(draft);
      if (r.ok) {
        setAdded(r.note ?? `${draft.displayName.trim()} is on the roster.`);
        setDraft(EMPTY_ROSTER_DRAFT);
        setErrors({});
        setOpen(false);
        router.refresh();
      } else {
        setErrors(r.errors ?? {});
        setMessage(r.message);
      }
    });
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setAdded(null);
          }}
          className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
        >
          Add athlete
        </button>
        {added && (
          <p className="text-[11px] text-accent" role="status">
            {added}
          </p>
        )}
      </div>
    );
  }

  const input = (k: keyof RosterDraft, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className={lbl}>{label}</span>
      <input
        className={field}
        value={draft[k]}
        aria-invalid={!!errors[k]}
        onChange={(e) => set(k, e.target.value as never)}
        {...props}
      />
      {errors[k] && <span className="mt-1 block text-[11px] text-danger">{errors[k]}</span>}
    </label>
  );

  return (
    <form
      className="space-y-4 rounded-xl border border-line bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div>
        <h3 className="text-sm font-semibold">Add an athlete to {teamName}</h3>
        <p className="mt-0.5 text-xs text-muted">
          This creates their SponsorX account, approved and on your roster. They claim it by signing in with this email —
          SponsorX doesn&rsquo;t email them an invitation yet, so tell them yourself.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {input("legalName", "Legal name", { autoComplete: "off" })}
        {input("displayName", "Name sponsors see", { placeholder: "e.g. Jordan R." })}
        {input("email", "Email", { type: "email", autoComplete: "off" })}
        {input("sport", "Sport", { placeholder: "e.g. Basketball" })}
        {input("position", "Position (optional)")}
        {input("gradYear", "Graduation year (optional)", { inputMode: "numeric", placeholder: "2027" })}
        {input("birthDate", "Date of birth (optional)", { type: "date" })}
        <label className="block">
          <span className={lbl}>Age band (optional)</span>
          <select className={field} value={draft.ageBand} onChange={(e) => set("ageBand", e.target.value as RosterDraft["ageBand"])}>
            <option value="">Not given</option>
            <option value="UNDER_16">Under 16</option>
            <option value="16_17">16–17</option>
            <option value="18_PLUS">18 or older</option>
          </select>
        </label>
        {input("teamShare", "Team share % (optional)", { inputMode: "decimal", placeholder: "e.g. 10" })}
      </div>
      <p className="text-[11px] text-faint">A share typed here waits for the athlete&rsquo;s yes (the guardian&rsquo;s, for a minor); BTG&rsquo;s standard share applies until they accept.</p>
      {message && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add to roster"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setMessage(null);
            setErrors({});
          }}
          className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PropertyShareEdit({ athleteId, name, bps, asked = null }: { athleteId: string; name: string; bps: number | null; asked?: ApiTeamShareChange | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(shareInput(bps));
  const [error, setError] = useState<string | null>(null);
  /* POL-FE-03 — what the last save came to: waiting for the athlete, or applied at once. */
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={() => {
            setValue(shareInput(bps));
            setError(null);
            setOutcome(null);
            setEditing(true);
          }}
          className={`rounded-md px-1.5 py-0.5 text-right tabular-nums hover:bg-surface-2 ${bps === null ? "text-warn" : ""}`}
          aria-label={`Edit the team's share for ${name}`}
          title="Edit the team's share"
        >
          {shareText(bps)}
        </button>
        {asked && <span className="text-[10px] text-warn">{shareAskedTag(asked)}</span>}
        {outcome && (
          <span role="status" title={outcome.message} className={`max-w-[9rem] text-right text-[10px] leading-snug ${outcome.waiting ? "text-warn" : "text-accent"}`}>
            {outcome.waiting ? `Waiting for ${name.split(/\s+/)[0]}'s answer` : "Saved · applies at once"}
          </span>
        )}
      </span>
    );
  }

  const save = () =>
    start(async () => {
      const r = await setTeamShareAction(athleteId, value);
      if (r.ok) {
        setOutcome(r.outcome);
        setEditing(false);
        router.refresh();
      } else setError(r.message);
    });

  return (
    <form
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <span className="flex items-center gap-1.5">
        <input
          autoFocus
          aria-label={`Team share for ${name}, percent`}
          inputMode="decimal"
          value={value}
          placeholder="Not set"
          onChange={(e) => setValue(e.target.value)}
          className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-right text-xs tabular-nums focus:border-primary/60 focus:outline-none"
        />
        <span className="text-muted">%</span>
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-cta-ink disabled:opacity-40">
          {pending ? "…" : "Save"}
        </button>
        <button type="button" disabled={pending} onClick={() => setEditing(false)} className="px-1 text-[11px] text-muted hover:text-text">
          Cancel
        </button>
      </span>
      {error ? (
        <span className="text-[11px] text-danger">{error}</span>
      ) : (
        <span className="max-w-[9rem] text-right text-[10px] leading-snug text-faint">Lower applies now · higher, or empty, needs their yes</span>
      )}
    </form>
  );
}

/**
 * POL-FE-03 — the open share request on a roster row: what was asked and
 * when, the outcome of the last save in full, and Withdraw.
 */
export function PropertyShareAsked({ athleteId, name, asked }: { athleteId: string; name: string; asked: ApiTeamShareChange }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const withdraw = () =>
    start(async () => {
      setError(null);
      const r = await withdrawShareChangeAction(athleteId);
      if (!r.ok) return setError(r.message);
      router.refresh();
    });
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
      <span className="text-warn">{shareAskedLine(asked, name)}</span>
      <span className="text-faint">· their share stays at {shareText(asked.fromBps)} until they accept</span>
      <button
        type="button"
        disabled={pending}
        onClick={withdraw}
        aria-label={`Withdraw the share request to ${name}`}
        className="text-[11px] text-muted underline-offset-2 hover:text-danger hover:underline disabled:opacity-40"
      >
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
      {error && <span role="alert" className="text-danger">{error}</span>}
    </span>
  );
}
