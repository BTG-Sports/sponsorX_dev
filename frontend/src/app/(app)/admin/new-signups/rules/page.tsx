import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { OpsStage } from "@/components/ops-fx";
import { KpiTile, OpsGround } from "@/components/ops-stage";
import { RulesBoard } from "@/components/rules-board";
import { StaffConfirmSwitch } from "@/components/signup-rules-editor";
import type { AgeRow } from "@/lib/age-table";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Sign-up rules — 2S1-FE-07, beside the New sign-ups desk. The two rules
   automatic approval reads, kept by BTG admins (2S1-BE-10 / -12):

   - "BTG staff confirm minors before approval" — off by default, so the
     system approves; on, for the open guardian e-signature question;
   - the age of majority by place: a country, or a state within it. Most US
     states are 18, Alabama and Nebraska 19, Mississippi 21. A place not in
     the table counts as 18 and is flagged on the desk.

   P1-ART-17 (2026-10-05, spec docs/superpowers/specs/2026-10-05-signup-
   rules-control-panel-design.md): the "Control Panel" — the admin stage,
   full bleed and fixed-dark, as a DASHBOARD (memory: admin-desks-are-
   dashboards): back link, a compact title, four tiles, then the work — the
   minors switch, then the place board (rules-board.tsx: search, country
   rail, the country's places; adding and changing in a dialog).

   Reads  GET /signup-rules/settings · GET /signup-rules/age-table
   Writes PUT /signup-rules/settings · PUT / DELETE /signup-rules/age-table   (./actions.ts)
   The network manager reads; only a BTG admin's changes are accepted.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";
const STAGE = "sx-ops sx-stage relative isolate -mx-6 -my-6 min-h-[calc(100svh-66px)] overflow-hidden px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10";

type AgeTable = { rows: AgeRow[]; unknownPlaceAthletes: number };

const at = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;

function Stage({ children }: { children: ReactNode }) {
  return (
    <OpsStage className={STAGE}>
      <OpsGround word="" />
      <div className="relative mx-auto max-w-[1440px]">
        <Link href={PATH} className="sx-ops-in inline-flex items-center gap-1.5 text-xs text-[#63b4f8] transition-colors hover:text-[#9be0ff]" style={at(0)}>
          <span aria-hidden="true">←</span> New sign-ups
        </Link>
        {children}
      </div>
    </OpsStage>
  );
}

export default async function SignupRulesPage() {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Sign-up rules" roles={lacking} />;
  const [settingsRes, tableRes] = await Promise.all([apiFetch("/signup-rules/settings"), apiFetch("/signup-rules/age-table")]);
  if (settingsRes.status === 403 || tableRes.status === 403) {
    return (
      <Stage>
        <p className="sx-ops-panel sx-ops-in relative mt-6 px-6 py-6 text-sm text-[#9aa4b2]" style={at(0.1)}>
          Your role doesn&rsquo;t read the sign-up rules.
        </p>
      </Stage>
    );
  }
  if (!settingsRes.ok || !tableRes.ok) throw new Error(`The sign-up rules couldn't be read (${settingsRes.ok ? tableRes.status : settingsRes.status}).`);
  const settings = (await settingsRes.json()) as { staffConfirmMinors: boolean };
  const table = (await tableRes.json()) as AgeTable;
  const countries = new Set(table.rows.map((r) => r.countryCode)).size;
  const not18 = table.rows.filter((r) => r.age !== 18).length;
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const on = settings.staffConfirmMinors;

  return (
    <Stage>
      <header className="mt-3">
        <div className="sx-ops-in flex flex-wrap items-center gap-3" style={at(0.05)}>
          <span className="relative flex size-2">
            <span className="sx-login-ping relative inline-flex size-2 rounded-full bg-[#22c98d] shadow-[0_0_8px_#22c98d]" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Sign-up rules</h1>
          <span className="rounded-full border border-[#9be0ff]/30 bg-[#04080f]/40 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.2em] text-[#cfe9ff]">
            Postgres · read {readAt}
          </span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Places in the table" value={table.rows.length} caption={`across ${countries} ${countries === 1 ? "country" : "countries"}`} tone="blue" delay={0.1} />
          <KpiTile
            label="Unknown place"
            value={table.unknownPlaceAthletes}
            caption={table.unknownPlaceAthletes ? "athletes counted as adults at 18 · flagged" : "every athlete's place is in the table"}
            tone={table.unknownPlaceAthletes ? "orange" : "green"}
            delay={0.16}
          />
          <KpiTile label="Not 18" value={not18} caption="places with another age" tone="cyan" delay={0.22} />
          {/* The rule's state in words — a figure tile would read "0 / 1". */}
          <div className="sx-ops-panel sx-ops-in relative px-4 pb-4 pt-3.5" style={at(0.28)}>
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px]" style={{ background: on ? "#f97a1f" : "#22c55e", boxShadow: `0 0 10px ${on ? "#f97a1f" : "#22c55e"}` }} />
            <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8a96a3]">Minors</dt>
            <dd className={`mt-2 text-lg font-bold leading-tight ${on ? "text-[#fdba74]" : "text-[#86efac]"}`}>
              {on ? "Wait for a person" : "Approved by their checks"}
              <span className="mt-1.5 block text-[11px] font-normal text-[#7e88a0]">staff confirmation {on ? "on" : "off"}</span>
            </dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="sr-minors" className="sx-ops-panel sx-ops-in relative mt-8 px-5 pb-5 pt-4" style={at(0.32)}>
        <h2 id="sr-minors" className="mb-4 text-[11px] font-semibold uppercase tracking-[0.3em] text-[#cfe9ff]">Minors</h2>
        <StaffConfirmSwitch on={on} />
      </section>

      <div className="mt-8">
        <RulesBoard rows={table.rows} />
      </div>

      <p className="sx-ops-in mt-8 text-[11px] text-[#7e88a0]" style={at(0.8)}>
        Every change is recorded. Changing a place works out the age again for the athletes who live there.
      </p>
    </Stage>
  );
}
