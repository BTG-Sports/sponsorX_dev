"use server";

import { apiFetch } from "@/server/api";
import type { ApiRule, PreviewResult, RuleKind, RuleScope } from "@/lib/commission-live";

/* --------------------------------------------------------------------------
   2S5-FE-01 — the commission editor's writes and its preview, as server
   actions. The API's matrix (commissionRule: BTG admin) and its versioning
   decide; these add no authority, and forward what the screen built.
   -------------------------------------------------------------------------- */

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

const unreachable = "The API is unreachable — try again in a minute.";

async function send<T>(path: string, body: unknown, fallback: string): Promise<Result<T>> {
  try {
    const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
    if (!res.ok) return { ok: false, message: res.status === 403 ? "Commission rules are BTG admin's." : await reason(res, `${fallback} (HTTP ${res.status}).`) };
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, message: unreachable };
  }
}

export type RuleDraft = { kind: RuleKind; scope: RuleScope; scopeRef: string | null; bps: number; fixedCents: number; priority: number; note: string | null };

export async function createRuleAction(rule: RuleDraft): Promise<Result<ApiRule>> {
  return send<ApiRule>("/commission-rules", rule, "The rule was not saved");
}

export async function reviseRuleAction(id: string, change: { bps: number; fixedCents?: number; priority: number; note: string | null }): Promise<Result<ApiRule>> {
  return send<ApiRule>(`/commission-rules/${encodeURIComponent(id)}/revise`, change, "The rule was not revised");
}

export async function previewAction(input: {
  lines: Array<{ label: string; grossCents: number; propertyKind: string | null; athleteItem: boolean; teamShareBps: number | null }>;
  draft: Omit<RuleDraft, "note"> | null;
}): Promise<Result<PreviewResult>> {
  return send<PreviewResult>("/commission-rules/preview", input, "The preview failed");
}
