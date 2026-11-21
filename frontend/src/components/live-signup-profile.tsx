import Link from "next/link";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { StatusPill } from "@/components/desk-kit";
import { HomeFeaturePanel } from "@/components/home-feature-panel";
import { LiveSignupReview, SignupDecision } from "@/components/live-signup-review";
import { WhatsWrongPanel } from "@/components/problem-tags";
import { CheckRows, FactRows, FactTiles, ReasonRows, RecordHeader, RecordSection, Timeline } from "@/components/record-stage";
import { momentOf } from "@/lib/new-signups-live";
import { trustHint, trustLine } from "@/lib/content-trust";
import type { HomeFeatureStatus } from "@/lib/home-feature";
import { signupFacts, signupNextStep, signupPill } from "@/lib/record-ui";
import { LIVE_KIND_WORDS, comingOfAgeHold, signupHref, type ApiSignupDetail } from "@/lib/signups-live";
import { profileRateCardHref } from "@/lib/athlete-rates-live";
import { apiFetch, fetchActor } from "@/server/api";

import "@/app/(app)/admin/applications/(queue)/applications.css";
import "@/app/(app)/admin/record.css";

/* --------------------------------------------------------------------------
   One athlete's or guardian's sign-up, live — 2S1-FE-07 (design
   NewSignups.dc.html, views athlete and guardian). The page BTG's emails
   link to: details, the guardian–athlete link, the checks it passed when
   SponsorX approved it (or why it is held, and anything flagged), its
   documents behind the 5-minute viewer, its activity, and Reject /
   Reinstate (and Approve for a held one) — live-signup-review.tsx.

   Reads GET /signups/athletes/:id or /signups/guardians/:id. A miss is the
   API's 403 (not found and not yours answer alike).

   P8-FE-10 — for an athlete, also GET /athletes/:id/home-page: the "Home
   page" section (home-feature-panel.tsx) — the photo, whether they are on
   the Featured athletes panel and why not, and pin / remove / approve. The
   API answers BTG admin and the Network Manager only; for anyone else the
   read fails and the section isn't drawn.

   POL-FE-108 (2026-11-17) — redrawn. The owner: "the pages are too
   confusing for a human … having many information at once can haywire a
   human's brain". It was up to nine panels in a column beside a box of
   buttons, two of them usually greyed out. Now, top to bottom:
     1. the name with a kind mark, one line, ONE status pill and ONE button
        ("Make a decision", or the one action that applies: "Reject Dana",
        "Reinstate Dana"). The button opens the decision in a popup
        (record-decide.tsx via SignupDecision). Nothing about deciding is
        on the page itself: the owner turned down a "Your next step" card;
     2. four tiles: who they look after (or their guardian), checks,
        documents, when they signed up;
     3. tabs, one topic at a time: Overview (what's wrong, anything flagged,
        who they look after, the checks) · Details · Documents · Content &
        rates (an approved athlete only) · History.
   Reads, actions and links (the "#documents" and per-document anchors
   included) are unchanged. Words: lib/record-ui.ts. Styles: admin/record.css.
   -------------------------------------------------------------------------- */

const PATH = "/admin/new-signups";

/** BTG's home-page status for this athlete, or null (another role, or no read) — then no controls. */
async function homeStatus(id: string): Promise<HomeFeatureStatus | null> {
  try {
    const res = await apiFetch(`/athletes/${encodeURIComponent(id)}/home-page`);
    return res.ok ? ((await res.json()) as HomeFeatureStatus) : null;
  } catch {
    return null;
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function LiveSignupProfile({ owner, id }: { owner: "athletes" | "guardians"; id: string }) {
  const [res, home, who] = await Promise.all([
    apiFetch(`/signups/${owner}/${encodeURIComponent(id)}`),
    owner === "athletes" ? homeStatus(id) : Promise.resolve(null),
    fetchActor(),
  ]);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="sx-rec space-y-4">
        <Link href={PATH} className="sx-rec-back">
          <Glyph ui="back" className="size-3.5" />
          New accounts
        </Link>
        <p className="sx-rec-empty">No sign-up matches this link, or your role can&rsquo;t open it.</p>
      </div>
    );
  }
  if (!res.ok) throw new Error(`This sign-up couldn't be read (${res.status}).`);
  const s = (await res.json()) as ApiSignupDetail;
  const hold = comingOfAgeHold(s);
  const held = s.state === "NEEDS_REVIEW";
  /* POL-FE-42 — a held sign-up's problems, as tags at the top; they replace the plain "Why it needs review" list. */
  const problems = held ? s.problems ?? [] : [];
  /* POL-FE-51 close-out — the rate card, for an approved athlete and a role that sets rates. */
  const rateCard = profileRateCardHref(s, who.status === "linked" ? who.actor.roles : []);
  const kindWord = LIVE_KIND_WORDS[s.kind];

  /* ------------------------------------------------------------- overview */
  const showChecks = !held && s.checks.length > 0;
  const overviewEmpty = problems.length === 0 && !hold && !(held && s.reasons.length) && s.flags.length === 0 && s.guardianOf.length === 0 && !showChecks;
  const overview = (
    <>
      <WhatsWrongPanel problems={problems} documents={s.documents} />
      {/* POL-FE-02 / POL-BE-02 — a coming-of-age takeover the ID check held: why, and what Confirm takeover or Send back does. */}
      {hold && (
        <RecordSection title={hold.title} icon="alert" tone="amber" hint={`${hold.confirm} ${hold.refuse}`}>
          <ReasonRows items={hold.reasons} />
        </RecordSection>
      )}
      {held && problems.length === 0 && s.reasons.length > 0 && (
        <RecordSection title="Why it needs review" icon="alert" tone="amber">
          <ReasonRows items={s.reasons} />
        </RecordSection>
      )}
      {s.flags.length > 0 && (
        <RecordSection title="Flagged for BTG" hint="A flag never holds a sign-up. It is something to read." icon="alert" tone="amber">
          <ReasonRows items={s.flags} />
        </RecordSection>
      )}
      {s.guardianOf.length > 0 && (
        <RecordSection title="Looks after" hint="The athletes this guardian answers for. Rejecting the guardian rejects them too." icon="users">
          <ul className="sx-rec-rows">
            {s.guardianOf.map((k) => {
              const p = signupPill(k);
              return (
                <li key={k.id} className="sx-rec-row sx-rec-person">
                  <span className="min-w-0 flex-1">
                    <Link href={signupHref("ATHLETE", k.id)} className="sx-rec-person-name sx-rec-link-plain">{k.name}</Link>
                    <span className="sx-rec-person-sub">{k.sub}</span>
                  </span>
                  <StatusPill tone={p.tone} act={p.act}>{k.state === "AUTO_APPROVED" || k.state === "APPROVED" ? "Approved" : p.label}</StatusPill>
                </li>
              );
            })}
          </ul>
        </RecordSection>
      )}
      {showChecks && (
        <RecordSection title="Checks" hint={`What it passed when it was approved${s.approvedAt ? ` · ${momentOf(s.approvedAt)}` : ""}`} icon="shield">
          <CheckRows items={s.checks.map((c) => ({ key: c, label: c, ok: true }))} />
        </RecordSection>
      )}
      {overviewEmpty && <p className="sx-rec-empty">Nothing was flagged, and no checks were recorded for this sign-up.</p>}
    </>
  );

  /* -------------------------------------------------------------- details */
  const details = (
    <RecordSection title="Details" hint={`What ${s.name.split(/\s+/)[0] ?? s.name} gave when signing up.`} icon="rows">
      <FactRows
        rows={s.details.map((d) => ({
          label: d.label,
          value: d.label === "Guardian" && s.guardian ? <Link href={signupHref("GUARDIAN", s.guardian.id)} className="sx-rec-link">{d.value}</Link> : d.value,
        }))}
      />
    </RecordSection>
  );

  /* -------------------------------------------- content & rates (athlete) */
  const hasExtras = s.kind === "ATHLETE" && Boolean(s.contentTrust || home || rateCard);
  const extras = hasExtras ? (
    <>
      {/* P5-BE-10 — whether this athlete's drafts skip BTG's content review. */}
      {s.contentTrust && (
        <RecordSection title="Content review" icon="eye" hint={trustHint(s.contentTrust)}>
          <span className="sx-rec-chip" data-tone={s.contentTrust.trusted ? "green" : "muted"}>{trustLine(s.contentTrust)}</span>
        </RecordSection>
      )}
      {home && <HomeFeaturePanel initial={home} name={s.name} />}
      {rateCard && (
        <RecordSection
          title="Rate card"
          icon="coin"
          hint={`What ${s.name} is paid for each NIL job. The Matching Studio can’t shortlist an athlete for a job with no rate on it.`}
          action={<Link href={rateCard} className="sx-rec-btn sx-rec-btn-sm" data-kind="quiet">Open the rate card</Link>}
        >
          {null}
        </RecordSection>
      )}
    </>
  ) : undefined;

  /* -------------------------------------------------------------- history */
  const history = (
    <RecordSection title="Activity" icon="clock">
      <Timeline items={s.activity.map((a) => ({ at: momentOf(a.at), text: a.text }))} />
    </RecordSection>
  );

  const next = signupNextStep(s);

  return (
    <div className="sx-rec">
      <RecordHeader
        back={{ href: held ? `${PATH}?tab=review` : PATH, label: "New accounts" }}
        icon={s.kind === "ATHLETE" ? "trophy" : "shield"}
        kind={s.kind}
        title={s.name}
        /* the detail read may leave `sub` out (the list's row carries it) */
        meta={[!(s.sub ?? "").startsWith(kindWord) && kindWord, s.sub, `signed up ${day(s.signedUpAt)}`]}
        pill={signupPill(s)}
        /* the one button; where it stands and the choices are in its popup */
        action={<SignupDecision signup={s} lede={`${next.title}. ${next.text}`} />}
      />
      <LiveSignupReview
        signup={s}
        tiles={<FactTiles facts={signupFacts(s)} />}
        overview={overview}
        details={details}
        extras={extras}
        history={history}
        overviewDot={held || s.flags.length > 0 || Boolean(hold)}
      />
    </div>
  );
}
