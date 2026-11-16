"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui";
import { parseRoster, type RosterRow } from "@/lib/roster-paste";

/* --------------------------------------------------------------------------
   POL-FE-77 — the advisor's roster box. Without a roster on file the system
   can't approve a student from it, and a claim on a featured profile can't be
   checked. Names and graduation years only; applications waiting for the
   roster are decided again as soon as it is saved (the API does that).
   -------------------------------------------------------------------------- */

type Save = (propertyId: string, rows: RosterRow[]) => Promise<{ ok: true; added: number } | { ok: false; message: string }>;

export function RosterPaste({ propertyId, onFile, save }: { propertyId: string; onFile: number; save: Save }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  const parsed = parseRoster(text);

  return (
    <Card>
      <h2 className="text-sm font-semibold">School roster</h2>
      <p className="mt-1 text-xs text-muted">
        {onFile > 0 ? `${onFile.toLocaleString("en-US")} students on file.` : "Your school has no roster on file yet."} Paste one student per line — a name, or a name and graduation year (&ldquo;Jordan Lee, 2027&rdquo;). A column copied from a spreadsheet works too.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setNote(null); }}
        rows={5}
        aria-label="Roster, one student per line"
        className="mt-2 block w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text"
        placeholder={"Jordan Lee, 2027\nSam Rivera, 2026"}
      />
      {text.trim() && (
        <p className="mt-1 text-[11px] text-muted">
          {parsed.rows.length} {parsed.rows.length === 1 ? "student" : "students"} ready to add.
        </p>
      )}
      {parsed.problems.length > 0 && (
        <ul role="alert" className="mt-1 space-y-0.5 text-[11px] text-warn">
          {parsed.problems.slice(0, 5).map((p) => <li key={p}>{p}</li>)}
          {parsed.problems.length > 5 && <li>…and {parsed.problems.length - 5} more.</li>}
        </ul>
      )}
      {note && <p role="status" className={`mt-1 text-[11px] ${note.ok ? "text-accent" : "text-danger"}`}>{note.text}</p>}
      <button
        type="button"
        disabled={pending || parsed.rows.length === 0 || parsed.problems.length > 0}
        onClick={() =>
          start(async () => {
            const r = await save(propertyId, parsed.rows);
            if (!r.ok) return setNote({ text: r.message, ok: false });
            setText("");
            setNote({ text: `Added ${r.added} to the roster. Applications waiting for it are being checked again.`, ok: true });
            router.refresh();
          })
        }
        className="mt-2 min-h-9 rounded-lg bg-primary px-3 text-[12px] font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Adding…" : "Add to the roster"}
      </button>
    </Card>
  );
}
