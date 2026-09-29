"use client";

import { useState, useTransition, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";

import { addRosterAthleteAction, setTeamShareAction } from "@/app/(app)/property/roster/actions";
import { EMPTY_ROSTER_DRAFT, shareInput, shareText, validateRosterDraft, type RosterDraft } from "@/lib/property-p2-live";

/* --------------------------------------------------------------------------
   2S2-FE-04 — the roster's two interactive pieces: the "Add athlete" form
   (POST /team/roster) and the inline team-share editor per row (PATCH
   /team/roster/:athleteId). The share is typed as a percentage and stored
   in basis points; an emptied field clears it ("Not set").
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
        setAdded(draft.displayName.trim());
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
            {added} is on the roster.
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

export function PropertyShareEdit({ athleteId, name, bps }: { athleteId: string; name: string; bps: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(shareInput(bps));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(shareInput(bps));
          setError(null);
          setEditing(true);
        }}
        className={`rounded-md px-1.5 py-0.5 text-right tabular-nums hover:bg-surface-2 ${bps === null ? "text-warn" : ""}`}
        aria-label={`Edit the team's share for ${name}`}
        title="Edit the team's share"
      >
        {shareText(bps)}
      </button>
    );
  }

  const save = () =>
    start(async () => {
      const r = await setTeamShareAction(athleteId, value);
      if (r.ok) {
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
      {error ? <span className="text-[11px] text-danger">{error}</span> : <span className="text-[10px] text-faint">Empty clears it</span>}
    </form>
  );
}
