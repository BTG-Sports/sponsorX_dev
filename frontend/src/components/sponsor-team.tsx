"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { inviteTeammateAction, removeTeammateAction, resendInviteAction, setTeammateRoleAction, type TeamWrite } from "@/app/(app)/sponsor/team/actions";
import { DialogError, OrderDialog, btn } from "@/components/order-dialog";
import { StadiumChip, StadiumDate, StadiumPanel, StadiumSection } from "@/components/stadium-stage";
import { Primary, StageTable, Td, Tr, type Column } from "@/components/stage-table";
import {
  TEAM_ROLES,
  canAct,
  doneLine,
  emailProblem,
  memberActions,
  otherRole,
  removeDialog,
  roleHint,
  roleWord,
  statusHint,
  statusWord,
  teamSummary,
  type ApiTeamMember,
  type TeamRole,
} from "@/lib/sponsor-team-live";

/* --------------------------------------------------------------------------
   POL-FE-19 — the Team page's island: the invite form and the member
   table, one island because a sent invite lands in the table and a row's
   write re-reads the list. Every write is a server action (team/actions.ts)
   followed by router.refresh(); the row that is being written is dimmed
   with its button reading "…ing", and the result (the done line, or the
   refusal in a sponsor's words) prints under the form or inside the row.
   Removing asks "are you sure?" in the house dialog first; a role switch
   and a resend apply at once.
   -------------------------------------------------------------------------- */

const field =
  "box-border min-h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const rowBtn =
  "inline-flex min-h-9 items-center rounded-lg border border-line px-2.5 text-[11px] font-semibold text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
const rowDanger =
  "inline-flex min-h-9 items-center rounded-lg border border-danger/50 px-2.5 text-[11px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";

type Busy = { id: string; what: "role" | "resend" | "remove" } | null;

export function SponsorTeam({ members }: { members: ApiTeamMember[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [rowNote, setRowNote] = useState<{ id: string; text: string; tone: "ok" | "bad" } | null>(null);
  const [confirm, setConfirm] = useState<ApiTeamMember | null>(null);
  const [, start] = useTransition();

  const run = (m: ApiTeamMember, what: NonNullable<Busy>["what"], write: () => Promise<TeamWrite>) => {
    setBusy({ id: m.id, what });
    setRowNote(null);
    start(async () => {
      try {
        const r = await write();
        if (!r.ok) setRowNote({ id: m.id, text: r.message, tone: "bad" });
        /* A removal's line is about the row as it WAS (an invite cancelled vs a login switched off); a role switch names the new role. */
        else setRowNote({ id: m.id, text: doneLine(what, what === "remove" ? m : (r.member ?? m)), tone: "ok" });
        router.refresh();
      } finally {
        setBusy(null);
      }
    });
  };

  const columns: Column[] = [
    { key: "who", label: "Person" },
    { key: "role", label: "Role" },
    { key: "status", label: "Status" },
    { key: "added", label: "Added" },
    { key: "act", label: "Actions", srOnly: true },
  ];

  return (
    <div className="space-y-6">
      <InviteForm onSent={() => router.refresh()} />

      <section className="min-w-0" aria-label="Your team">
        <StadiumSection title="Your team" hint={teamSummary(members)} />
        {members.length === 0 ? (
          <StadiumPanel>
            <p className="text-sm text-muted">Nobody on the team yet. Invite a colleague above.</p>
          </StadiumPanel>
        ) : (
          <StageTable label="Your team" columns={columns}>
            {members.map((m, i) => {
              const word = statusWord(m.status);
              const acts = memberActions(m);
              const mine = busy?.id === m.id ? busy.what : null;
              const note = rowNote?.id === m.id ? rowNote : null;
              const to = otherRole(m.role);
              return (
                <Tr key={m.id} i={i} className={mine ? "opacity-60" : undefined}>
                  <Td>
                    <Primary sub={m.you ? "You" : m.status === "REMOVED" ? statusHint("REMOVED") : undefined}>
                      <span className="break-all">{m.email}</span>
                    </Primary>
                  </Td>
                  <Td label="Role">
                    {/* One block, as Primary does — a stacked cell lays its children out in a row, which ran "Admin" and "Full access" together at phone width (QA pass 2, 2026-11-03). */}
                    <span className="block min-w-0">
                      <span className="block text-[13px]">{roleWord(m.role)}</span>
                      <span className="block text-[11px] text-muted">{m.role === "SPONSOR_ANALYST" ? "Read only" : "Full access"}</span>
                    </span>
                  </Td>
                  <Td label="Status">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
                      {m.status === "INVITED" && <span className="text-[11px] text-muted">Hasn&rsquo;t signed in yet</span>}
                    </span>
                  </Td>
                  <Td label="Added" muted>
                    <StadiumDate iso={m.addedAt} format="date" />
                  </Td>
                  <Td act>
                    {acts.length === 0 ? (
                      <span className="text-[11px] text-faint">{m.you ? "Your own access — ask another admin to change it" : "No actions"}</span>
                    ) : (
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {acts.includes("role") && (
                          <button
                            type="button"
                            className={rowBtn}
                            disabled={mine !== null}
                            aria-label={`Make ${m.email} ${roleWord(to) === "Admin" ? "an Admin" : "a Viewer"}`}
                            onClick={() => run(m, "role", () => setTeammateRoleAction(m.id, to))}
                          >
                            {mine === "role" ? "Changing…" : `Make ${roleWord(to)}`}
                          </button>
                        )}
                        {acts.includes("resend") && (
                          <button
                            type="button"
                            className={rowBtn}
                            disabled={mine !== null}
                            aria-label={`Resend the invite to ${m.email}`}
                            onClick={() => run(m, "resend", () => resendInviteAction(m.id))}
                          >
                            {mine === "resend" ? "Sending…" : "Resend invite"}
                          </button>
                        )}
                        {acts.includes("remove") && (
                          <button
                            type="button"
                            className={rowDanger}
                            disabled={mine !== null}
                            aria-label={m.status === "INVITED" ? `Cancel the invite to ${m.email}` : `Remove ${m.email}`}
                            onClick={() => setConfirm(m)}
                          >
                            {mine === "remove" ? "Removing…" : m.status === "INVITED" ? "Cancel invite" : "Remove"}
                          </button>
                        )}
                      </span>
                    )}
                    {note && (
                      <p role={note.tone === "bad" ? "alert" : "status"} className={`mt-1.5 text-right text-[11px] ${note.tone === "bad" ? "text-danger" : "text-success"}`}>
                        {note.text}
                      </p>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </StageTable>
        )}
        <p className="mt-3 text-[11px] text-muted">
          An Admin can do everything your account can, including this page. A Viewer reads only. Removing someone switches their login off and keeps what they did on record; re-adding them isn&rsquo;t built here yet — ask BTG to switch the login back on.
        </p>
      </section>

      {confirm && (
        <RemoveDialog
          member={confirm}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const m = confirm;
            setConfirm(null);
            run(m, "remove", () => removeTeammateAction(m.id));
          }}
        />
      )}
    </div>
  );
}

function InviteForm({ onSent }: { onSent: () => void }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("SPONSOR_ANALYST");
  const [note, setNote] = useState<{ text: string; tone: "ok" | "bad" } | null>(null);
  const [pending, start] = useTransition();
  const problem = emailProblem(email);
  const off = email.trim().length > 0 && problem !== null;

  const submit = () => {
    setNote(null);
    if (problem) return setNote({ text: problem, tone: "bad" });
    start(async () => {
      const r = await inviteTeammateAction({ email, role });
      if (!r.ok) return setNote({ text: r.message, tone: "bad" });
      setNote({ text: doneLine("invite", r.member ?? { email: email.trim().toLowerCase(), role, status: "INVITED" }), tone: "ok" });
      setEmail("");
      onSent();
    });
  };

  return (
    <StadiumPanel delay={0.08}>
      <form
        className="space-y-4"
        aria-labelledby={`${id}-title`}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <h2 id={`${id}-title`} className="sx-section-title">Invite a colleague</h2>
          <p className="mt-1 text-xs text-muted">They get an email with a link to sign in. Their login is ready the moment they do.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-email`} className="text-[13px] font-semibold">Email address</label>
            <input
              id={`${id}-email`}
              type="email"
              inputMode="email"
              autoComplete="off"
              maxLength={100}
              placeholder="colleague@yourbrand.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (note) setNote(null);
              }}
              aria-invalid={off || undefined}
              aria-describedby={off ? `${id}-email-problem` : undefined}
              className={field}
            />
            {off && <p id={`${id}-email-problem`} className="text-[11px] text-warn">{problem}</p>}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[13px] font-semibold">As</legend>
            <div role="radiogroup" aria-label="Role" className="inline-flex rounded-lg border border-line p-0.5">
              {TEAM_ROLES.map((r) => {
                const on = role === r;
                return (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setRole(r)}
                    className={`min-h-10 rounded-md px-3.5 text-[13px] font-semibold transition ${on ? "bg-primary text-cta-ink" : "text-muted hover:text-text"}`}
                  >
                    {roleWord(r)}
                  </button>
                );
              })}
            </div>
            <p className="max-w-[20rem] text-[11px] text-muted">{roleHint(role)}</p>
          </fieldset>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={btn.primary}>
            {pending ? "Sending…" : "Send invite"}
          </button>
          {note && (
            <p role={note.tone === "bad" ? "alert" : "status"} className={`text-xs ${note.tone === "bad" ? "text-danger" : "text-success"}`}>
              {note.text}
            </p>
          )}
        </div>
      </form>
    </StadiumPanel>
  );
}

function RemoveDialog({ member, onClose, onConfirm }: { member: ApiTeamMember; onClose: () => void; onConfirm: () => void }) {
  const d = removeDialog(member);
  return (
    <OrderDialog id={`team-rm-${member.id}`} title={d.title} onClose={onClose} onSubmit={onConfirm}>
      <p className="text-sm leading-relaxed">{d.line}</p>
      <p className="text-[13px] text-muted">
        {roleWord(member.role)} · added <StadiumDate iso={member.addedAt} format="date" />
      </p>
      {!canAct(member) && <DialogError message="This row can't be changed." />}
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose} data-autofocus>Keep them</button>
        <button type="submit" className={btn.danger} disabled={!canAct(member)}>{d.button}</button>
      </div>
    </OrderDialog>
  );
}
