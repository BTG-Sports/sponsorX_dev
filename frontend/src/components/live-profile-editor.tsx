"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge, Card } from "@/components/ui";
import { SECTIONS, type SectionKey } from "@/lib/profile-sections";
import type { SectionState } from "@/lib/profile-live";
import { BRAND_CATEGORIES, categoryLabel } from "@/lib/brand-categories";
import { CONTENT_CAPABILITIES, capabilityLabel } from "@/lib/content-capabilities";
import { SECTION_LABELS, STATE_COPY, diffRows, latestForBanner, type ApiProfileChange } from "@/lib/profile-changes-live";
import {
  saveSocials,
  submitProfileChange,
  withdrawProfileChange,
  type ChangeBody,
  type SocialInput,
} from "@/app/(app)/athlete/profile/edit/actions";

/* --------------------------------------------------------------------------
   The signed-in athlete's profile editor — P2-FE-01, then P3-BE-16.

   Every §11 section shows what Postgres holds now (GET /athletes/me, shaped
   on the server). Two kinds of save:

     · Social accounts save straight away (PUT /athletes/:id/socials) —
       self-reported by definition, labelled as such.
     · Identity, sport, capabilities, interests and restrictions are sent as
       a CHANGE REQUEST (POST /athletes/:id/profile-changes). The profile —
       the public page, matching, the conflict check — moves only when BTG
       approves. The banner at the top says where the open request stands,
       and a declined one shows BTG's notes.

   Rates, payment and agreements stay read-only: BTG's, or not collected.
   -------------------------------------------------------------------------- */

const PLATFORMS: SocialInput["platform"][] = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X"];
const PLATFORM_LABEL: Record<SocialInput["platform"], string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
};
const LEVELS = ["HIGH_SCHOOL", "COLLEGE", "SEMI_PRO", "PRO", "AMATEUR"] as const;
const LEVEL_LABEL: Record<(typeof LEVELS)[number], string> = {
  HIGH_SCHOOL: "High school", COLLEGE: "College", SEMI_PRO: "Semi-pro", PRO: "Pro", AMATEUR: "Amateur",
};

const STATE_BADGE: Record<SectionState, { tone: "accent" | "warn" | "neutral"; label: string }> = {
  done: { tone: "accent", label: "Complete" },
  missing: { tone: "warn", label: "Missing" },
  "not-collected": { tone: "neutral", label: "Not collected in Phase 1" },
};

const INPUT_CLS =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint outline-none transition-colors focus:border-athlete/50 focus-visible:ring-2 focus-visible:ring-athlete/30";
const SAVE_CLS = "rounded-lg bg-athlete px-4 py-2 text-[11px] font-semibold text-cta-ink transition-opacity disabled:opacity-50";

type Row = { platform: SocialInput["platform"]; handle: string; followers: string };

/** What the request sections edit — the athlete's current values. */
export type EditableProfile = {
  legalName: string;
  displayName: string;
  city: string | null;
  stateCode: string | null;
  sport: string;
  position: string | null;
  school: string | null;
  level: string | null;
  gradYear: number | null;
  achievements: string | null;
  contentCapabilities: string[];
  brandInterests: string[];
  restrictedCategories: string[];
  restrictionNotes: string | null;
};

export type LiveEditorProps = {
  athleteId: string;
  initialSection?: string;
  states: Record<SectionKey, SectionState>;
  /** What each section holds now, as label/value lines (server-shaped). */
  summary: Record<SectionKey, { label: string; value: string }[]>;
  socials: { platform: string; handle: string; followers: number | null; source: string }[];
  /** P3-BE-16 — seeds the section forms. */
  profile?: EditableProfile;
  /** False before approval: the application at /join is what changes then. */
  editable?: boolean;
  changes?: ApiProfileChange[];
};

const REQUEST_SECTIONS: SectionKey[] = ["identity", "sport", "capabilities", "interests", "restrictions"];

export function LiveProfileEditor({ athleteId, initialSection, states, summary, socials, profile, editable = false, changes = [] }: LiveEditorProps) {
  const router = useRouter();
  const [active, setActive] = useState<SectionKey>(
    SECTIONS.some((s) => s.key === initialSection) ? (initialSection as SectionKey) : "identity",
  );
  const [rows, setRows] = useState<Row[]>(() =>
    socials
      .filter((s): s is typeof s & { platform: SocialInput["platform"] } => PLATFORMS.includes(s.platform as SocialInput["platform"]))
      .map((s) => ({ platform: s.platform, handle: s.handle, followers: s.followers === null ? "" : String(s.followers) })),
  );
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  /* The request forms, seeded once from the profile. */
  const [form, setForm] = useState(() => ({
    displayName: profile?.displayName ?? "",
    city: profile?.city ?? "",
    stateCode: profile?.stateCode ?? "",
    sport: profile?.sport ?? "",
    position: profile?.position ?? "",
    school: profile?.school ?? "",
    level: profile?.level ?? "",
    gradYear: profile?.gradYear ? String(profile.gradYear) : "",
    achievements: profile?.achievements ?? "",
    contentCapabilities: new Set(profile?.contentCapabilities ?? []),
    brandInterests: new Set(profile?.brandInterests ?? []),
    restrictedCategories: new Set(profile?.restrictedCategories ?? []),
    restrictionNotes: profile?.restrictionNotes ?? "",
    note: "",
  }));
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: "contentCapabilities" | "brandInterests" | "restrictedCategories", v: string) =>
    setForm((f) => {
      const next = new Set(f[k]);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...f, [k]: next };
    });

  const section = SECTIONS.find((s) => s.key === active)!;
  const used = new Set(rows.map((r) => r.platform));
  const valid = rows.every((r) => r.handle.trim().replace(/^@/, "").length > 0 && (r.followers === "" || /^\d+$/.test(r.followers)));
  const banner = latestForBanner(changes);

  const pick = (k: SectionKey) => {
    setActive(k);
    setResult(null);
    const p = new URLSearchParams(window.location.search);
    if (k === "identity") p.delete("section");
    else p.set("section", k);
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  };

  const save = () =>
    start(async () => {
      /* The action returns its errors; the catch is for the transport itself
         failing (the web server unreachable), which would otherwise throw
         into the portal's error boundary. */
      const r = await saveSocials(
        athleteId,
        rows.map((x) => ({ platform: x.platform, handle: x.handle, ...(x.followers ? { followers: Number(x.followers) } : {}) })),
      ).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now — nothing changed. Try again in a minute." }));
      setResult(r.ok ? { ok: true, text: "Saved. Your numbers show as self-reported until BTG verifies them." } : { ok: false, text: r.message });
    });

  /** The body for one section — nulls clear an optional field; the API keeps
   *  only what differs from the profile. */
  const bodyFor = (k: SectionKey): ChangeBody => {
    const opt = (s: string) => (s.trim() === "" ? null : s.trim());
    const note = form.note.trim() ? { note: form.note.trim() } : {};
    switch (k) {
      case "identity":
        return { identity: { displayName: form.displayName.trim(), city: opt(form.city), stateCode: form.stateCode.trim().toUpperCase() }, ...note };
      case "sport":
        return {
          sport: {
            sport: form.sport.trim(), position: opt(form.position), school: opt(form.school), level: form.level || null,
            gradYear: form.gradYear ? Number(form.gradYear) : null, achievements: opt(form.achievements),
          },
          ...note,
        };
      case "capabilities":
        return { capabilities: { contentCapabilities: [...form.contentCapabilities] }, ...note };
      case "interests":
        return { interests: { brandInterests: [...form.brandInterests] }, ...note };
      case "restrictions":
        return { restrictions: { restrictedCategories: [...form.restrictedCategories], restrictionNotes: opt(form.restrictionNotes) }, ...note };
      default:
        return {};
    }
  };
  const sectionValid = (k: SectionKey) =>
    k === "identity"
      ? form.displayName.trim().length > 0 && /^[A-Za-z]{2}$/.test(form.stateCode.trim())
      : k === "sport"
        ? form.sport.trim().length > 0 && (form.gradYear === "" || /^\d{4}$/.test(form.gradYear))
        : true;

  const send = (k: SectionKey) =>
    start(async () => {
      const r = await submitProfileChange(athleteId, bodyFor(k)).catch(() => ({
        ok: false as const, message: "Couldn't reach SponsorX just now — nothing changed. Try again in a minute.",
      }));
      setResult(r.ok ? { ok: true, text: "Sent to BTG. Your profile stays as it is until they approve — usually within a business day." } : { ok: false, text: r.message });
      if (r.ok) {
        set("note", "");
        router.refresh();
      }
    });

  const withdraw = (id: string) =>
    start(async () => {
      const r = await withdrawProfileChange(id).catch(() => ({ ok: false as const, message: "Couldn't reach SponsorX just now." }));
      setResult(r.ok ? { ok: true, text: "Withdrawn. Nothing changed." } : { ok: false, text: r.message });
      if (r.ok) router.refresh();
    });

  const requestForm = (k: SectionKey) => {
    if (!profile) return null;
    const checks = (key: "contentCapabilities" | "brandInterests" | "restrictedCategories", items: readonly string[], label: (s: string) => string, tone: string) => (
      <div className="flex flex-wrap gap-1.5">
        {items.map((c) => {
          const on = form[key].has(c);
          return (
            <label
              key={c}
              className={[
                "cursor-pointer select-none rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                on ? `${tone} text-text` : "border-line bg-surface text-muted hover:text-text",
              ].join(" ")}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(key, c)} />
              {label(c)}
            </label>
          );
        })}
      </div>
    );
    switch (k) {
      case "identity":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              Display name
              <input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={120} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
            </label>
            <div className="text-[10px] uppercase tracking-wide text-faint">
              Legal name
              <p className="mt-1 rounded-lg border border-dashed border-line px-3 py-2 text-xs normal-case tracking-normal text-muted">{profile.legalName}</p>
              <p className="mt-1 normal-case tracking-normal">Verified at review — BTG changes this for you.</p>
            </div>
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              City
              <input value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={80} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              State (2 letters)
              <input value={form.stateCode} onChange={(e) => set("stateCode", e.target.value)} maxLength={2} className={`${INPUT_CLS} mt-1 tracking-normal`} />
            </label>
          </div>
        );
      case "sport":
        return (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              Sport
              <input value={form.sport} onChange={(e) => set("sport", e.target.value)} maxLength={60} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              Position
              <input value={form.position} onChange={(e) => set("position", e.target.value)} maxLength={60} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              School / team
              <input value={form.school} onChange={(e) => set("school", e.target.value)} maxLength={120} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              Level
              <select value={form.level} onChange={(e) => set("level", e.target.value)} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`}>
                <option value="">—</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              Class of
              <input inputMode="numeric" value={form.gradYear} onChange={(e) => set("gradYear", e.target.value.replace(/[^\d]/g, "").slice(0, 4))} className={`${INPUT_CLS} mt-1 tracking-normal`} />
            </label>
            <label className="block text-[10px] uppercase tracking-wide text-faint sm:col-span-2">
              Achievements
              <textarea value={form.achievements} onChange={(e) => set("achievements", e.target.value)} maxLength={2000} rows={3} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
            </label>
          </div>
        );
      case "capabilities":
        return checks("contentCapabilities", CONTENT_CAPABILITIES, capabilityLabel, "border-athlete/40 bg-athlete/10");
      case "interests":
        return checks("brandInterests", BRAND_CATEGORIES, (c) => categoryLabel(c as (typeof BRAND_CATEGORIES)[number]), "border-athlete/40 bg-athlete/10");
      case "restrictions":
        return (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-wide text-faint">Never promote</p>
            {checks("restrictedCategories", BRAND_CATEGORIES, (c) => categoryLabel(c as (typeof BRAND_CATEGORIES)[number]), "border-danger/40 bg-danger/10")}
            <label className="block text-[10px] uppercase tracking-wide text-faint">
              Notes for BTG
              <textarea value={form.restrictionNotes} onChange={(e) => set("restrictionNotes", e.target.value)} maxLength={2000} rows={2} className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
            </label>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mt-5 space-y-4">
      {editable && banner && (
        <div
          className={[
            "flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2.5",
            banner.state === "PENDING" ? "border-athlete/30 bg-athlete/8" : banner.state === "DECLINED" ? "border-danger/30 bg-danger/8" : "border-accent/30 bg-accent/8",
          ].join(" ")}
        >
          <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
            <p>
              <Badge tone={STATE_COPY[banner.state].tone}>{STATE_COPY[banner.state].label}</Badge>{" "}
              <span className="text-text">{banner.sections.map((s) => SECTION_LABELS[s] ?? s).join(", ")}</span>
              {banner.state === "PENDING"
                ? " — BTG is reviewing it; your profile stays as it is until they approve."
                : banner.state === "APPROVED"
                  ? " — approved and live on your profile."
                  : " — BTG didn't approve this one."}
            </p>
            {banner.state === "PENDING" && (
              <ul className="mt-1 text-[10px] text-faint">
                {diffRows(banner, {}).map((r) => (
                  <li key={r.field}>{r.label}: {r.after}</li>
                ))}
              </ul>
            )}
            {banner.state === "DECLINED" && banner.reviewerNotes && (
              <p className="mt-1 text-text">&ldquo;{banner.reviewerNotes}&rdquo;</p>
            )}
          </div>
          {banner.state === "PENDING" && (
            <button type="button" onClick={() => withdraw(banner.id)} disabled={pending} className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-muted hover:text-text disabled:opacity-50">
              Withdraw
            </button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label="Profile sections" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => pick(s.key)}
              aria-current={s.key === active ? "true" : undefined}
              className={[
                "flex shrink-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors lg:w-full",
                s.key === active ? "border-athlete/40 bg-athlete/10 text-text" : "border-line bg-surface text-muted hover:text-text",
              ].join(" ")}
            >
              <span className="truncate">{s.label}</span>
              <span
                aria-hidden="true"
                className={[
                  "size-1.5 shrink-0 rounded-full",
                  states[s.key] === "done" ? "bg-success" : states[s.key] === "missing" ? "bg-warn" : "bg-line",
                ].join(" ")}
              />
            </button>
          ))}
        </nav>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{section.label}</h2>
            <div className="flex items-center gap-1.5">
              <Badge tone={section.scope === "public" ? "primary" : "neutral"}>{section.scope}</Badge>
              <Badge tone={STATE_BADGE[states[active]].tone}>{STATE_BADGE[states[active]].label}</Badge>
            </div>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{section.blurb}</p>

          {active === "socials" ? (
            <div className="mt-4 space-y-3">
              {rows.length === 0 && <p className="text-[11px] text-faint">No accounts yet — add one below.</p>}
              {rows.map((r, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_8rem_auto] sm:items-center">
                  <select
                    aria-label="Platform"
                    value={r.platform}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, platform: e.target.value as Row["platform"] } : x)))}
                    className={INPUT_CLS}
                  >
                    {PLATFORMS.filter((p) => p === r.platform || !used.has(p)).map((p) => (
                      <option key={p} value={p}>
                        {PLATFORM_LABEL[p]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="Handle"
                    value={r.handle}
                    placeholder="@handle"
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)))}
                    className={INPUT_CLS}
                  />
                  <input
                    aria-label="Followers"
                    inputMode="numeric"
                    value={r.followers}
                    placeholder="Followers"
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, followers: e.target.value.replace(/[^\d]/g, "") } : x)))}
                    className={INPUT_CLS}
                  />
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    className="rounded-lg border border-line px-3 py-2 text-[11px] text-muted hover:text-text"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {rows.length < PLATFORMS.length && (
                  <button
                    type="button"
                    onClick={() => setRows([...rows, { platform: PLATFORMS.find((p) => !used.has(p))!, handle: "", followers: "" }])}
                    className="rounded-lg border border-line px-3 py-2 text-[11px] font-medium text-text hover:bg-surface-2"
                  >
                    Add account
                  </button>
                )}
                <button type="button" onClick={save} disabled={!valid || pending} aria-busy={pending} className={SAVE_CLS}>
                  {pending ? "Saving…" : "Save accounts"}
                </button>
              </div>
              {result && (
                <p role="status" className={`text-[11px] ${result.ok ? "text-success" : "text-danger"}`}>
                  {result.text}
                </p>
              )}
              <p className="text-[10px] text-faint">
                Numbers you enter are labelled self-reported. BTG verifies them before they count as verified reach.
              </p>
            </div>
          ) : editable && profile && REQUEST_SECTIONS.includes(active) ? (
            <div className="mt-4 space-y-3">
              {requestForm(active)}
              <label className="block text-[10px] uppercase tracking-wide text-faint">
                A note for BTG (optional)
                <input value={form.note} onChange={(e) => set("note", e.target.value)} maxLength={1000} placeholder="Why the change, if it helps" className={`${INPUT_CLS} mt-1 normal-case tracking-normal`} />
              </label>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={() => send(active)} disabled={pending || !sectionValid(active)} aria-busy={pending} className={SAVE_CLS}>
                  {pending ? "Sending…" : "Send to BTG for review"}
                </button>
                {banner?.state === "PENDING" && <span className="text-[10px] text-faint">Sending replaces the change already waiting.</span>}
              </div>
              {result && (
                <p role="status" className={`text-[11px] ${result.ok ? "text-success" : "text-danger"}`}>
                  {result.text}
                </p>
              )}
              <p className="text-[10px] text-faint">
                {active === "restrictions"
                  ? "Restrictions power the conflict check before any invitation reaches you — BTG confirms a change before it applies."
                  : "BTG reviews changes before they show on your public profile — usually within a business day."}
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {summary[active].length === 0 ? (
                <p className="text-[11px] text-faint">Nothing on file yet.</p>
              ) : (
                <dl className="grid gap-2 sm:grid-cols-2">
                  {summary[active].map((l) => (
                    <div key={l.label} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-wide text-faint">{l.label}</dt>
                      <dd className="break-words text-xs text-text">{l.value || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11px] leading-relaxed text-muted">
                {states[active] === "not-collected"
                  ? "SponsorX doesn't collect this in Phase 1 — BTG Finance arranges it with you directly."
                  : REQUEST_SECTIONS.includes(active) && !editable
                    ? "Your application is still with BTG — until it's approved, changes go through the application itself."
                    : "This section can't be edited here — BTG sets it with you."}
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
