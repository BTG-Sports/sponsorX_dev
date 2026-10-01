import Link from "next/link";

import { Badge } from "@/components/ui";
import { PREVIEW_ONLY, type ReactivateView } from "@/lib/account-closure-live";

/* --------------------------------------------------------------------------
   Reactivate your account — 2S1-FE-08 (design Account.dc.html, views
   reactivate + rejected), on the public /reactivate page. Server component,
   no client JS: the two writes are plain forms posting to server actions.

   LIVE (2S1-BE-13). Four cases, from GET /public/account/reactivation/:token:
     self-closed   — the 30 days counting down, and Reactivate
                     (POST … {action: REACTIVATE})
     closed by BTG — can't reactivate itself; "Ask BTG to review it" with a
                     message (POST … {action: REQUEST}), and Contact BTG;
                     BTG decides
     ended at coming of age — no Reactivate and no asking BTG: the
                     athlete's government ID, on the coming-of-age page
                     (comingOfAgePath), brings it back within the 30 days
     back          — reactivated, with what the re-run checks found
     expired       — the 30 days are up: sign up again
   With no action passed (the ?demo= previews) the buttons stay off.
   -------------------------------------------------------------------------- */

type FormAction = (formData: FormData) => Promise<void>;

const primary = "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";

export function AccountReactivate({
  view, supportEmail, portalPath, reactivate, request,
}: {
  view: ReactivateView;
  supportEmail: string;
  portalPath: string;
  reactivate?: FormAction;
  request?: FormAction;
}) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-3.5">
      <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Reactivate your account</h1>

      {view.kind === "self" && (
        <section aria-label="Account closed" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4.5 py-4">
          <span><Badge tone="primary"><span aria-hidden="true" className="mr-1">●</span>{view.badge}</Badge></span>
          <p className="text-[15px] font-semibold">{view.headline}</p>
          <p className="text-3xl font-bold tabular-nums text-primary-soft sm:text-[34px]">{view.left}</p>
          <p className="text-sm leading-relaxed text-muted">{view.body}</p>
          <form action={reactivate} className="space-y-1.5">
            <button type="submit" disabled={!reactivate} title={reactivate ? undefined : PREVIEW_ONLY} className={primary}>
              Reactivate my account
            </button>
            {!reactivate && <p className="text-[11px] text-warn">{PREVIEW_ONLY}</p>}
          </form>
        </section>
      )}

      {view.kind === "btg" && (
        <section role="status" aria-label="Closed by BTG" className="flex flex-col gap-2.5 rounded-xl border border-danger/40 bg-surface p-4.5">
          <span><Badge tone="danger"><span aria-hidden="true" className="mr-1">✕</span>{view.badge}</Badge></span>
          <p className="text-[15px] font-semibold">{view.headline}</p>
          <p className="text-sm leading-relaxed text-muted">{view.body}</p>
          <p className="text-xs text-muted">{view.kept}</p>
          {view.asked && <p className="text-sm text-success">{view.asked}</p>}
          <form action={request} className="space-y-2">
            <label className="flex flex-col text-xs font-medium">
              What should BTG look at again? <span className="font-normal text-muted">(optional)</span>
              <textarea name="note" rows={3} maxLength={2000} disabled={!request}
                className="mt-1.5 w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none disabled:opacity-60"
                placeholder="Anything that helps — a new document, what changed." />
            </label>
            <div className="flex flex-wrap gap-2.5">
              <button type="submit" disabled={!request} title={request ? undefined : PREVIEW_ONLY} className={primary}>
                Ask BTG to review it
              </button>
              <Link href="/contact?topic=account" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-5 text-sm font-medium text-text hover:bg-surface-2">
                Contact BTG
              </Link>
            </div>
            {!request && <p className="text-[11px] text-warn">{PREVIEW_ONLY}</p>}
          </form>
        </section>
      )}

      {view.kind === "age" && (
        <section role="status" aria-label="Ended at coming of age" className="flex flex-col gap-2.5 rounded-xl border border-warn/40 bg-surface p-4.5">
          <span><Badge tone="warn">{view.badge}</Badge></span>
          <p className="text-[15px] font-semibold">{view.headline}</p>
          <p className="text-sm leading-relaxed text-muted">{view.body}</p>
          <p className="text-xs text-muted">{view.kept}</p>
          {view.uploadPath && <Link href={view.uploadPath} className={`${primary} self-start`}>Upload your government ID</Link>}
        </section>
      )}

      {view.kind === "back" && (
        <section role="status" aria-label="Account active again" className="flex flex-col gap-2.5 rounded-xl border border-success/40 bg-success/6 px-4.5 py-4">
          <span><Badge tone="accent"><span aria-hidden="true" className="mr-1">✓</span>{view.badge}</Badge></span>
          <p className="text-[15px] font-semibold">{view.headline}</p>
          <ul className="space-y-1 text-sm leading-relaxed text-muted">
            {view.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
          <Link href={portalPath} className={`${primary} self-start`}>Sign in</Link>
        </section>
      )}

      {view.kind === "expired" && (
        <section role="status" aria-label="Account closed for good" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4.5 py-4">
          <span><Badge tone="neutral">{view.badge}</Badge></span>
          <p className="text-[15px] font-semibold">{view.headline}</p>
          <p className="text-sm leading-relaxed text-muted">{view.body}</p>
          <div className="flex flex-wrap gap-2.5">
            <Link href="/join" className={primary}>Sign up as an athlete</Link>
            <Link href="/onboarding" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-5 text-sm font-medium text-text hover:bg-surface-2">
              Sign up an organization
            </Link>
          </div>
        </section>
      )}

      <p className="text-xs text-muted">
        Questions? <Link href="/contact?topic=account" className="text-primary-soft hover:underline">Contact BTG</Link> · <span className="select-all">{supportEmail}</span>
      </p>
    </div>
  );
}
