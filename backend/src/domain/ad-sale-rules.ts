/**
 * The student-audience gate on an ad sale — P9-BE-18 (programme owner,
 * 2026-10-03, item 23). Pure; ad-sale-auto.ts and edition.ts's sale meet
 * the database.
 *
 * A NEXT edition is read by students, nearly all of them minors, and sold
 * by them. So before any ad sells — by the system or by SALES and BTG by
 * hand — the sponsor's and the brief's categories are asked:
 *
 *   NOT_FOR_STUDENTS   a category the student programme never sells
 *                      (student.ts — the same list that refuses a prospect);
 *   SENSITIVE          an age-gated category (brand-categories.ts — the same
 *                      list that holds a brief for BTG);
 *   UNKNOWN_CATEGORY   a category outside the vocabulary — never guessed at;
 *   CLASH              a category already held exclusively: by an edition's
 *                      presenting sponsor at this school (student.ts
 *                      `heldCategories`), or by a sponsor in this edition who
 *                      bought exclusivity — and, the other way round, an
 *                      exclusive buyer cannot take a category another sponsor
 *                      in this edition already sells in.
 *
 * Those four refuse a manual sale too. The automatic sale also holds on:
 *
 *   NO_CATEGORIES      nothing says what the sponsor sells, so the gate above
 *                      cannot be answered — a person decides;
 *   NO_EDITION         no edition the sponsor could buy into is selling;
 *   EDITION_CHOICE     more than one is, and which is SALES's call;
 *   NO_SLOT            the positions the package promises are not free;
 *   CAMPAIGN_STATE     the campaign is past DRAFT, so it buys nothing more.
 *
 * Only NO_EDITION and NO_SLOT can clear by themselves (an edition opens for
 * sale, BTG adds a slot), so a hold whose every reason is one of those is
 * retried by the sweep. Every other hold waits for a person.
 */
import { BRAND_CATEGORIES, isSensitiveCategory, SENSITIVE_CATEGORY_WORDS } from "./brand-categories";
import { NOT_FOR_STUDENTS } from "./student";

export const SALE_HOLD_KEYS = [
  "NOT_FOR_STUDENTS", "SENSITIVE", "UNKNOWN_CATEGORY", "CLASH",
  "NO_CATEGORIES", "NO_EDITION", "EDITION_CHOICE", "NO_SLOT", "CAMPAIGN_STATE",
] as const;
export type SaleHoldKey = (typeof SALE_HOLD_KEYS)[number];
export type SaleHold = { key: SaleHoldKey; text: string };

/** The reasons that clear by themselves — a hold made only of these is retried. */
export const RETRYABLE_HOLDS: ReadonlySet<SaleHoldKey> = new Set(["NO_EDITION", "NO_SLOT"]);

/** The reasons a sale by a person is refused for, as well as the system's. */
export const MANUAL_REFUSALS: ReadonlySet<SaleHoldKey> = new Set(["NOT_FOR_STUDENTS", "SENSITIVE", "UNKNOWN_CATEGORY", "CLASH"]);

const words = (c: string) => (isSensitiveCategory(c) ? SENSITIVE_CATEGORY_WORDS[c] : c.toLowerCase().replaceAll("_", " "));

/** The sponsor's and the brief's categories, once each, in order. */
export function saleCategories(sponsor: readonly string[], brief: readonly string[]): string[] {
  return [...new Set([...sponsor, ...brief])];
}

/**
 * The category reasons, in words. `automatic` adds NO_CATEGORIES when the
 * SPONSOR has no category recorded — a brief's categories describe one ask,
 * not everything the sponsor sells. A person selling by hand has looked at
 * the sponsor; the system has not.
 */
export function categoryHolds(
  categories: readonly string[],
  opts: { automatic: boolean; sponsorCategories?: readonly string[] },
): SaleHold[] {
  const out: SaleHold[] = [];
  const known = new Set<string>(BRAND_CATEGORIES);
  const unknown = categories.filter((c) => !known.has(c));
  const notForStudents = categories.filter((c) => known.has(c) && NOT_FOR_STUDENTS.has(c));
  const sensitive = categories.filter((c) => isSensitiveCategory(c));
  if (opts.automatic && (opts.sponsorCategories ?? categories).length === 0) {
    out.push({ key: "NO_CATEGORIES", text: "SponsorX doesn't know what this sponsor sells — no category is recorded on the sponsor" });
  }
  if (unknown.length) {
    out.push({ key: "UNKNOWN_CATEGORY", text: `Unknown category: ${unknown.join(", ")}` });
  }
  if (notForStudents.length) {
    out.push({ key: "NOT_FOR_STUDENTS", text: `The student programme doesn't sell ${notForStudents.map(words).join(", ")}` });
  }
  if (sensitive.length) {
    out.push({ key: "SENSITIVE", text: `${sensitive.map(words).join(", ")} ${sensitive.length === 1 ? "is a sensitive category" : "are sensitive categories"}` });
  }
  return out;
}

/** CLASH, from the categories already held exclusively and the buyer's own. */
export function clashHold(mine: readonly string[], held: ReadonlySet<string>, edition: string): SaleHold | null {
  const clash = mine.filter((c) => held.has(c));
  if (!clash.length) return null;
  return { key: "CLASH", text: `Category clash in ${edition}: ${clash.map(words).join(", ")} is already held exclusively` };
}

/** Is every reason one that clears by itself? */
export function retryable(keys: readonly string[]): boolean {
  return keys.length > 0 && keys.every((k) => RETRYABLE_HOLDS.has(k as SaleHoldKey));
}

/** Refused by hand as well: a sale by SALES or BTG fails on any of these. */
export class AdSaleRefusedError extends Error {
  readonly status = 409;
  readonly code = "ad_sale_refused";
  readonly reasons: SaleHold[];
  /** Merged into the error body (error-body.ts): `reasons: [{ key, text }]`. */
  readonly details: { reasons: SaleHold[] };
  constructor(reasons: SaleHold[]) {
    super(`This ad can't be sold to a student audience: ${reasons.map((r) => r.text).join("; ")}.`);
    this.name = "AdSaleRefusedError";
    this.reasons = reasons;
    this.details = { reasons };
  }
}
