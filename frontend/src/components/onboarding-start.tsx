"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, useTransition } from "react";

import { startOnboardingAction } from "@/app/(public)/onboarding/actions";
import { ORG_TYPES, ORG_TYPE_COPY, RESUME_KEY, parseSaved, type OrgType } from "@/lib/onboarding-live";

/* --------------------------------------------------------------------------
   2S1-FE-01 — step zero: what kind of organisation, and its name. Starting
   calls POST /public/onboarding and the action sends the browser to the
   application's own resume page. If this device already started one (the
   resume page records it in localStorage), that comes first — "Continue
   your application" — so a returning applicant doesn't open a second one.
   -------------------------------------------------------------------------- */

const noSubscribe = () => () => {};
function readRaw(): string | null {
  try {
    return window.localStorage.getItem(RESUME_KEY);
  } catch {
    return null;
  }
}

const field =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none aria-[invalid=true]:border-danger";

export function OnboardingStart() {
  const raw = useSyncExternalStore(noSubscribe, readRaw, () => null);
  const [forgotten, setForgotten] = useState(false);
  const saved = forgotten ? null : parseSaved(raw);
  const [orgType, setOrgType] = useState<OrgType | null>(null);
  const [orgName, setOrgName] = useState("");
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const typeError = tried && !orgType ? "Pick one." : null;
  const nameError = tried && !orgName.trim() ? "Give your organisation's name." : null;

  const forget = () => {
    try {
      window.localStorage.removeItem(RESUME_KEY);
    } catch {
      /* nothing kept */
    }
    setForgotten(true);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!orgType || !orgName.trim()) return;
    setMessage(null);
    start(async () => {
      /* On success the action redirects; it only returns when refused. */
      const r = await startOnboardingAction(orgType, orgName);
      setMessage(r.message);
    });
  };

  return (
    <div className="space-y-6">
      {saved && (
        <div className="rounded-xl border border-primary/40 bg-primary/8 p-4">
          <p className="text-sm font-semibold">Continue your application</p>
          <p className="mt-1 text-xs text-muted">
            This device has an application in progress{saved.orgName ? ` for ${saved.orgName}` : ""}. Pick up where you left off.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link
              href={`/onboarding/${encodeURIComponent(saved.token)}`}
              className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft"
            >
              Continue →
            </Link>
            <button type="button" onClick={forget} className="text-xs text-muted hover:text-text">
              Forget it on this device
            </button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6" noValidate>
        <fieldset>
          <legend className="text-sm font-semibold">What kind of organisation are you?</legend>
          <p className="mt-1 text-xs text-muted">This decides what BTG asks you for and what you can list.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ORG_TYPES.map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  orgType === t ? "border-primary/60 bg-primary/8" : "border-line bg-surface hover:bg-surface-2"
                }`}
              >
                <input
                  type="radio"
                  name="orgType"
                  value={t}
                  checked={orgType === t}
                  onChange={() => setOrgType(t)}
                  className="mt-1 accent-[var(--sx-primary)]"
                />
                <span>
                  <span className="block text-sm font-medium">{ORG_TYPE_COPY[t].label}</span>
                  <span className="block text-xs text-muted">{ORG_TYPE_COPY[t].text}</span>
                </span>
              </label>
            ))}
          </div>
          {typeError && <p className="mt-1 text-xs text-danger">{typeError}</p>}
        </fieldset>

        <label className="block text-xs font-medium">
          Organisation name
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            maxLength={200}
            autoComplete="organization"
            aria-invalid={nameError ? "true" : "false"}
            className={field}
          />
          {nameError && <span className="mt-1 block text-xs text-danger">{nameError}</span>}
        </label>

        {message && (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
            {message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40"
          >
            {pending ? "Starting…" : "Start the application"}
          </button>
          <p className="text-xs text-faint">Your progress saves as you go. Finish over as many sittings as you need.</p>
        </div>
      </form>
    </div>
  );
}
