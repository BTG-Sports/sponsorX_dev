import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Glyph } from "@/components/athlete-inventory/glyphs";
import { HowItWorks, type FlowStep } from "@/components/desk-kit";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { RulesBoard } from "@/components/rules-board";
import { COLLAB_REQUIRED_WORDS, RULES_REQUIRED_WORDS, RuleCard, STAFF_CONFIRM_WORDS } from "@/components/signup-rules-editor";
import type { AgeRow } from "@/lib/age-table";
import { apiFetch } from "@/server/api";

import "../../applications/(queue)/applications.css";
import "./rules.css";

/* --------------------------------------------------------------------------
   Sign-up rules — 2S1-FE-07, beside the New sign-ups desk. The rules
   automatic approval reads, kept by BTG admins (2S1-BE-10 / -12, P8-BE-02 /
   -04):

   - "BTG staff confirm minors before approval" — off by default, so the
     system approves; on, a complete minor waits for a person;
   - "Athletes confirm their own rules" and "Athletes accept the current
     Content Collaboration Agreement" (P8-FE-04 / P8-FE-07) — off, asked on
     sign-up and in the portal; on, a new deal or listing waits on them (for
     a minor, the guardian's);
   - the age of majority by place: a country, or a state within it. Most US
     states are 18, Alabama and Nebraska 19, Mississippi 21. A place not in
     the table counts as 18 and is flagged on the desk.

   Redrawn 2026-11-21 (owner: "too much information at once … not easily
   understandable by humans … wow factor + animations"). Five summary tiles,
   two switch panels with Off / On box pairs and the board all spoke at once.
   Now the page asks two questions, in order:

     01 Who waits for a person?  three RuleCards (signup-rules-editor.tsx),
                                 each a switch and a path picture
     02 Who counts as a minor?   the place board (rules-board.tsx). An age
                                 summary above it was tried and removed the
                                 same day (owner: "not helpful at all, it
                                 generates confusion").

   and the flow behind them sits behind "How it works" (desk-kit). Every
   number appears once, where it is about.

   Reads  GET /signup-rules/settings · GET /signup-rules/age-table
   Writes PUT /signup-rules/settings · PUT / DELETE /signup-rules/age-table   (./actions.ts)
   The network manager reads; only a BTG admin's changes are accepted.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";

type AgeTable = { rows: AgeRow[]; unknownPlaceAthletes: number };

/** GET /signup-rules/settings — the three switches (2S1-BE-10, P8-BE-02, P8-BE-04). */
type SignupSettings = { staffConfirmMinors: boolean; requireRulesAttestation?: boolean; requireCollabAcceptance?: boolean };

const at = (seconds: number) => ({ "--d": `${seconds}s` }) as CSSProperties;

const STEPS: readonly FlowStep[] = [
  { icon: "bolt", title: "Someone signs up", text: "Their checks run straight away. Most people are approved without anyone at BTG touching them." },
  { icon: "pin", title: "Their place sets the age", text: "The age table says when someone in that place becomes an adult. Under that age they're a minor and need a guardian. A place that isn't in the table counts as 18 and is flagged." },
  { icon: "users", title: "Minors: the checks, or a person", text: "With the first switch off, a minor is approved once every check passes. On, they wait under Needs review until someone at BTG looks." },
  { icon: "shield", title: "Before a deal", text: "The other two switches decide whether a new deal or listing waits until the athlete has confirmed their own rules and accepted the current agreement (a guardian does it for a minor)." },
  { icon: "clock", title: "Every change is recorded", text: "Only a BTG admin can change a rule. Changing a place works out the age again for everyone who lives there." },
];

function Stage({ children }: { children: ReactNode }) {
  return (
    <div>
      <Link href={PATH} className="sx-ap-rise inline-flex items-center gap-1.5 text-xs text-[#63b4f8] transition-colors hover:text-[#9be0ff]" style={at(0)}>
        <span aria-hidden="true">←</span> New accounts
      </Link>
      {children}
    </div>
  );
}

function Chapter({ n, id, title, sub, delay }: { n: string; id: string; title: string; sub: string; delay: number }) {
  return (
    <div className="sx-sr-chapter sx-ap-rise" style={at(delay)}>
      <span className="sx-sr-chapter-n" aria-hidden="true">{n}</span>
      <div className="min-w-0">
        <h2 id={id} className="sx-sr-chapter-title">{title}</h2>
        <p className="sx-sr-chapter-sub">{sub}</p>
      </div>
      <span aria-hidden="true" className="sx-sr-chapter-line hidden sm:block" style={at(delay)} />
    </div>
  );
}

export default async function SignupRulesPage() {
  const lacking = await staffWithoutAccess(`${PATH}/rules`);
  if (lacking) return <NotInRole path={`${PATH}/rules`} title="Sign-up rules" roles={lacking} />;
  const [settingsRes, tableRes] = await Promise.all([apiFetch("/signup-rules/settings"), apiFetch("/signup-rules/age-table")]);
  if (settingsRes.status === 403 || tableRes.status === 403) {
    return (
      <Stage>
        <p className="sx-ops-panel sx-ap-rise relative mt-6 px-6 py-6 text-sm text-[#9aa4b2]" style={at(0.1)}>
          Your role doesn&rsquo;t read the sign-up rules.
        </p>
      </Stage>
    );
  }
  if (!settingsRes.ok || !tableRes.ok) throw new Error(`The sign-up rules couldn't be read (${settingsRes.ok ? tableRes.status : settingsRes.status}).`);
  const settings = (await settingsRes.json()) as SignupSettings;
  const table = (await tableRes.json()) as AgeTable;
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  /* The two "before a deal" switches read as false when an older API leaves them out. */
  const minorsOn = settings.staffConfirmMinors;
  const rulesOn = settings.requireRulesAttestation === true;
  const collabOn = settings.requireCollabAcceptance === true;
  const waiting = [minorsOn, rulesOn, collabOn].filter(Boolean).length;

  return (
    <Stage>
      <header className="mt-3">
        <div className="sx-ap-rise flex flex-wrap items-center justify-between gap-3" style={at(0.02)}>
          <h1 className="sx-page-title">Sign-up rules</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="sx-ap-live">
              <span className="sx-ap-live-dot" aria-hidden="true" />
              Live · Postgres · read {readAt}
            </span>
            <HowItWorks lede="What happens between someone signing up and their first deal, and where these rules step in." steps={STEPS} keyTitle="Reading the page">
              {/* The key's own layout (applications.css): a mark, then one span of words. */}
              <li>
                <span className="sx-ap-key-mark">
                  <span className="sx-sr-badge" style={{ "--c": "#fb923c" } as CSSProperties}><i />Waits</span>
                </span>
                <span>Orange: a person, or a confirmation, is waited for.</span>
              </li>
              <li>
                <span className="sx-ap-key-mark">
                  <span className="sx-sr-badge" style={{ "--c": "#4ade80" } as CSSProperties}><i />Automatic</span>
                </span>
                <span>Green: it happens on its own.</span>
              </li>
              <li>
                <span className="sx-ap-key-mark">
                  <Glyph ui="eye" className="size-5 text-[#fb923c]" />
                </span>
                <span>On each rule, the path shows where things stop. A lit middle step means &ldquo;waits here&rdquo;; a crossed-out one is skipped.</span>
              </li>
              <li>
                <span className="sx-ap-key-mark">
                  <b className="text-2xl font-extrabold leading-none tabular-nums text-[#fb923c]">21</b>
                </span>
                <span>In the country list, &ldquo;Not 18&rdquo; shows only the countries with a different age. Click any place to change it.</span>
              </li>
            </HowItWorks>
          </div>
        </div>
        <p className="sx-ap-rise mt-2 max-w-2xl text-sm leading-relaxed text-[#9aa4b2]" style={at(0.06)}>
          {waiting === 0 ? (
            <>Everything runs on its own right now. Nobody waits for a person.</>
          ) : (
            <>
              <strong className="font-semibold text-[#fdba74]">
                {waiting} of 3 rules
              </strong>{" "}
              make someone wait for a person or a confirmation. The rest run on their own.
            </>
          )}
        </p>
      </header>

      <section aria-labelledby="sr-wait">
        <Chapter n="01" id="sr-wait" title="Who waits for a person?" sub="Three switches. Each one decides whether a step is checked, or skipped." delay={0.1} />
        <div className="sx-sr-rules">
          <RuleCard flag="staffConfirmMinors" on={minorsOn} words={STAFF_CONFIRM_WORDS} delay={0.16} />
          <RuleCard flag="requireRulesAttestation" on={rulesOn} words={RULES_REQUIRED_WORDS} delay={0.24} />
          <RuleCard flag="requireCollabAcceptance" on={collabOn} words={COLLAB_REQUIRED_WORDS} delay={0.32} />
        </div>
      </section>

      <section aria-labelledby="sr-age">
        <Chapter n="02" id="sr-age" title="Who counts as a minor?" sub="The age someone becomes an adult, by where they live." delay={0.4} />
        {table.unknownPlaceAthletes > 0 && (
          <p role="status" className="sx-sr-alert sx-ap-rise" style={at(0.44)}>
            <span className="sx-sr-alert-icon" aria-hidden="true">
              <Glyph ui="alert" className="size-4" />
            </span>
            <span>
              <b>
                {table.unknownPlaceAthletes.toLocaleString("en-US")} athlete{table.unknownPlaceAthletes === 1 ? " lives" : "s live"}
              </b>{" "}
              in a place that isn&rsquo;t in the table. They count as adults at 18 and are flagged on the desk. Add their place below.
            </span>
          </p>
        )}
        <div className="mt-5">
          <RulesBoard rows={table.rows} />
        </div>
      </section>

      <p className="sx-ap-rise mt-8 flex items-center gap-2 text-[11px] text-[#7e88a0]" style={at(0.8)}>
        <Glyph ui="lock" className="size-3.5" />
        Only a BTG admin can change these. Every change is recorded, and changing a place works out the age again for the athletes who live there.
      </p>
    </Stage>
  );
}
