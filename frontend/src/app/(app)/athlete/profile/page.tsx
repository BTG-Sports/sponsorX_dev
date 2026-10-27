import Link from "next/link";
import { ArenaChip, ArenaHead, ArenaUpdated, ArenaLink, ArenaPanel, ArenaTile, ArenaTiles, at, type ArenaTone } from "@/components/arena-stage";
import { AthleteProfileView } from "@/components/athlete-profile-view";
import { Badge, BlockedNotice, SourceLabel } from "@/components/ui";
import { athlete, athletePublic, profileChecklist } from "@/lib/fixtures";
import { CHECKLIST_SECTION, SECTIONS, type SectionKey } from "@/lib/profile-sections";
import {
  completion,
  sectionStates,
  type ApiMyProfile,
  type ApiRate,
  type SectionState,
} from "@/lib/profile-live";
import { money } from "@/lib/fixtures";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Your public profile — inside the Athlete Portal (2026-09-14 UX pass).

   The sidebar's "Public profile" used to link straight to /athletes/[slug],
   throwing the athlete out of their portal into the public site. This page
   keeps them home: the same profile content, framed for its owner — no
   Follow / Request Partnership aimed at yourself (AthleteProfileView's
   "owner" variant swaps those for pointers to Invitations), a completion
   nudge, and the real public URL one labelled new-tab link away. Stale
   ?from=athlete-portal links to the public page redirect here.

   LIVE vs DEMO (P3-FE-03, the review-queue precedent). A signed-in ATHLETE
   sees their REAL profile — GET /athletes/me — and a §24 completion meter
   DERIVED from the data (lib/profile-live.ts), section by §11 section.
   Anyone else keeps the fixture demo. The public page has been live since
   P3-FE-08 (GET /public/athletes/:slug), so the live view now carries the
   "Open public page ↗" link to the athlete's own slug — while the profile
   is ACTIVE, which is when the public page answers for it. The live editor
   is one pill away (2S1-FE-09: edits save at once).

   P1-ART-22 (2026-10-11) — redrawn on the Arena (components/arena-stage.tsx)
   with the dashboard's anatomy: a small title with the provenance pill and
   the profile's state, the name · sport · school as the lede, the two owner
   actions as pills, a KPI row (completion as a lane, sections done, the
   rate card's size, followers with their §22 provenance), then the nine §11
   sections as plates in two columns. Every figure is derived from the same
   GET /athletes/me and /rates reads as before; nothing is invented. The
   only exit is the public page, in a new tab (memory:
   portal-views-stay-in-portal).
   -------------------------------------------------------------------------- */

/** The real profile for a signed-in athlete, or null for the fixture demo. */
async function liveProfile(): Promise<{ p: ApiMyProfile; rates: ApiRate[] } | null> {
  /* No catch: an API outage lands on the error boundary, never on fixtures
     presented as the athlete's own profile (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.includes("ATHLETE")) return null;

  const res = await apiFetch("/athletes/me");
  /* A 403 here is an athlete role with no athlete row — a provisioning gap,
     not an outage. The demo would be a lie either way; say so. */
  if (!res.ok) throw new Error(`Profile unavailable (${res.status}).`);
  const p = (await res.json()) as ApiMyProfile;

  /* The athlete's own card (P3-FE-04) — own-scoped at the API, so this is
     exactly one athlete's pay and can be nobody else's. */
  const ratesRes = await apiFetch(`/athletes/${encodeURIComponent(p.id)}/rates`);
  if (!ratesRes.ok) throw new Error(`Rate card unavailable (${ratesRes.status}).`);
  const { rates } = (await ratesRes.json()) as { rates: ApiRate[] };
  return { p, rates };
}

const STATE_CHIP: Record<SectionState, { tone: ArenaTone; label: string }> = {
  done: { tone: "win", label: "Complete" },
  missing: { tone: "warn", label: "Missing" },
  "not-collected": { tone: "ink", label: "Not collected in Phase 1" },
};

/* The two owner actions, as the arena's pills (globals.css skins both). */
const PILL_PRIMARY =
  "sx-btn-primary inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-cta-ink outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
const PILL_SECONDARY =
  "sx-btn-secondary inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-text outline-none focus-visible:ring-2 focus-visible:ring-athlete focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

/** §22 — the provenance tokens SourceLabel can name; anything else prints raw. */
const SOURCES = ["VERIFIED_SYSTEM", "VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED", "ESTIMATED", "ATTRIBUTED"] as const;
type Source = (typeof SOURCES)[number];
const asSource = (s: string): Source | null => ((SOURCES as readonly string[]).includes(s) ? (s as Source) : null);

function Provenance({ source }: { source: string }) {
  const s = asSource(source);
  return s ? <SourceLabel source={s} /> : <Badge tone="neutral">{words(source)}</Badge>;
}

/** Humanize a stored enum-ish token: "HIGH_SCHOOL" → "High school". */
function words(s: string): string {
  return (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
      <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
    </svg>
  );
}

function OutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
      <path d="M14 5h5v5M19 5l-9 9M9 5H5v14h14v-4" />
    </svg>
  );
}

function EditPill({ href = "/athlete/profile/edit" }: { href?: string }) {
  return (
    <Link href={href} className={PILL_PRIMARY}>
      <PencilIcon />
      Edit profile
    </Link>
  );
}

/** The one exit: the real public page, in a new tab. */
function PublicPill({ slug }: { slug: string }) {
  return (
    <a href={`/athletes/${encodeURIComponent(slug)}?from=athlete-profile`} target="_blank" rel="noreferrer" className={PILL_SECONDARY}>
      Open public page
      <OutIcon />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function SectionContent({ p, k, rates }: { p: ApiMyProfile; k: SectionKey; rates: ApiRate[] }) {
  const dash = <span className="text-faint">—</span>;
  switch (k) {
    case "identity":
      return (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-muted">Display name</dt>
          <dd className="font-medium">{p.displayName}</dd>
          <dt className="text-muted">Legal name</dt>
          <dd className="font-medium">{p.legalName}</dd>
          <dt className="text-muted">Location</dt>
          <dd className="font-medium">
            {[p.city, p.stateCode].filter(Boolean).join(", ") || dash}
          </dd>
          {p.achievements && (
            <>
              <dt className="text-muted">Achievements</dt>
              <dd className="font-medium">{p.achievements}</dd>
            </>
          )}
        </dl>
      );
    case "sport":
      return (
        <p className="text-xs text-muted">
          <span className="font-medium text-text">{p.sport}</span>
          {p.position && <> · {p.position}</>}
          {p.school && <> · {p.school}</>}
          {p.level && <> · {words(p.level)}</>}
          {p.gradYear && <> · Class of {p.gradYear}</>}
        </p>
      );
    case "socials":
      return p.socials.length === 0 ? (
        <p className="text-xs text-muted">No accounts on file yet.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {p.socials.map((s) => (
            <li key={`${s.platform}:${s.handle}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5 text-xs first:pt-0 last:pb-0">
              <span className="font-medium">{words(s.platform)}</span>
              <span className="min-w-0 truncate text-muted">{s.handle}</span>
              {s.followers !== null && (
                <span className="sx-arena-num ml-auto text-sm text-text">
                  {s.followers.toLocaleString("en-US")}
                  <span className="ml-1 font-sans text-[10px] font-normal not-italic tracking-normal text-muted">followers</span>
                </span>
              )}
              <Provenance source={s.source} />
            </li>
          ))}
        </ul>
      );
    case "capabilities":
    case "interests": {
      const items = k === "capabilities" ? p.contentCapabilities : p.brandInterests;
      return items.length === 0 ? (
        <p className="text-xs text-muted">Nothing selected yet.</p>
      ) : (
        <p className="flex flex-wrap gap-1.5">
          {items.map((c) => (
            <ArenaChip key={c} tone="blue">{words(c)}</ArenaChip>
          ))}
        </p>
      );
    }
    case "restrictions":
      return p.restrictedCategories.length === 0 && !p.restrictionNotes?.trim() ? (
        <p className="text-xs text-muted">
          Not answered yet — even &ldquo;none&rdquo; is worth recording, so the
          conflict check can trust it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {p.restrictedCategories.length > 0 && (
            <p className="flex flex-wrap gap-1.5">
              {p.restrictedCategories.map((c) => (
                <ArenaChip key={c} tone="danger">{words(c)}</ArenaChip>
              ))}
            </p>
          )}
          {p.restrictionNotes?.trim() && (
            <p className="text-xs text-muted">{p.restrictionNotes}</p>
          )}
        </div>
      );
    case "rates":
      /* The athlete's own pay per job — what P3-FE-04 exists to show. These
         are NOT what sponsors pay (catalogue prices are higher and live on
         the sponsor side); §7.1 keeps the two apart in both directions. */
      return rates.length === 0 ? (
        <p className="text-xs text-muted">No rates confirmed yet — BTG sets these with you.</p>
      ) : (
        <div>
          <ul className="divide-y divide-line-soft">
            {rates.map((r) => (
              <li key={r.jobId} className="flex items-baseline justify-between gap-3 py-1.5 text-xs first:pt-0 last:pb-0">
                <span className="min-w-0 truncate font-medium">{r.jobName}</span>
                <span className="sx-arena-num shrink-0 text-sm text-text">
                  {money(r.amount)}
                  {r.version > 1 && <span className="font-sans text-[10px] font-normal not-italic tracking-normal text-faint"> · v{r.version}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] leading-relaxed text-faint">
            Your pay per deliverable{p.tier && <> · {words(p.tier)} tier</>}.
            Sponsors see catalogue prices, never these.
          </p>
        </div>
      );
    case "payment":
      return (
        <p className="text-xs text-muted">
          Phase 1 tracks earnings status only. No bank details or tax IDs are
          ever stored, and the payment recipient record arrives in a later
          phase — this section doesn&rsquo;t count against your meter.
        </p>
      );
    case "agreements":
      return (
        <p className="text-xs text-muted">
          {p.agreementsSigned > 0 ? (
            <>
              <span className="sx-arena-num text-sm text-text">{p.agreementsSigned}</span>{" "}
              {p.agreementsSigned === 1 ? "agreement" : "agreements"} accepted.
            </>
          ) : (
            <>Nothing signed yet — agreements arrive with your first campaign.</>
          )}
        </p>
      );
  }
}

/** The owner pointer that replaces the sponsor-side CTA (memory:
 *  portal-views-stay-in-portal): where a sponsor's request actually lands. */
function OwnerPointer({ delay }: { delay: number }) {
  return (
    <ArenaPanel tone="flare" delay={delay} spot>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
          Sponsors see a <span className="font-medium text-text">Request Partnership</span> button on your public page — every request arrives in your Invitations, never here.
        </p>
        <ArenaLink href="/athlete/invitations">Invitations</ArenaLink>
      </div>
    </ArenaPanel>
  );
}

function LiveProfile({ p, rates }: { p: ApiMyProfile; rates: ApiRate[] }) {
  const states = sectionStates(p);
  const { percent, missing } = completion(states);
  const labelOf = (k: SectionKey) => SECTIONS.find((s) => s.key === k)?.label ?? k;

  /* The KPI figures, every one from the same two reads as the plates below. */
  const answerable = (Object.keys(states) as SectionKey[]).filter((k) => states[k] !== "not-collected");
  const done = answerable.filter((k) => states[k] === "done").length;
  const notCollected = SECTIONS.length - answerable.length;
  const counted = p.socials.filter((s) => s.followers !== null);
  const followers = counted.reduce((n, s) => n + (s.followers ?? 0), 0);
  const provenance = new Set(counted.map((s) => s.source));
  /* One follower figure needs one provenance (§22) — mixed sources would
     put one label on two kinds of number, so then only the accounts count. */
  const followerTile = counted.length > 0 && provenance.size === 1 ? [...provenance][0] : null;
  const cols = 2 + (rates.length > 0 ? 1 : 0) + (p.socials.length > 0 ? 1 : 0);
  const lede = [p.displayName, p.sport, p.school].filter(Boolean).join(" · ");
  const isActive = p.state === "ACTIVE";

  return (
    <div className="space-y-8">
      <ArenaHead
        title="Public profile"
        pill={<ArenaUpdated />}
        lede={
          <span className="flex flex-wrap items-center gap-2">
            <span>{lede}</span>
            <ArenaChip tone={isActive ? "win" : "ink"}>{words(p.state)}</ArenaChip>
          </span>
        }
        actions={
          <>
            {isActive ? (
              <PublicPill slug={p.slug} />
            ) : (
              <span className="text-[11px] text-muted">Your public page opens once BTG activates your profile.</span>
            )}
            <EditPill />
          </>
        }
      >
        <ArenaTiles cols={cols as 2 | 3 | 4}>
          {/* §24 — the meter, derived from the data on this page and nothing else */}
          <ArenaTile
            label="Profile completion"
            value={percent}
            format="pct"
            share={percent / 100}
            tone={percent === 100 ? "win" : "blue"}
            caption={missing.length > 0 ? `finish ${missing.map((k) => labelOf(k).toLowerCase()).join(", ")}` : "every section Phase 1 collects is filled in"}
            href="/athlete/profile/edit"
            delay={0.1}
          />
          <ArenaTile
            label="Sections done"
            value={done}
            caption={`of ${answerable.length} that count · ${notCollected} not collected in Phase 1`}
            tone={done === answerable.length ? "win" : "ink"}
            delay={0.16}
          />
          {rates.length > 0 && (
            <ArenaTile
              label="Rate card"
              value={rates.length}
              caption={p.tier ? `jobs priced · ${words(p.tier)} tier · yours only` : "jobs priced · your pay, never shown to sponsors"}
              tone="blue"
              delay={0.22}
            />
          )}
          {followerTile ? (
            <ArenaTile
              label="Followers"
              value={followers}
              caption={
                <span className="inline-flex items-center gap-1.5">
                  {counted.length === 1 ? "1 account" : `${counted.length} accounts`} · <Provenance source={followerTile} />
                </span>
              }
              tone="flare"
              delay={0.28}
            />
          ) : p.socials.length > 0 ? (
            <ArenaTile
              label="Social accounts"
              value={p.socials.length}
              caption={counted.length === 0 ? "no follower counts on file" : "mixed provenance · see each account below"}
              tone="ink"
              delay={0.28}
            />
          ) : null}
        </ArenaTiles>
      </ArenaHead>

      <OwnerPointer delay={0.3} />

      {/* §11, section by section — public ones feed the sponsor-facing
          page, private ones stay between the athlete and BTG. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((s, i) => {
          const chip = STATE_CHIP[states[s.key]];
          return (
            <ArenaPanel key={s.key} tone={states[s.key] === "missing" ? "warn" : "blue"} delay={0.34 + i * 0.05} spot>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight">{s.label}</h2>
                <ArenaChip tone={s.scope === "public" ? "blue" : "ink"}>{s.scope === "public" ? "Public" : "Private"}</ArenaChip>
                <span className="ml-auto">
                  <ArenaChip tone={chip.tone}>{chip.label}</ArenaChip>
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-faint">{s.blurb}</p>
              <div className="mt-3">
                <SectionContent p={p} k={s.key} rates={rates} />
              </div>
            </ArenaPanel>
          );
        })}
      </div>

      <p className="sx-arena-in text-[10px] leading-relaxed text-faint" style={at(0.8)}>
        To change these details,{" "}
        <Link href="/athlete/profile/edit" className="text-athlete hover:underline">edit your profile</Link>
        {" "}— changes save straight away. A legal name, date of birth or guardian
        also tells BTG and re-runs the checks.
      </p>
    </div>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;

  const live = await liveProfile();
  if (live) return <LiveProfile p={live.p} rates={live.rates} />;

  const missing = profileChecklist.filter((c) => !c.done);
  const done = profileChecklist.length - missing.length;

  return (
    <div className="space-y-6">
      {/* C-2 (check pass): only a signed-in non-athlete — a guardian, or
          staff previewing — reaches this fixture view; it must never read as
          their own profile. */}
      <BlockedNotice>
        Demo data — this is a sample profile, not a real one. A guardian
        view of the athlete&rsquo;s profile isn&rsquo;t built yet.
      </BlockedNotice>

      <ArenaHead
        title="Public profile"
        lede={`${athletePublic.name} · ${athletePublic.sport} · ${athletePublic.position}`}
        actions={
          <>
            <PublicPill slug={athletePublic.slug} />
            <EditPill />
          </>
        }
      >
        <ArenaTiles cols={2}>
          {/* A stronger profile earns better matches (§11) — the one owner
              figure that belongs on this screen. The checklist itself lives
              on the dashboard. */}
          <ArenaTile
            label="Profile completion"
            value={athlete.profileCompletion}
            format="pct"
            share={athlete.profileCompletion / 100}
            tone={athlete.profileCompletion === 100 ? "win" : "blue"}
            caption={missing.length > 0 ? `finish ${missing.map((c) => c.label.toLowerCase()).join(", ")}` : "every section is filled in"}
            href={missing.length > 0 ? `/athlete/profile/edit?section=${CHECKLIST_SECTION[missing[0].label]}` : "/athlete/profile/edit"}
            delay={0.1}
          />
          <ArenaTile
            label="Sections done"
            value={done}
            caption={`of ${profileChecklist.length} on the checklist`}
            tone={done === profileChecklist.length ? "win" : "ink"}
            delay={0.16}
          />
        </ArenaTiles>
      </ArenaHead>

      <div className="sx-arena-in" style={at(0.3)}>
        <AthleteProfileView variant="owner" initialTab={tab} />
      </div>
    </div>
  );
}
