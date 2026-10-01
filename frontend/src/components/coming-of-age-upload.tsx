"use client";

import Link from "next/link";
import { useState } from "react";

import { confirmComingOfAgeIdAction, requestComingOfAgeIdAction, type ApiComingOfAgePage } from "@/app/(public)/coming-of-age/actions";
import { IdUpload } from "@/components/id-upload";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the government-ID upload that takes over an account on coming
   of age (2S1-BE-12). Once the API confirms it, control has moved: the page
   says so and points at sign-in.
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
