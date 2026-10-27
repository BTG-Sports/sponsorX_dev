"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { PHOTO_UPLOAD, photoFileProblem, type PhotoContentType } from "@/lib/athlete-photo";
import { requestPhotoUploadAction, savePhotoAction } from "@/server/athlete-photo-actions";

/* --------------------------------------------------------------------------
   The athlete's profile photo — P8-FE-10. On the athlete's profile editor
   and on BTG's athlete page (the athlete, a minor's guardian and BTG may all
   set it; the API scopes who).

   A photo is one of the twelve fields the home page's Featured athletes
   panel needs (P8-BE-08). Choosing a file sends it straight to the public
   bucket — never through the web server — then tells the API to use it; the
   API checks it arrived. A minor's new photo goes back to BTG before it can
   show on the home page (the API resets the approval), and the note says so.
   -------------------------------------------------------------------------- */

const UNREACHABLE = "Couldn't reach SponsorX just now — nothing changed. Try again in a minute.";

export function AthletePhotoEditor({
  athleteId,
  name,
  photoUrl: initial,
  tone = "athlete",
  minor = false,
}: {
  athleteId: string;
  /** For the alt text and the monogram. */
  name: string;
  photoUrl: string | null;
  /** The portal's button colour. */
  tone?: "athlete" | "admin";
  /** Under 18 (or no age on file): a new photo needs BTG's approval again for the home page. */
  minor?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const primary =
    tone === "athlete"
      ? "bg-athlete text-cta-ink"
      : "bg-primary text-cta-ink hover:bg-primary-soft";

  const upload = (file: File) =>
    start(async () => {
      setMsg(null);
      const problem = photoFileProblem({ type: file.type, size: file.size });
      if (problem) return setMsg({ ok: false, text: problem });

      const grant = await requestPhotoUploadAction(athleteId, { contentType: file.type as PhotoContentType, bytes: file.size }).catch(
        () => ({ ok: false as const, message: UNREACHABLE }),
      );
      if (!grant.ok) return setMsg({ ok: false, text: grant.message });

      /* Straight to the bucket, with exactly the type the grant was signed for. */
      const put = await fetch(grant.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }).catch(() => null);
      if (!put?.ok) return setMsg({ ok: false, text: "The photo didn't upload. Check your connection and try again — nothing changed." });

      const saved = await savePhotoAction(athleteId, grant.photoKey).catch(() => ({ ok: false as const, message: UNREACHABLE }));
      if (!saved.ok) return setMsg({ ok: false, text: saved.message });
      setPhotoUrl(saved.photoUrl);
      setMsg({ ok: true, text: minor ? "Photo saved. BTG looks at a new photo before it can show on the home page." : "Photo saved." });
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      setMsg(null);
      const saved = await savePhotoAction(athleteId, null).catch(() => ({ ok: false as const, message: UNREACHABLE }));
      if (!saved.ok) return setMsg({ ok: false, text: saved.message });
      setPhotoUrl(null);
      setMsg({ ok: true, text: "Photo removed. Without one, the athlete can't be featured on the home page." });
      router.refresh();
    });

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2 text-lg font-semibold text-muted">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a public-bucket CDN photo; host-portable, no next/image optimizer
          <img src={photoUrl} alt={`${name}'s profile photo`} className="size-full object-cover" />
        ) : (
          <span aria-hidden="true">{initials || "?"}</span>
        )}
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-xs text-muted">
          {photoUrl ? "" : "No profile photo yet. "}JPEG, PNG or WebP, up to 5 MB. It shows on the public profile and, once
          everything else is filled in, can be featured on the home page.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={PHOTO_UPLOAD.accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) upload(f);
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className={`min-h-9 rounded-lg px-3.5 text-xs font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${primary}`}
          >
            {pending ? "Working…" : photoUrl ? "Change photo" : "Upload photo"}
          </button>
          {photoUrl && (
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove photo
            </button>
          )}
        </div>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-accent" : "text-danger"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
