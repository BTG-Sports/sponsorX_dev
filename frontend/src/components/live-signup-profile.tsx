import Link from "next/link";

import { LiveSignupReview } from "@/components/live-signup-review";
import { Badge } from "@/components/ui";
import { momentOf } from "@/lib/new-signups-live";
import { LIVE_KIND_WORDS, liveBadge, signupHref, type ApiSignupDetail } from "@/lib/signups-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One athlete's or guardian's sign-up, live — 2S1-FE-07 (design
   NewSignups.dc.html, views athlete and guardian). The page BTG's emails
   link to: details, the guardian–athlete link, the checks it passed when
   SponsorX approved it (or why it is held, and anything flagged), its
   documents behind the 5-minute viewer, its activity, and Reject /
   Reinstate (and Approve for a held one) — live-signup-review.tsx.

   Reads GET /signups/athletes/:id or /signups/guardians/:id. A miss is the
   API's 403 (not found and not yours answer alike).
   -------------------------------------------------------------------------- */

const PATH = "/admin/new-signups";
const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";

export async function LiveSignupProfile({ owner, id }: { owner: "athletes" | "guardians"; id: string }) {
  const res = await apiFetch(`/signups/${owner}/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-4">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← New sign-ups</Link>
        <p className="text-sm">No sign-up matches this link — or your role can&rsquo;t open it.</p>
      </div>
    );
  }
  if (!res.ok) throw new Error(`This sign-up couldn't be read (${res.status}).`);
  const s = (await res.json()) as ApiSignupDetail;
  const badge = liveBadge(s, s.approvedAt);

  const before = (
    <>
      <section aria-label="Details" className={section}>
        <h2 className="text-sm font-semibold">Details</h2>
        <dl className="mt-2 grid grid-cols-[7.5rem_1fr] text-[13px] sm:grid-cols-[10rem_1fr]">
          {s.details.map((d) => (
            <div key={d.label} className="contents">
              <dt className="border-t border-line-soft py-2 pr-3 text-muted">{d.label}</dt>
              <dd className="min-w-0 break-words border-t border-line-soft py-2">
                {d.label === "Guardian" && s.guardian ? <Link href={signupHref("GUARDIAN", s.guardian.id)} className="hover:underline">{d.value}</Link> : d.value}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      {s.guardianOf.length > 0 && (
        <section aria-label="Athletes" className={section}>
          <h2 className="text-sm font-semibold">Guardian of</h2>
          <ul className="mt-2">
            {s.guardianOf.map((k) => {
              const b = liveBadge(k);
              return (
                <li key={k.id} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <Link href={signupHref("ATHLETE", k.id)} className="font-semibold hover:underline">{k.name}</Link>
                    <span className="block text-[11px] text-muted">{k.sub}</span>
                  </span>
                  <Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{k.state === "AUTO_APPROVED" || k.state === "APPROVED" ? "Approved" : b.label}</Badge>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {s.state === "NEEDS_REVIEW" ? (
        <ReasonList title="Why it needs review" items={s.reasons} />
      ) : s.checks.length > 0 ? (
        <section aria-label="Checklist when approved" className={section}>
          <h2 className="text-sm font-semibold">Checklist when approved{s.approvedAt ? ` · ${momentOf(s.approvedAt)}` : ""}</h2>
          <ul className="mt-2">
            {s.checks.map((c) => (
              <li key={c} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent">✓</span>
                <span className="min-w-0 flex-1">{c}</span>
                <Badge tone="accent">Passed</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {s.flags.length > 0 && <ReasonList title="Flagged for BTG" items={s.flags} />}
    </>
  );

  const after = (
    <section aria-label="Activity" className={section}>
      <h2 className="text-sm font-semibold">Activity</h2>
      {s.activity.length === 0 ? (
        <p className="mt-2 text-xs text-muted">Nothing recorded yet.</p>
      ) : (
        <ol className="mt-2 text-xs">
          {s.activity.map((a, i) => (
            <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
              <span className="shrink-0 text-muted sm:w-32">{momentOf(a.at)}</span>
              <span className="min-w-0 break-words">{a.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      <div>
        <Link href={s.state === "NEEDS_REVIEW" ? `${PATH}?tab=review` : PATH} className="text-xs text-muted hover:text-text">← New sign-ups</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight">{s.name}</h1>
          <Badge><span aria-hidden="true" className="mr-1">○</span>{LIVE_KIND_WORDS[s.kind]}</Badge>
          <Badge tone={badge.tone}><span aria-hidden="true" className="mr-1">{badge.mark}</span>{badge.label}</Badge>
        </div>
      </div>
      <LiveSignupReview signup={s} before={before} after={after} />
    </div>
  );
}

function ReasonList({ title, items }: { title: string; items: string[] }) {
  return (
    <section aria-label={title} className={section}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-2">
        {items.map((r) => (
          <li key={r} className="flex items-center gap-2.5 border-t border-line-soft py-2.5 text-[13px]">
            <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-warn/15 text-[10px] font-bold text-warn">!</span>
            <span className="min-w-0 flex-1">{r}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
