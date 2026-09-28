/* --------------------------------------------------------------------------
   Commission rules — the admin editor's pure half (2S5-FE-01).

   The API decides everything that matters: which rule applies, versioning,
   the split itself (backend commission.ts / ledger-math.ts). This module only
   shapes its answers for the screen and turns what an admin types (a
   percentage, a dollar amount) into what the API takes (basis points, cents).
   documentation/SponsorX-Phase2-Ledger-Design.md is the rulebook.
   -------------------------------------------------------------------------- */

export type RuleKind = "PLATFORM_FEE" | "MANAGEMENT_FEE" | "PROCESSING" | "REFERRAL" | "RESERVE" | "TEAM_SHARE";
export type RuleScope = "GLOBAL" | "PROPERTY_KIND" | "PROPERTY" | "SPONSOR";

export type ApiRule = {
  id: string; ruleKey: string; version: number; kind: RuleKind; scope: RuleScope; scopeRef: string | null;
  bps: number; fixedCents: number; priority: number; effectiveFrom: string; effectiveTo: string | null; note: string | null;
};

/** The order money comes off in — ledger design §2 — and what each is, in plain words. */
export const KINDS: ReadonlyArray<{ kind: RuleKind; label: string; hint: string; fixed: boolean }> = [
  { kind: "PLATFORM_FEE", label: "Platform fee", hint: "BTG's fee, taken from each sale", fixed: true },
  { kind: "MANAGEMENT_FEE", label: "Management fee", hint: "BTG's fee for managing the property", fixed: false },
  { kind: "PROCESSING", label: "Processing", hint: "Card processing, once per order", fixed: true },
  { kind: "REFERRAL", label: "Referral", hint: "Paid to whoever referred the property, from its share", fixed: false },
  { kind: "RESERVE", label: "Reserve", hint: "Held back from the property's share until the order closes", fixed: false },
  { kind: "TEAM_SHARE", label: "Property's cut of athlete items", hint: "Used when the roster doesn't set one", fixed: false },
];
export const KIND_LABEL = Object.fromEntries(KINDS.map((k) => [k.kind, k.label])) as Record<RuleKind, string>;

export const SCOPES: ReadonlyArray<{ scope: RuleScope; label: string }> = [
  { scope: "GLOBAL", label: "Everyone" },
  { scope: "PROPERTY_KIND", label: "A type of property" },
  { scope: "PROPERTY", label: "One property" },
  { scope: "SPONSOR", label: "One sponsor" },
];
export const PROPERTY_KINDS = ["TEAM", "SCHOOL", "EVENT", "MEDIA", "VIRTUAL"] as const;

/** 1500 → "15%", 290 → "2.9%". */
export function pctLabel(bps: number): string {
  return `${Number((bps / 100).toFixed(2))}%`;
}

/** 12345 → "$123.45". */
export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2.9" or "2.9%" → 290 basis points; null when it is not a percentage from 0 to 100 with at most two decimals. */
export function parsePercent(input: string): number | null {
  const s = input.trim().replace(/%$/, "").trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const bps = Math.round(Number(s) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

/** "0.30" or "$0.30" → 30 cents; "" → 0; null when it is not a dollar amount. */
export function parseDollars(input: string): number | null {
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!s) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function scopeLabel(r: Pick<ApiRule, "scope" | "scopeRef">): string {
  if (r.scope === "GLOBAL") return "Everyone";
  if (r.scope === "PROPERTY_KIND") return `All ${String(r.scopeRef).toLowerCase()}s`;
  if (r.scope === "PROPERTY") return `Property ${r.scopeRef}`;
  return `Sponsor ${r.scopeRef}`;
}

/** The rule as a person would say it: "15% + $0.30". */
export function rateLabel(r: Pick<ApiRule, "bps" | "fixedCents">): string {
  return r.fixedCents ? `${pctLabel(r.bps)} + ${usd(r.fixedCents)}` : pctLabel(r.bps);
}

export type RuleGroup = { kind: RuleKind; label: string; hint: string; current: ApiRule[]; history: Record<string, ApiRule[]> };

/**
 * Current rules per kind, highest priority first — the order the API applies
 * them in — with every earlier version of each kept under its rule key.
 */
export function groupRules(rules: ApiRule[]): RuleGroup[] {
  return KINDS.map(({ kind, label, hint }) => {
    const mine = rules.filter((r) => r.kind === kind);
    const current = mine.filter((r) => r.effectiveTo === null).sort((a, b) => b.priority - a.priority || b.version - a.version);
    const history: Record<string, ApiRule[]> = {};
    for (const r of mine.filter((r) => r.effectiveTo !== null).sort((a, b) => b.version - a.version)) {
      (history[r.ruleKey] ??= []).push(r);
    }
    return { kind, label, hint, current, history };
  });
}

export type NewRuleForm = { kind: RuleKind; scope: RuleScope; scopeRef: string; percent: string; fixed: string; priority: string; note: string };

/** What the admin typed, as the API's rule — or the first thing wrong with it, in words. */
export function toRuleInput(f: NewRuleForm):
  | { ok: true; rule: { kind: RuleKind; scope: RuleScope; scopeRef: string | null; bps: number; fixedCents: number; priority: number; note: string | null } }
  | { ok: false; message: string } {
  const bps = parsePercent(f.percent);
  if (bps === null) return { ok: false, message: "Enter the rate as a percentage from 0 to 100, e.g. 15 or 2.9." };
  const fixedCents = parseDollars(f.fixed);
  if (fixedCents === null) return { ok: false, message: "Enter the fixed amount in dollars, e.g. 0.30 — or leave it empty." };
  if (fixedCents > 0 && !KINDS.find((k) => k.kind === f.kind)?.fixed) {
    return { ok: false, message: "Only the platform fee and processing can carry a fixed amount." };
  }
  if (!/^-?\d{1,4}$/.test(f.priority.trim())) return { ok: false, message: "Priority is a whole number; higher wins." };
  const scopeRef = f.scope === "GLOBAL" ? null : f.scopeRef.trim();
  if (f.scope !== "GLOBAL" && !scopeRef) return { ok: false, message: "Say which property type, property or sponsor this rule is for." };
  return { ok: true, rule: { kind: f.kind, scope: f.scope, scopeRef, bps, fixedCents, priority: Number(f.priority.trim()), note: f.note.trim() || null } };
}

export type SampleLine = { label: string; amount: string; propertyKind: string; athleteItem: boolean; teamShare: string };

export function toPreviewLines(lines: SampleLine[]):
  | { ok: true; lines: Array<{ label: string; grossCents: number; propertyKind: string | null; athleteItem: boolean; teamShareBps: number | null }> }
  | { ok: false; message: string } {
  const out = [];
  for (const [i, l] of lines.entries()) {
    const cents = parseDollars(l.amount);
    if (!cents) return { ok: false, message: `Line ${i + 1}: enter a sale amount in dollars.` };
    const share = l.athleteItem && l.teamShare.trim() ? parsePercent(l.teamShare) : null;
    if (l.athleteItem && l.teamShare.trim() && share === null) return { ok: false, message: `Line ${i + 1}: the property's cut is a percentage.` };
    out.push({ label: l.label.trim() || `Line ${i + 1}`, grossCents: cents, propertyKind: l.propertyKind || null, athleteItem: l.athleteItem, teamShareBps: share });
  }
  return out.length ? { ok: true, lines: out } : { ok: false, message: "Add at least one line." };
}

export type PreviewLineResult = {
  lineId: string; netCents: number; platformFeeCents: number; managementFeeCents: number; processingCents: number;
  propertyShareCents: number; referralCents: number; reserveCents: number; availableCents: number;
  teamAvailableCents: number | null; teamReserveCents: number | null;
};
export type PreviewRun = { lines: PreviewLineResult[]; totals: Omit<PreviewLineResult, "lineId" | "teamAvailableCents" | "teamReserveCents"> };
export type PreviewResult = { current: PreviewRun; withDraft: PreviewRun | null };

/** The rows of the preview table, top to bottom — the ledger design's order. */
export const PREVIEW_ROWS: ReadonlyArray<{ key: keyof PreviewRun["totals"]; label: string; strong?: boolean }> = [
  { key: "netCents", label: "Sale" },
  { key: "platformFeeCents", label: "Platform fee" },
  { key: "managementFeeCents", label: "Management fee" },
  { key: "processingCents", label: "Processing" },
  { key: "propertyShareCents", label: "Property's share", strong: true },
  { key: "referralCents", label: "Referral" },
  { key: "reserveCents", label: "Reserve (held until the order closes)" },
  { key: "availableCents", label: "Available to the property", strong: true },
];

/** Admin only — the screen, and the API behind it (RBAC matrix §21). */
export function isCommissionAdmin(roles: readonly string[]): boolean {
  return roles.includes("BTG_ADMIN") || roles.includes("SUPER_ADMIN");
}
