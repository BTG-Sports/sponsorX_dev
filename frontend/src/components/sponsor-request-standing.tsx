import Link from "next/link";

import { Button } from "@/components/ui";
import {
  missingLabel,
  standingCopy,
  standingOf,
  type SponsorRequestState,
} from "@/lib/sponsor-request-live";

/* --------------------------------------------------------------------------
   2S1-FE-11 (form half) — where a sponsor's request stands, in the
   applicant's words. No hooks and no "use client": the status page and the
   email-confirmation page render it on the server, and the brief wizard's
   upload island renders it in the browser after an upload is confirmed.

   Only what the API says: the to-do list is its `missing[]`, "BTG is taking
   a look" is its `underReview` — never BTG's reasons, which the API does
   not hand the applicant at all.
   -------------------------------------------------------------------------- */

export function SponsorRequestStanding({
  status,
  email,
  heading = "h2",
}: {
  status: { state: SponsorRequestState; missing: string[]; underReview: boolean };
  /** Shown in "Sign in with …" when this screen knows it; otherwise the copy says "the email you gave". */
  email?: string;
  heading?: "h1" | "h2" | "h3";
}) {
  const st = standingOf(status);
  const copy = standingCopy(st, email);
  const H = heading;
  const tone =
    st.kind === "approved"
      ? "border-success/40 bg-success/8"
      : st.kind === "declined" || st.kind === "rejected"
        ? "border-line bg-surface-2"
        : st.kind === "waiting"
          ? "border-warn/40 bg-warn/8"
          : "border-accent/40 bg-accent/8";

  return (
    <section aria-live="polite" className={`rounded-xl border p-4 ${tone}`}>
      <H className={heading === "h1" ? "text-2xl font-semibold tracking-tight" : "text-base font-semibold text-text"}>
        {copy.title}
      </H>
      <p className="mt-1 text-sm leading-relaxed text-muted">{copy.body}</p>

      {st.kind === "waiting" && (
        <ul className="mt-3 space-y-2" aria-label="Still to do">
          {st.missing.map((m) => (
            <li key={m} className="flex items-start gap-2.5 text-sm text-text">
              <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full border-2 border-warn" />
              {missingLabel(m)}
            </li>
          ))}
        </ul>
      )}

      {st.kind === "approved" && (
        <div className="mt-4">
          <Button href="/login">Sign in</Button>
        </div>
      )}
      {st.kind === "declined" && (
        <p className="mt-3 text-sm">
          <Link href="/brief?new=1" className="text-accent hover:underline">
            Send the form again →
          </Link>
        </p>
      )}
      {st.kind === "rejected" && (
        <p className="mt-3 text-sm">
          <Link href="/contact" className="text-accent hover:underline">
            Contact BTG →
          </Link>
        </p>
      )}
    </section>
  );
}
