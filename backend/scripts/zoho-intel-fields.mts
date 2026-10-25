/**
 * Add SponsorX's two intelligence fields to Zoho's Accounts — 3S7-INT-01.
 *
 *   npm run zoho:intel-fields -w @sponsorx/backend                         (check only)
 *   npm run zoho:intel-fields -w @sponsorx/backend -- --create             (sandbox)
 *   npm run zoho:intel-fields -w @sponsorx/backend -- --create --confirm-production
 *
 * SponsorX_Renewal_Score (whole number, 0–100) and SponsorX_Next_Action
 * (single line, 255). Safe to run again: a field that exists is left alone.
 * The sandbox first, production only with the user's OK — so production
 * needs --confirm-production as well (the org id tells them apart).
 */
import { zohoFromEnv } from "../src/lib/zoho.ts";
import { ZOHO_NEXT_ACTION, ZOHO_RENEWAL_SCORE } from "../src/domain/zoho-intelligence.ts";

/* The production CRM org's two ids: `ZOHO_EXPECTED_ORG_ID` holds the org id
   (what lib/zoho.ts checks against /org), and 749122837 is its zgid. This
   used to list only the zgid, so the guard never fired (fixed 2026-10-24). */
const PRODUCTION_ORG_IDS = new Set(["4857533000000020005", "749122837"]);
const args = new Set(process.argv.slice(2));
const create = args.has("--create");
const isProduction = PRODUCTION_ORG_IDS.has(process.env.ZOHO_EXPECTED_ORG_ID ?? "");
if (create && isProduction && !args.has("--confirm-production")) {
  console.error("This is the production Zoho org. Add --confirm-production once the user has OK'd it.");
  process.exit(2);
}

/* No tooltip: Zoho's v8 field API refuses one in this shape with INVALID_DATA (sandbox, 2026-10-15). */
const WANTED = [
  { apiName: ZOHO_RENEWAL_SCORE, field: { field_label: "SponsorX Renewal Score", data_type: "integer" } },
  { apiName: ZOHO_NEXT_ACTION, field: { field_label: "SponsorX Next Action", data_type: "text", length: 255 } },
];

const zoho = zohoFromEnv();
const list = (await zoho.request("GET", "/crm/v8/settings/fields?module=Accounts")) as { fields?: Array<{ api_name: string; data_type: string }> };
const have = new Map((list.fields ?? []).map((f) => [f.api_name, f.data_type]));
console.log(`Zoho org: ${isProduction ? "PRODUCTION" : "sandbox"} (${process.env.ZOHO_EXPECTED_ORG_ID ?? "unknown"})`);
const missing = WANTED.filter((w) => !have.has(w.apiName));
for (const w of WANTED) console.log(`  ${w.apiName}: ${have.has(w.apiName) ? `present (${have.get(w.apiName)})` : "missing"}`);
if (!missing.length) process.exit(0);
if (!create) {
  console.log("Run again with --create to add the missing field(s).");
  process.exit(1);
}
const made = (await zoho.request("POST", "/crm/v8/settings/fields?module=Accounts", { fields: missing.map((m) => m.field) })) as { fields?: Array<{ code: string; details?: { id?: string }; message?: string }> };
for (const [i, r] of (made.fields ?? []).entries()) console.log(`  created ${missing[i]!.apiName}: ${r.code}${r.message ? ` — ${r.message}` : ""}${r.code === "SUCCESS" ? "" : ` ${JSON.stringify(r.details ?? {})}`}`);
const again = (await zoho.request("GET", "/crm/v8/settings/fields?module=Accounts")) as { fields?: Array<{ api_name: string }> };
const now = new Set((again.fields ?? []).map((f) => f.api_name));
const wrong = WANTED.filter((w) => !now.has(w.apiName));
if (wrong.length) {
  console.error(`Zoho named the field(s) differently — check Setup → Modules → Accounts for: ${wrong.map((w) => w.field.field_label).join(", ")}`);
  process.exit(1);
}
console.log("Both fields are in place.");
