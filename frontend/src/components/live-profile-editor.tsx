"use client";

import { useState, useTransition } from "react";
import { Badge, Card } from "@/components/ui";
import { SECTIONS, type SectionKey } from "@/lib/profile-sections";
import type { SectionState } from "@/lib/profile-live";
import { saveSocials, type SocialInput } from "@/app/(app)/athlete/profile/edit/actions";

/* --------------------------------------------------------------------------
   The signed-in athlete's profile editor — P2-FE-01 (scope decision
   2026-09-29: "seed from live, save socials only").

   Every §11 section shows what Postgres holds now (GET /athletes/me, shaped
   on the server). Social accounts are editable and save through
   PUT /athletes/:id/socials; the other sections have no post-approval edit
   endpoint yet, so they say plainly that BTG makes the change — no form
   that looks like it saves and doesn't. The fixture editor stays for ?demo.
   -------------------------------------------------------------------------- */

const PLATFORMS: SocialInput["platform"][] = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X"];
const PLATFORM_LABEL: Record<SocialInput["platform"], string> = {
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  X: "X",
};

const STATE_BADGE: Record<SectionState, { tone: "accent" | "warn" | "neutral"; label: string }> = {
  done: { tone: "accent", label: "Complete" },
  missing: { tone: "warn", label: "Missing" },
  "not-collected": { tone: "neutral", label: "Not collected in Phase 1" },
};

const INPUT_CLS =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint outline-none transition-colors focus:border-athlete/50 focus-visible:ring-2 focus-visible:ring-athlete/30";

type Row = { platform: SocialInput["platform"]; handle: string; followers: string };

export type LiveEditorProps = {
  athleteId: string;
  initialSection?: string;
  states: Record<SectionKey, SectionState>;
  /** What each section holds now, as label/value lines (server-shaped). */
  summary: Record<SectionKey, { label: string; value: string }[]>;
  socials: { platform: string; handle: string; followers: number | null; source: string }[];
};

export function LiveProfileEditor({ athleteId, initialSection, states, summary, socials }: LiveEditorProps) {
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

  const section = SECTIONS.find((s) => s.key === active)!;
  const used = new Set(rows.map((r) => r.platform));
  const valid = rows.every((r) => r.handle.trim().replace(/^@/, "").length > 0 && (r.followers === "" || /^\d+$/.test(r.followers)));

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

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
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
              <button
                type="button"
                onClick={save}
                disabled={!valid || pending}
                aria-busy={pending}
                className="rounded-lg bg-athlete px-4 py-2 text-[11px] font-semibold text-cta-ink transition-opacity disabled:opacity-50"
              >
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
                : "This section can't be edited here yet — ask your BTG contact to change it."}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
