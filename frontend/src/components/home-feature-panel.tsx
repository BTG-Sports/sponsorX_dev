"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { AthletePhotoEditor } from "@/components/athlete-photo-editor";
import { Badge } from "@/components/ui";
import { DONE_WORDS, blockLines, homeButtons, homeHeadline, type HomeAction, type HomeFeatureStatus } from "@/lib/home-feature";
import { setHomeFeatureAction } from "@/server/home-feature-actions";

/* --------------------------------------------------------------------------
   "Home page" on BTG's athlete page — P8-FE-10, on P8-BE-08.

   Whether this athlete is on the home page's Featured athletes panel now,
   and if not, every reason (inactive, the missing profile fields by name, a
   minor waiting for approval, removed); the buttons that apply — pin /
   unpin, remove / restore, and for a minor approve / withdraw; and the
   athlete's photo, which BTG may set too.

   The page renders this only when GET /athletes/{id}/home-page answered,
   which the API allows BTG admin and the Network Manager alone — so no
   other role ever sees these controls. Every change is audited by the API.
   -------------------------------------------------------------------------- */

export function HomeFeaturePanel({ initial, name }: { initial: HomeFeatureStatus; name: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  /* After a refresh (a new photo changes what's missing) the server sends a
     fresh status: take it, but keep the message — remounting would wipe it. */
  const [seen, setSeen] = useState(initial);
  if (JSON.stringify(initial) !== JSON.stringify(seen)) {
    setSeen(initial);
    setStatus(initial);
  }

  const head = homeHeadline(status);
  const reasons = status.onHomePage || status.eligible ? [] : blockLines(status);

  const act = (action: HomeAction) =>
    start(async () => {
      setMsg(null);
      const r = await setHomeFeatureAction(status.athleteId, action).catch(() => ({
        ok: false as const,
        message: "Couldn't reach SponsorX just now — nothing changed. Try again in a minute.",
      }));
      if (!r.ok) return setMsg({ ok: false, text: r.message });
      setStatus(r.status);
      setMsg({ ok: true, text: DONE_WORDS[action] });
      router.refresh();
    });

  return (
    <section aria-label="Home page" className="rounded-xl border border-line bg-surface p-4 sm:px-5">
      <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        Home page
        <Badge tone={head.tone}>{head.label}</Badge>
        {status.minor && <Badge>{status.approved ? "Under 18 or no age · approved" : "Under 18 or no age on file"}</Badge>}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        The Featured athletes panel shows up to four: active athletes with every public profile field and a photo; a minor only
        once approved here. Pinned athletes show first.
      </p>

      {reasons.length > 0 ? (
        <ul className="mt-3">
          {reasons.map((r) => (
            <li key={r} className="flex items-center gap-2.5 border-t border-line-soft py-2 text-[13px]">
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-warn/15 text-[10px] font-bold text-warn">!</span>
              <span className="min-w-0 flex-1">{r}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-line-soft pt-2 text-[13px]">{head.hint}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {homeButtons(status).map((b) => (
          <button
            key={b.action}
            type="button"
            disabled={pending || Boolean(b.disabled)}
            title={b.disabled}
            onClick={() => act(b.action)}
            className={[
              "min-h-9 rounded-lg px-3.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40",
              b.action === "remove"
                ? "border border-danger/50 text-danger hover:bg-danger/10"
                : b.action === "approve" || b.action === "pin"
                  ? "bg-primary text-cta-ink hover:bg-primary-soft"
                  : "border border-line text-text hover:bg-surface-2",
            ].join(" ")}
          >
            {b.label}
          </button>
        ))}
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-4 border-t border-line-soft pt-4">
        <h3 className="mb-2 text-xs font-semibold">Profile photo</h3>
        <AthletePhotoEditor athleteId={status.athleteId} name={name} photoUrl={status.photoUrl} tone="admin" minor={status.minor} />
      </div>
    </section>
  );
}
