"use client";

import Link from "next/link";
import { useState } from "react";

import { confirmComingOfAgeIdAction, requestComingOfAgeIdAction, type ApiComingOfAgePage } from "@/app/(public)/coming-of-age/actions";
import { IdUpload } from "@/components/id-upload";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the government-ID upload that takes over an account on coming
   of age (2S1-BE-12). Once the API confirms it, control has moved: the page
   says so and points at sign-in.

   POL-FE-02 / POL-BE-02 — the takeover is automatic only when the ID reads
   clear. Otherwise the API answers `checking: true`: the ID is received and
   a person at BTG checks it before control moves (the guardian stays in
   control, the 90 days don't run out). If BTG needs a clearer one they send
   it back, and the athlete is emailed with this link again.
   -------------------------------------------------------------------------- */

export function ComingOfAgeUpload({ token, initial }: { token: string; initial: ApiComingOfAgePage }) {
  const [s, setS] = useState(initial);
  if (s.idUploaded || s.window === "done") {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-success/40 bg-success/8 p-5">
        <p className="text-base font-bold text-success">Your account is yours ✓</p>
        <p className="text-sm leading-relaxed text-muted">From now on you accept your own agreements and manage your own money. Your guardian has been told.</p>
        <Link href="/login" className="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink hover:bg-primary-soft">Sign in</Link>
      </div>
    );
  }
  if (s.checking) {
    return (
      <div role="status" className="space-y-3 rounded-xl border border-primary/40 bg-primary/8 p-5">
        <p className="text-base font-bold text-primary-soft">ID received — BTG is checking it</p>
        <p className="text-sm leading-relaxed text-muted">
          Your government ID is in. A person at BTG checks it before the account becomes yours; until then your guardian stays in control and the 90 days don&rsquo;t run out. We&rsquo;ll email you when it&rsquo;s done — or, if BTG needs a clearer ID, with this link to upload it again.
        </p>
        <Link href="/login" className="inline-flex min-h-12 items-center rounded-lg border border-line px-5 text-sm font-semibold text-text hover:bg-surface-2">Sign in</Link>
      </div>
    );
  }
  return (
    <IdUpload
      title="Upload your government ID"
      hint="A driver’s license, passport or state ID — PDF, JPEG or PNG, up to 10 MB"
      request={(f) => requestComingOfAgeIdAction(token, f)}
      confirm={(id) => confirmComingOfAgeIdAction(token, id)}
      onDone={setS}
    />
  );
}
