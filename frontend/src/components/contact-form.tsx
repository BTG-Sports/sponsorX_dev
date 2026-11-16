"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type CSSProperties, type DragEvent, type KeyboardEvent, type ReactNode } from "react";

import { dropAttachmentAction, finishContactAction, submitContactAction, type ContactInput } from "@/app/(public)/contact/actions";
import { idFileProblem, whenLabel } from "@/lib/guardian-live";
import {
  HELPDESK_TOPICS, OTHER_CASE, messageLabel, messageRequired, sendProblem, topicLabel, topicSections, type HelpdeskTopicKey, type HelpdeskTopicView,
} from "@/lib/helpdesk-live";

/* --------------------------------------------------------------------------
   Contact BTG — 2S1-FE-10 (design Contact.dc.html, "form" and "sent"). The
   form island. LIVE (2S1-BE-16): Send posts the message (submitContactAction).
   With attachments, the API hands back a presigned PUT for each; the browser
   sends the files straight to the private bucket, then finishContactAction
   queues the message. A file that won't upload can be left out
   (dropAttachmentAction). "Sent ✓" shows only once the API says it's queued.

   POL-FE-43 — the help desk: pick a topic, tick the cases that apply
   (the person's own — the page read them for a visitor or for their
   account), Send. The message box stays: optional once something is
   ticked, needed when nothing is or when "Something else" is. Changing the
   topic clears the ticks. With no cases readable, it is the form it was.

   POL-FE-100 — the redesign, on the contact stage (contact-stage.tsx). The
   same form, laid out so a person can follow it:
   - numbered steps on one spine — 1 What is it about? (topic tiles, each
     with an icon and what it covers), 2 What's wrong? (the cases as tick
     rows), 3 Your details — each badge turns to a tick, the spine fills;
   - "Before you send": what is still missing, as ticks, instead of a
     greyed button with the reason in a tooltip;
   - files can be dropped on the box; Send is guarded against a double
     click (a ref, flipped synchronously);
   - Sent: the ring and tick draw, sparks burst, what was sent and what
     happens next, and Write another message.
   Its selectors stay: the "What it's about" section above the
   "Message BTG" form, the radios, tick boxes, labels and Send.
   -------------------------------------------------------------------------- */

const MAX_FILES = 3;
const MAX_TEXT = 5000;

const field =
  "mt-2 w-full rounded-xl border border-[#9cc7ff]/25 bg-[#050d1c]/75 px-4 py-3 text-[15px] text-on-media placeholder:text-on-media/35 shadow-[inset_0_1px_0_rgba(255,255,255,.04)] transition-[border-color,box-shadow] focus:border-[#7fd0ff] focus:shadow-[0_0_0_3px_rgba(46,155,245,.25)] focus:outline-none";

type Pending = { token: string; failed: { attachmentId: string; filename: string }[] };

/* ------------------------------------------------------------------ icons */

type Icon = (p: { className?: string }) => ReactNode;
const LINE = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const UserIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
);
const CardIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>
);
const ShieldIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m8.8 12 2.2 2.2 4.4-4.4" /></svg>
);
const MegaphoneIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><path d="M3 10v4a1 1 0 0 0 1 1h3l6 4V5L7 9H4a1 1 0 0 0-1 1Z" /><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" /></svg>
);
const BagIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><path d="M5 8h14l-1.2 12H6.2L5 8Z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></svg>
);
const GiftIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3.5-5.5-3.5-5 0M12 8c1.5-3.5 5.5-3.5 5 0" /></svg>
);
const BookIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" /><path d="M12 6.5v13" /></svg>
);
const ChatIcon: Icon = ({ className }) => (
  <svg {...LINE} className={className}><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12Z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" strokeWidth={2.6} /></svg>
);
function TickIcon({ className = "size-3.5" }: { className?: string }) {
  return <svg {...LINE} strokeWidth={2.8} className={className}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
function PlaneIcon({ className = "size-5" }: { className?: string }) {
  return <svg {...LINE} className={className}><path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" /></svg>;
}
function ClipIcon({ className = "size-5" }: { className?: string }) {
  return <svg {...LINE} className={className}><path d="m20.5 11.5-8.4 8.4a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" /></svg>;
}
function FileIcon({ className = "size-4" }: { className?: string }) {
  return <svg {...LINE} className={className}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>;
}
function XIcon({ className = "size-3.5" }: { className?: string }) {
  return <svg {...LINE} strokeWidth={2.4} className={className}><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

/** Each topic's look and what it covers, in plain words (the API's sections, summed up). */
const TOPIC_LOOK: Record<HelpdeskTopicKey, { tone: string; icon: Icon; hint: string }> = {
  ACCOUNT: { tone: "#7fd0ff", icon: UserIcon, hint: "Signing up or in, your profile, documents" },
  PAYMENT: { tone: "#22c98d", icon: CardIcon, hint: "Paying, refunds, payouts, invoices" },
  GUARDIANSHIP: { tone: "#2e9bf5", icon: ShieldIcon, hint: "A minor’s guardian, consent, turning 18" },
  CAMPAIGNS: { tone: "#f97a1f", icon: MegaphoneIcon, hint: "Briefs, offers, content, reports" },
  SHOP: { tone: "#fb923c", icon: BagIcon, hint: "Selling, buying, delivery" },
  REWARDS: { tone: "#facc15", icon: GiftIcon, hint: "The fan QR page, fan emails" },
  NEXT: { tone: "#a5b4fc", icon: BookIcon, hint: "SponsorX NEXT" },
  OTHER: { tone: "#bfe6ff", icon: ChatIcon, hint: "Anything else" },
};

const slot = (i: number) => ({ "--i": i }) as CSSProperties;
const sizeLabel = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/* ------------------------------------------------------------------- step */

/** One numbered step on the spine: the badge (a tick once done), the title, the body. */
function StepHead({ n, done, title, note, id }: { n: number; done: boolean; title: string; note?: ReactNode; id?: string }) {
  return (
    <div className="relative flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span
        aria-hidden="true"
        data-done={done ? "" : undefined}
        className="sx-ct-badge absolute -left-12 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border-[1.5px] border-[#9cc7ff]/40 bg-[#08172f] text-[13px] font-bold text-[#bfe6ff] sm:-left-14 sm:size-10"
      >
        {done ? <TickIcon className="size-4" /> : n}
      </span>
      <h3 id={id} className="text-[18px] font-semibold tracking-tight sm:text-[20px]">
        <span className="sr-only">Step {n}{done ? ", done" : ""}: </span>
        {title}
      </h3>
      {note}
    </div>
  );
}

function ChevronIcon({ className = "size-4" }: { className?: string }) {
  return <svg {...LINE} className={className}><path d="m6 9 6 6 6-6" /></svg>;
}

type Group = { label: string; size: number; ticked: number };

/** Which group of cases to show: a dropdown (button + listbox). Arrows,
 *  Home/End, Enter/Space pick; Esc and a click outside close it. */
function GroupPicker({ groups, value, onChange }: { groups: Group[]; value: number; onChange: (i: number) => void }) {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(value);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (i: number) => {
    onChange(i);
    setOpen(false);
    button.current?.focus();
  };
  const show = () => {
    setHot(value);
    setOpen(true);
  };
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    const last = groups.length - 1;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); button.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHot((h) => Math.min(last, h + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHot((h) => Math.max(0, h - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setHot(0); }
    else if (e.key === "End") { e.preventDefault(); setHot(last); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(hot); }
    else if (e.key === "Tab") setOpen(false);
  };

  const cur = groups[value] ?? groups[0];
  const totalTicked = groups.reduce((n, g) => n + g.ticked, 0);
  return (
    <div ref={box} className="relative mt-4" onKeyDown={onKey}>
      <p id={`${id}-label`} className="mb-1.5 text-[12px] font-medium text-on-media/60">
        Narrow it down{totalTicked > cur.ticked ? <span className="text-[#7fd0ff]"> · {totalTicked - cur.ticked} ticked in other groups</span> : null}
      </p>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? setOpen(false) : show())}
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl border bg-[#050d1c]/75 px-4 text-left transition-[border-color,box-shadow] sm:max-w-md ${open ? "border-[#7fd0ff] shadow-[0_0_0_3px_rgba(46,155,245,.25)]" : "border-[#9cc7ff]/30 hover:border-[#bfe0ff]/60"}`}
      >
        <span id={`${id}-value`} className="min-w-0 flex-1 truncate text-[15px] font-semibold">{cur.label}</span>
        <span className="shrink-0 text-[12px] text-on-media/50">{cur.size} {cur.size === 1 ? "case" : "cases"}</span>
        {cur.ticked > 0 && <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[#2e9bf5] px-1.5 text-[11px] font-bold text-white">{cur.ticked}</span>}
        <ChevronIcon className={`size-4 shrink-0 text-[#7fd0ff] transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          id={`${id}-list`}
          role="listbox"
          aria-labelledby={`${id}-label`}
          aria-activedescendant={`${id}-opt-${hot}`}
          tabIndex={-1}
          className="sx-ct-menu absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-xl border border-[#7fd0ff]/40 bg-[#07122a]/95 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.6),0_0_24px_rgba(46,155,245,.2)] backdrop-blur-xl sm:max-w-md"
        >
          {groups.map((g, i) => (
            <li
              key={`${g.label}-${i}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === value}
              onPointerEnter={() => setHot(i)}
              onClick={() => pick(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] transition-colors ${i === hot ? "bg-[#2e9bf5]/20 text-on-media" : "text-on-media/80"}`}
            >
              <span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center ${i === value ? "text-[#7fd0ff]" : "text-transparent"}`}>
                <TickIcon className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">{g.label}</span>
              {g.ticked > 0 && <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[#2e9bf5] px-1.5 text-[11px] font-bold text-white">{g.ticked}</span>}
              <span className="shrink-0 text-[12px] tabular-nums text-on-media/45">{g.size}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One case to tick: a row with its own box. */
function CaseRow({ id, text, on, toggle }: { id: string; text: string; on: boolean; toggle: (id: string) => void }) {
  return (
    <label className="sx-ct-case flex h-full cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-[14px] leading-snug">
      <input type="checkbox" name="cases" value={id} checked={on} onChange={() => toggle(id)} className="sr-only" />
      <span aria-hidden="true" className="sx-ct-box mt-px grid size-5 shrink-0 place-items-center rounded-md border-[1.5px] border-[#9cc7ff]/45 text-white">
        <TickIcon className="size-3" />
      </span>
      <span>{text}</span>
    </label>
  );
}

/* ------------------------------------------------------------------- sent */

const SPARKS = ["#7fd0ff", "#f97a1f", "#facc15", "#22c98d", "#2e9bf5", "#bfe6ff", "#fb923c", "#7fd0ff", "#facc15", "#22c98d"];

/** The confirmation — after a real send, and for ?demo=sent (then `againHref`, never a handler from the server). */
export function ContactSent({ topic, cases = 0, when, copyTo, onAgain, againHref }: {
  topic: string;
  cases?: number;
  when: string;
  copyTo: string;
  onAgain?: () => void;
  againHref?: string;
}) {
  const again = "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#bfe0ff]/45 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15";
  return (
    <section role="status" aria-label="Message sent" className="sx-ct-in relative overflow-hidden rounded-2xl border border-[#22c98d]/40 bg-[radial-gradient(70%_60%_at_50%_0%,rgba(34,201,141,.16),transparent_70%)] px-5 py-8 text-center sm:px-10 sm:py-10">
      <div className="relative mx-auto size-24">
        {SPARKS.map((c, i) => (
          <span key={i} aria-hidden="true" className="sx-ct-spark" style={{ "--c": c, "--a": `${i * 36}deg` } as CSSProperties} />
        ))}
        <svg viewBox="0 0 72 72" aria-hidden="true" className="relative size-24 [filter:drop-shadow(0_0_12px_rgba(34,201,141,.6))]">
          <circle cx="36" cy="36" r="32" fill="rgba(34,201,141,.12)" />
          <circle className="sx-ct-draw-ring" cx="36" cy="36" r="32" fill="none" stroke="#22c98d" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 36 36)" />
          <path className="sx-ct-draw-tick" d="m23 37 9 9 17-19" fill="none" stroke="#5be3b0" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="mt-5 text-[13px] font-semibold uppercase tracking-[0.24em] text-[#5be3b0]">Sent ✓</p>
      <h3 className="mt-2 text-[clamp(24px,5vw,32px)] font-bold tracking-tight">We&rsquo;ve got your message.</h3>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-on-media/75">A person at BTG will read it and reply by email.</p>

      <dl className="mx-auto mt-6 grid max-w-lg gap-2 text-left text-[13px] sm:grid-cols-2">
        <div className="rounded-xl border border-[#9cc7ff]/20 bg-[#06101f]/60 px-4 py-3">
          <dt className="text-[11px] uppercase tracking-[0.16em] text-on-media/50">Topic</dt>
          <dd className="mt-0.5 font-semibold">{topic}{cases ? ` · ${cases} ${cases === 1 ? "case" : "cases"} ticked` : ""}</dd>
        </div>
        <div className="rounded-xl border border-[#9cc7ff]/20 bg-[#06101f]/60 px-4 py-3">
          <dt className="text-[11px] uppercase tracking-[0.16em] text-on-media/50">Sent</dt>
          <dd className="mt-0.5 font-semibold">{when}</dd>
        </div>
        <div className="rounded-xl border border-[#9cc7ff]/20 bg-[#06101f]/60 px-4 py-3 sm:col-span-2">
          <dt className="text-[11px] uppercase tracking-[0.16em] text-on-media/50">A copy is on its way to</dt>
          <dd className="mt-0.5 break-all font-semibold">{copyTo}</dd>
        </div>
      </dl>

      <div className="mt-7 flex justify-center">
        {onAgain ? (
          <button type="button" onClick={onAgain} className={again}>Write another message</button>
        ) : againHref ? (
          <Link href={againHref} className={again}>Back to the form</Link>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- form */

export function ContactForm({ topic: initialTopic, topics = [], signedIn = false, name: initialName = "", email: initialEmail = "" }: {
  topic: HelpdeskTopicKey;
  /** The topics with this person's cases (GET /public/support/cases); empty → the plain form. */
  topics?: readonly HelpdeskTopicView[];
  signedIn?: boolean;
  /** Filled in for someone signed in. */
  name?: string;
  email?: string;
}) {
  const [topic, setTopic] = useState<HelpdeskTopicKey>(initialTopic);
  const [ticked, setTicked] = useState<string[]>([]);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [stuck, setStuck] = useState<Pending | null>(null);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  /* Which group of cases is open — one at a time, so the list stays short. */
  const [area, setArea] = useState(0);
  /* A double click fires twice before `pending` re-renders; this doesn't. */
  const busy = useRef(false);
  const ids = useId();

  const addFiles = (list: FileList | null) => {
    setError(null);
    const next = [...files];
    for (const f of Array.from(list ?? [])) {
      const problem = idFileProblem({ type: f.type, size: f.size });
      if (problem) return setError(`${f.name}: ${problem}`);
      if (next.length >= MAX_FILES) return setError(`At most ${MAX_FILES} files.`);
      next.push(f);
    }
    setFiles(next);
  };

  const finish = async (token: string) => {
    const done = await finishContactAction(token);
    if (!done.ok) return setError(done.message);
    setStuck(null);
    setSentAt(new Date().toISOString());
  };

  const send = () => {
    if (busy.current) return;
    busy.current = true;
    start(async () => {
      try {
        setError(null);
        const input: ContactInput = {
          name, email, topic, cases: ticked, message,
          attachments: files.map((f) => ({ filename: f.name, contentType: f.type, bytes: f.size })),
        };
        const r = await submitContactAction(input).catch(() => ({ ok: false as const, message: "We couldn’t reach SponsorX. Nothing was sent — try again." }));
        if (!r.ok) return setError(r.message);
        if (r.queued || !r.token) return setSentAt(new Date().toISOString());
        const failed: Pending["failed"] = [];
        /* The API grants uploads in the order the files were declared. */
        for (const [i, u] of r.uploads.entries()) {
          const file = files[i];
          try {
            const put = await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": u.contentType }, body: file });
            if (!put.ok) failed.push({ attachmentId: u.attachmentId, filename: u.filename });
          } catch {
            failed.push({ attachmentId: u.attachmentId, filename: u.filename });
          }
        }
        if (failed.length) {
          setStuck({ token: r.token, failed });
          return setError(`${failed.map((f) => f.filename).join(", ")} didn’t upload. Send without ${failed.length === 1 ? "it" : "them"}, or try again.`);
        }
        await finish(r.token);
      } finally {
        busy.current = false;
      }
    });
  };

  const sendWithout = () => {
    if (busy.current || !stuck) return;
    busy.current = true;
    start(async () => {
      try {
        setError(null);
        for (const f of stuck.failed) {
          const d = await dropAttachmentAction(stuck.token, f.attachmentId);
          if (!d.ok) return setError(d.message);
        }
        await finish(stuck.token);
      } finally {
        busy.current = false;
      }
    });
  };

  const again = () => {
    setSentAt(null);
    setTicked([]);
    setMessage("");
    setFiles([]);
    setError(null);
  };

  if (sentAt) {
    return <ContactSent topic={topicLabel(topics, topic)} cases={ticked.length} when={whenLabel(sentAt)} copyTo={email} onAgain={again} />;
  }

  const problem = sendProblem({ name, email, ticked, message });
  const hasCases = topics.length > 0;
  const sections = hasCases ? topicSections(topics, topic) : [];
  const toggle = (id: string) => setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  const needText = messageRequired(ticked);
  const otherTicked = ticked.includes(OTHER_CASE.id);
  /* The groups to pick between; "Something else" (topicSections' last) stays pinned under them. */
  const areas = sections.filter((s) => !s.cases.every((c) => c.id === OTHER_CASE.id));

  /* What's still missing, in the order a person fills the form. */
  const nameOk = !!name.trim();
  const emailOk = /\S+@\S+\.\S+/.test(email);
  const textOk = !needText || !!message.trim();
  const checks = [
    { ok: nameOk, text: "Your name" },
    { ok: emailOk, text: "An email for our reply" },
    {
      ok: textOk,
      text: otherTicked ? "What’s wrong, in the message (you ticked “Something else”)" : !hasCases ? "Your message" : ticked.length ? `${ticked.length} ${ticked.length === 1 ? "case" : "cases"} ticked` : "Tick what’s wrong, or write a message",
    },
  ];

  /* The spine: one share per step. */
  const steps = hasCases ? [true, ticked.length > 0, !problem] : [true, !problem];
  const progress = steps.filter(Boolean).length / steps.length;
  const detailsStep = hasCases ? 3 : 2;
  const look = TOPIC_LOOK[topic];

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDrag(false);
    if (files.length < MAX_FILES) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="relative pl-12 sm:pl-14">
      {/* the spine the step badges sit on, filling as the steps are done */}
      <span aria-hidden="true" className="absolute bottom-8 left-[17px] top-5 w-[2px] rounded-full bg-[#9cc7ff]/15 sm:left-[19px]">
        <span className="sx-ct-fill block w-full rounded-full bg-gradient-to-b from-[#7fd0ff] via-[#2e9bf5] to-[#22c98d] shadow-[0_0_10px_rgba(46,155,245,.6)]" style={{ height: `${progress * 100}%` }} />
      </span>

      {/* POL-FE-43 — steps 1 and 2, what it is about: the topic and the cases to tick. Its own section, above the message form. */}
      <section aria-label="What it’s about" className="space-y-9">
        <fieldset aria-labelledby={`${ids}-topic`} className="min-w-0">
          <StepHead n={1} done id={`${ids}-topic`} title="What is it about?" note={<span className="text-[12px] text-on-media/55">Pick one</span>} />
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {(hasCases ? topics : HELPDESK_TOPICS).map((t, i) => {
              const l = TOPIC_LOOK[t.key];
              return (
                <label key={t.key} style={{ "--tone": l.tone, ...slot(i) } as CSSProperties}
                  className="sx-ct-tile relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 sm:min-h-[104px] sm:p-3.5">
                  <input type="radio" name="topic" value={t.key} checked={t.key === topic} onChange={() => { setTopic(t.key); setTicked([]); setArea(0); }} className="sr-only" />
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg" style={{ color: l.tone, background: `${l.tone}1a`, boxShadow: `inset 0 0 0 1px ${l.tone}40` }}>
                    <l.icon className="size-[18px]" />
                  </span>
                  <span className="text-[14px] font-semibold leading-tight">{t.label}</span>
                  <span className="hidden text-[11.5px] leading-snug text-on-media/55 sm:block">{l.hint}</span>
                  <span aria-hidden="true" className="sx-ct-tick absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full text-[#04070e]" style={{ background: l.tone }}>
                    <TickIcon className="size-3" />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {hasCases && (
          <fieldset aria-labelledby={`${ids}-cases`} aria-describedby="cases-hint" className="min-w-0">
            <StepHead
              n={2}
              done={ticked.length > 0}
              id={`${ids}-cases`}
              title="What’s wrong?"
              note={
                <span className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold" style={{ borderColor: `${look.tone}66`, color: look.tone, background: `${look.tone}14` }}>
                  {ticked.length ? `${ticked.length} ticked` : "Tick all that apply"}
                </span>
              }
            />
            <p id="cases-hint" className="mt-1 text-[12px] leading-relaxed text-on-media/50">
              {signedIn ? "These are the cases for your account." : "Signed in, you’d see the cases for your account too."} If nothing fits, tick &ldquo;{OTHER_CASE.text}&rdquo; and tell us.
            </p>

            {/* one group at a time: the groups as chips, only the picked one's cases below */}
            {areas.length > 1 && (
              <GroupPicker
                groups={areas.map((a) => ({ label: a.title ?? "Common problems", size: a.cases.length, ticked: a.cases.filter((c) => ticked.includes(c.id)).length }))}
                value={area}
                onChange={setArea}
              />
            )}
            <div className="mt-3">
              {areas.map((a, ai) => (
                <ul key={`${topic}-${a.title ?? "common"}-${ai}`} hidden={ai !== area} aria-label={a.title ?? "Common problems"} className={ai === area ? "grid gap-2 md:grid-cols-2" : "hidden"}>
                  {a.cases.map((c, ci) => (
                    <li key={c.id} className="sx-ct-in" style={slot(ci)}>
                      <CaseRow id={c.id} text={c.text} on={ticked.includes(c.id)} toggle={toggle} />
                    </li>
                  ))}
                </ul>
              ))}
              <div className={areas.length ? "mt-2" : ""}>
                <CaseRow id={OTHER_CASE.id} text={areas.length ? `Not listed? ${OTHER_CASE.text}` : OTHER_CASE.text} on={otherTicked} toggle={toggle} />
              </div>
            </div>
          </fieldset>
        )}
      </section>

      <form aria-label="Message BTG" className="mt-9 space-y-5" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <StepHead n={detailsStep} done={!problem} title="Your details" note={<span className="text-[12px] text-on-media/55">So we can reply</span>} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col text-[13px] font-medium text-on-media/85">
            Your name
            <input type="text" name="name" className={field} autoComplete="name" placeholder="First and last name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label className="flex flex-col text-[13px] font-medium text-on-media/85">
            Email for our reply
            <input type="email" name="email" className={field} autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} />
          </label>
        </div>

        <div>
          <div className="flex items-end justify-between gap-3">
            <label htmlFor={`${ids}-message`} className="text-[13px] font-medium text-on-media/85">
              {hasCases ? messageLabel(ticked) : "Message"}
            </label>
            <span aria-hidden="true" className={`text-[11px] tabular-nums ${message.length > MAX_TEXT * 0.9 ? "text-[#fde68a]" : "text-on-media/40"}`}>
              {message.length.toLocaleString("en-US")} / {MAX_TEXT.toLocaleString("en-US")}
            </span>
          </div>
          <textarea id={`${ids}-message`} name="message" rows={ticked.length && !needText ? 3 : 5} maxLength={MAX_TEXT} required={needText} className={`${field} resize-y leading-normal`} value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder={ticked.length && !needText ? "Anything else that helps — a date, an order number (optional)." : "Tell us what happened, and anything that helps — a date, a court order you can send."} />
        </div>

        <div>
          <p className="text-[13px] font-medium text-on-media/85">
            Attachments <span className="font-normal text-on-media/50">(optional)</span>
          </p>
          {files.length < MAX_FILES && (
            <label
              data-drag={drag ? "" : undefined}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className="sx-ct-drop mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[1.5px] border-dashed border-[#9cc7ff]/30 bg-[#050d1c]/50 px-4 py-5 text-center transition-[border-color,background-color,box-shadow] hover:border-[#bfe0ff]/60"
            >
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-[#2e9bf5]/15 text-[#7fd0ff]">
                <ClipIcon className="size-5" />
              </span>
              <span className="text-[14px] font-semibold">
                <span className="text-[#bfe6ff] underline underline-offset-4">Add files</span>
                <span className="font-normal text-on-media/70"> or drop them here</span>
              </span>
              <span className="text-[12px] text-on-media/50">Photos or PDFs that help us understand &mdash; up to {MAX_FILES}, 10 MB each. They&rsquo;re stored privately.</span>
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
          )}
          {files.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="sx-ct-in inline-flex max-w-full items-center gap-2 rounded-lg border border-[#9cc7ff]/25 bg-[#07132a]/70 py-1.5 pl-2.5 pr-1.5 text-[13px]">
                  <FileIcon className="size-4 shrink-0 text-[#7fd0ff]" />
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-on-media/45">{sizeLabel(f.size)}</span>
                  <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}
                    className="grid size-7 shrink-0 place-items-center rounded-md text-on-media/60 transition-colors hover:bg-[#f87171]/15 hover:text-[#fca5a5]">
                    <XIcon />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Before you send: what's done and what's missing, then Send */}
        <div className="flex flex-col gap-4 rounded-2xl border border-[#9cc7ff]/20 bg-[#050d1c]/55 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-on-media/55">{problem ? "Before you send" : "Ready to send"}</p>
            <ul className="mt-2 space-y-1.5">
              {checks.map((c) => (
                <li key={c.text} className={`flex items-center gap-2.5 text-[13px] ${c.ok ? "text-on-media/85" : "text-on-media/60"}`}>
                  <span aria-hidden="true" className={`grid size-[18px] shrink-0 place-items-center rounded-full border transition-colors ${c.ok ? "border-[#22c98d] bg-[#22c98d] text-[#04070e]" : "border-[#9cc7ff]/40"}`}>
                    {c.ok && <TickIcon className="size-2.5" />}
                  </span>
                  <span>
                    <span className="sr-only">{c.ok ? "Done: " : "Still needed: "}</span>
                    {c.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-col xl:flex-row">
            {stuck && (
              <button type="button" onClick={sendWithout} disabled={pending} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#bfe0ff]/45 px-5 text-[14px] font-medium text-on-media transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 disabled:opacity-50">
                Send without {stuck.failed.length === 1 ? "that file" : "those files"}
              </button>
            )}
            <button type="submit" disabled={pending || !!problem} aria-busy={pending} title={problem ?? undefined}
              className="sx-ct-send sx-sheen group relative inline-flex min-h-[52px] items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-8 text-[15px] font-semibold text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform,opacity] enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_0_40px_rgba(46,155,245,.7)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
              {pending ? "Sending…" : "Send message"}
              <PlaneIcon className="sx-ct-plane size-5" />
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-[#f87171]/45 bg-[#f87171]/10 px-4 py-3 text-[14px] leading-relaxed text-[#fecaca]">
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-[#f87171]" />
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
