"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { CampaignDialog, dialogBtn, fieldCls } from "@/components/campaign-impact";
import { BRAND_CATEGORIES, categoryLabel } from "@/lib/brand-categories";
import {
  WITHDRAW_NOTE_MAX,
  editFormFrom,
  noActionsLine,
  patchIsEmpty,
  requestActions,
  requestPatch,
  type ApiSponsorRequestDetail,
  type BriefPatch,
  type RequestEditForm,
} from "@/lib/brief-actions";
import { AUDIENCE_TIERS, BriefRequestInvalid, CHANNEL_LABEL, MATCH_CHANNELS, TIER_LABEL } from "@/lib/brief-request";
import type { RequestWrite } from "./actions";

/* --------------------------------------------------------------------------
   POL-FE-17 — the Edit and Withdraw controls on a sponsor's request page.

   Edit opens an inline form (no page change) with the fields the request
   drawer sent; Save sends only what changed and the page re-reads. Withdraw
   asks "Are you sure?" with an optional note, then closes the request. A
   409 — BTG moved it on while this was open — says so and reloads; the
   buttons follow the fresh `youCan`. The page decides who sees what: a
   read-only sponsor gets no flags and so renders nothing here.
   -------------------------------------------------------------------------- */

/** The page's server actions, passed as they are (a wrapper made in a
 *  server component is not a server action and fails at the click). */
export type RequestControlActions = {
  edit: (id: string, patch: BriefPatch) => Promise<RequestWrite>;
  withdraw: (id: string, input: { note?: string }) => Promise<RequestWrite>;
};

const triggerCls = {
  edit: "inline-flex items-center rounded-lg border border-line bg-surface px-3.5 py-2 text-[11px] font-medium text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50",
  withdraw: "inline-flex items-center rounded-lg border border-danger/40 bg-surface px-3.5 py-2 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50",
} as const;

const CATEGORY_OPTIONS = BRAND_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }));
const TIER_OPTIONS = AUDIENCE_TIERS.map((t) => ({ value: t, label: TIER_LABEL[t] }));
const CHANNEL_OPTIONS = MATCH_CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }));

type Notice = { tone: "info" | "bad" | "good"; text: string };

export function RequestControls({ request, actions }: { request: ApiSponsorRequestDetail; actions: RequestControlActions }) {
  const router = useRouter();
  const can = requestActions(request);
  const [editing, setEditing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, start] = useTransition();
  const why = noActionsLine(request);

  /* A refused write: the words, and on a 409 the fresh truth. */
  const refused = (r: Extract<RequestWrite, { ok: false }>) => {
    setNotice({ tone: r.moved ? "info" : "bad", text: r.message });
    if (r.moved) router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {can.edit && (
          <button type="button" className={triggerCls.edit} onClick={() => { setNotice(null); setEditing((e) => !e); }} disabled={pending} aria-expanded={editing}>
            {editing ? "Close editor" : "Edit request"}
          </button>
        )}
        {can.withdraw && (
          <button type="button" className={triggerCls.withdraw} onClick={() => { setNotice(null); setWithdrawing(true); }} disabled={pending}>
            Withdraw request
          </button>
        )}
        {why && !editing && <p className="basis-full text-[11px] text-muted">{why}</p>}
      </div>

      {notice && (
        <p role={notice.tone === "bad" ? "alert" : "status"} className={`text-[12px] ${notice.tone === "bad" ? "text-danger" : notice.tone === "good" ? "text-success" : "text-muted"}`}>
          {notice.text}
        </p>
      )}

      {editing && can.edit && (
        <EditForm
          request={request}
          pending={pending}
          onCancel={() => setEditing(false)}
          onSave={(patch) =>
            start(async () => {
              const r = await actions.edit(request.id, patch);
              if (!r.ok) return refused(r);
              setEditing(false);
              setNotice({ tone: "good", text: "Changes saved — BTG reads the request as it stands now." });
              router.refresh();
            })
          }
        />
      )}

      {withdrawing && can.withdraw && (
        <WithdrawDialog
          objective={request.objective}
          pending={pending}
          onClose={() => setWithdrawing(false)}
          onConfirm={(note) =>
            start(async () => {
              const r = await actions.withdraw(request.id, { note });
              setWithdrawing(false);
              if (!r.ok) return refused(r);
              setNotice({ tone: "good", text: "Request withdrawn. BTG won't match or price it." });
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- edit */

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-medium text-muted">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-faint">{hint}</p>}
    </div>
  );
}

/** A row of toggle chips, as the request drawer's — a disabled one is used
 *  elsewhere on the form (your own category can't be one to avoid). */
function Picks({ label, hint, options, value, onChange, disabledValues = [] }: {
  label: string;
  hint?: string;
  options: { value: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  disabledValues?: string[];
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 block text-[11px] font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              disabled={disabledValues.includes(o.value)}
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              className={[
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                on ? "border-sponsor bg-sponsor/15 text-text" : "border-line text-muted hover:text-text",
              ].join(" ")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {hint && <p className="mt-1 text-[10px] text-faint">{hint}</p>}
    </fieldset>
  );
}

function EditForm({ request, pending, onCancel, onSave }: {
  request: ApiSponsorRequestDetail;
  pending: boolean;
  onCancel: () => void;
  onSave: (patch: BriefPatch) => void;
}) {
  const [form, setForm] = useState<RequestEditForm>(() => editFormFrom(request));
  const [problem, setProblem] = useState<string | null>(null);
  const set = <K extends keyof RequestEditForm>(k: K, v: RequestEditForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () => {
    setProblem(null);
    let patch: BriefPatch;
    try {
      patch = requestPatch(form, request);
    } catch (e) {
      setProblem(e instanceof BriefRequestInvalid ? e.message : "Some details weren't accepted — check the dates and budget.");
      return;
    }
    if (patchIsEmpty(patch)) {
      setProblem("Nothing changed yet.");
      return;
    }
    onSave(patch);
  };

  return (
    <form
      className="sx-pop space-y-4 rounded-xl border border-sponsor/40 bg-surface p-4"
      aria-label="Edit this request"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) submit();
      }}
    >
      <Field label="Objective" htmlFor="req-objective" hint="What should this campaign achieve?">
        <textarea id="req-objective" value={form.objective} onChange={(e) => set("objective", e.target.value)} rows={4} required maxLength={2000} className={fieldCls} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Budget (USD)" htmlFor="req-budget" hint="Indicative — BTG confirms final pricing.">
          <input id="req-budget" value={form.budget} onChange={(e) => set("budget", e.target.value)} required inputMode="decimal" className={fieldCls} />
        </Field>
        <Field label="Start date" htmlFor="req-start">
          <input id="req-start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} required className={fieldCls} />
        </Field>
        <Field label="End date" htmlFor="req-end">
          <input id="req-end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} required min={form.startDate || undefined} className={fieldCls} />
        </Field>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-line-soft p-3">
        <legend className="px-1 text-[10px] font-medium uppercase tracking-wide text-faint">Who to reach</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sports" htmlFor="req-sports" hint="Comma-separated. Leave blank for any sport.">
            <input id="req-sports" value={form.sports} onChange={(e) => set("sports", e.target.value)} placeholder="e.g. Basketball, Soccer" className={fieldCls} />
          </Field>
          <Field label="States" htmlFor="req-states" hint="Two-letter US state codes, comma-separated. Leave blank for anywhere.">
            <input id="req-states" value={form.stateCodes} onChange={(e) => set("stateCodes", e.target.value)} placeholder="e.g. DC, MD, VA" className={fieldCls} />
          </Field>
        </div>
        <Picks label="Athlete tiers" hint="None picked means any tier." options={TIER_OPTIONS} value={form.audienceTiers} onChange={(v) => set("audienceTiers", v)} />
        <Picks label="Where to be seen" hint="None picked means no preference." options={CHANNEL_OPTIONS} value={form.channels} onChange={(v) => set("channels", v)} />
        <Field label="Minimum audience" htmlFor="req-min-followers" hint="Followers on the athlete's largest account. Leave blank for no minimum.">
          <input id="req-min-followers" value={form.minFollowers} onChange={(e) => set("minFollowers", e.target.value)} inputMode="numeric" placeholder="e.g. 10,000 or 10k" className={fieldCls} />
        </Field>
      </fieldset>

      <Picks
        label="Your category"
        hint="So BTG can screen out competitor conflicts."
        options={CATEGORY_OPTIONS}
        value={form.categories}
        onChange={(v) => setForm((f) => ({ ...f, categories: v, excludedCategories: f.excludedCategories.filter((x) => !v.includes(x)) }))}
      />
      <Picks
        label="Categories to avoid"
        hint="An athlete or venue tied to one of these won't be matched."
        options={CATEGORY_OPTIONS}
        value={form.excludedCategories}
        onChange={(v) => set("excludedCategories", v)}
        disabledValues={form.categories}
      />

      {problem && <p role="alert" className="text-[12px] text-danger">{problem}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={dialogBtn.primary} disabled={pending}>{pending ? "Saving…" : "Save changes"}</button>
        <button type="button" className={dialogBtn.quiet} onClick={onCancel} disabled={pending}>Cancel</button>
        <p className="basis-full text-[10px] text-faint sm:basis-auto sm:ml-auto">Still a request, not a purchase — BTG checks it again once saved.</p>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------- withdraw */

function WithdrawDialog({ objective, pending, onClose, onConfirm }: {
  objective: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <CampaignDialog id="withdraw-request" title="Are you sure?" onClose={onClose} onSubmit={() => { if (!pending) onConfirm(note); }}>
      <p className="text-[13px] leading-relaxed text-muted">
        Withdrawing closes <strong className="text-text">{objective}</strong>. BTG stops matching and pricing it, and it can&rsquo;t be reopened — you&rsquo;d send a new request instead.
      </p>
      <label htmlFor="withdraw-note" className="block text-[11px] font-medium text-muted">
        A note for BTG <span className="font-normal text-faint">(optional)</span>
      </label>
      <textarea
        id="withdraw-note"
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, WITHDRAW_NOTE_MAX))}
        rows={3}
        maxLength={WITHDRAW_NOTE_MAX}
        placeholder="e.g. Budget moved to next quarter"
        className={fieldCls}
      />
      <div className="mt-1 flex flex-wrap justify-end gap-2">
        <button type="button" className={dialogBtn.quiet} onClick={onClose} disabled={pending}>Keep the request</button>
        <button type="submit" className={dialogBtn.danger} disabled={pending}>{pending ? "Withdrawing…" : "Yes, withdraw it"}</button>
      </div>
    </CampaignDialog>
  );
}
