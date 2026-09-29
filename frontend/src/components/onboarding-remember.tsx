"use client";

import { useEffect, useState } from "react";

import { RESUME_KEY } from "@/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-01 — the resume page's memory and its "bookmark this" notice. On
   every visit (including from BTG's "changes requested" email) this device
   records the token, so /onboarding can offer "Continue your application".
   The token is the only key, so the notice says so plainly and offers to
   copy the address.
   -------------------------------------------------------------------------- */

export function OnboardingRemember({ token, orgName, compact }: { token: string; orgName: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(RESUME_KEY, JSON.stringify({ token, orgName, savedAt: new Date().toISOString() }));
    } catch {
      /* private window: the bookmark is the only way back */
    }
  }, [token, orgName]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (compact) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2.5">
      <p className="text-xs leading-relaxed text-warn">
        <strong className="font-semibold">Bookmark this page.</strong> Its address is the only key to your application — we
        can&rsquo;t send it again, and anyone with it can edit your answers.
      </p>
      <button type="button" onClick={copy} className="shrink-0 rounded-md border border-warn/40 px-2.5 py-1 text-[11px] font-medium text-warn hover:bg-warn/10">
        {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}
