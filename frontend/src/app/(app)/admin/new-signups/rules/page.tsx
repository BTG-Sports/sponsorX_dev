import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { AgeRowForm, RemoveAgeRow, StaffConfirmSwitch } from "@/components/signup-rules-editor";
import { Card } from "@/components/ui";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Sign-up rules — 2S1-FE-07, beside the New sign-ups desk (no Claude Design
   artboard; it follows the restricted-words page's plain list). The two rules
   automatic approval reads, kept by BTG admins (2S1-BE-10 / -12):

   - "BTG staff confirm minors before approval" — off by default, so the
     system approves; on, for the open guardian e-signature question;
   - the age of majority by place: a country, or a state within it. Most US
     states are 18, Alabama and Nebraska 19, Mississippi 21. A place not in
     the table counts as 18 and is flagged on the desk.

   Reads  GET /signup-rules/settings · GET /signup-rules/age-table
   Writes PUT /signup-rules/settings · PUT / DELETE /signup-rules/age-table   (./actions.ts)
   The network manager reads; only a BTG admin's changes are accepted.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/new-signups";

type AgeTable = { rows: { id: string; countryCode: string; regionCode: string; age: number; updatedBy: string | null; updatedAt: string }[]; unknownPlaceAthletes: number };

export default async function SignupRulesPage() {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Sign-up rules" roles={lacking} />;
  const [settingsRes, tableRes] = await Promise.all([apiFetch("/signup-rules/settings"), apiFetch("/signup-rules/age-table")]);
  if (settingsRes.status === 403 || tableRes.status === 403) {
    return (
      <div className="space-y-3">
        <Link href={PATH} className="text-xs text-muted hover:text-text">← New sign-ups</Link>
        <p className="text-sm">Your role doesn&rsquo;t read the sign-up rules.</p>
      </div>
    );
  }
  if (!settingsRes.ok || !tableRes.ok) throw new Error(`The sign-up rules couldn't be read (${settingsRes.ok ? tableRes.status : settingsRes.status}).`);
  const settings = (await settingsRes.json()) as { staffConfirmMinors: boolean };
  const table = (await tableRes.json()) as AgeTable;
  const countries = [...new Set(table.rows.map((r) => r.countryCode))];

  return (
    <div className="space-y-6">
      <div>
        <Link href={PATH} className="text-xs text-muted hover:text-text">← New sign-ups</Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Sign-up rules</h1>
        <p className="mt-1 text-xs text-muted">What SponsorX checks before it approves an athlete by itself. Every change is recorded.</p>
      </div>

      <section aria-labelledby="sr-minors" className="space-y-2">
        <h2 id="sr-minors" className="text-sm font-semibold">Minors</h2>
        <Card><StaffConfirmSwitch on={settings.staffConfirmMinors} /></Card>
      </section>

      <section aria-labelledby="sr-age" className="space-y-2">
        <h2 id="sr-age" className="text-sm font-semibold">Age of majority by place</h2>
        <p className="text-xs text-muted">
          {table.unknownPlaceAthletes} athlete{table.unknownPlaceAthletes === 1 ? " lives" : "s live"} in a place not in this table — counted as adults at 18 and flagged on New sign-ups.
        </p>
        <Card><AgeRowForm /></Card>
        <Card className="overflow-hidden p-0">
          {countries.map((c) => (
            <div key={c} role="region" aria-label={`Places in ${c}`} className="border-b border-line-soft last:border-b-0">
              <p className="bg-surface-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{c}</p>
              <ul className="divide-y divide-line-soft">
                {table.rows.filter((r) => r.countryCode === c).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-[13px]">
                    <span className="min-w-0 flex-1">{r.regionCode ? `${r.regionCode}` : `All of ${c}`}</span>
                    <span className="tabular-nums">Adult at {r.age}</span>
                    <RemoveAgeRow row={r} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
