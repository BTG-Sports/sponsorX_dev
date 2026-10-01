/**
 * The restricted-words check — 2S1-BE-18. Pure.
 *
 * Free text (first: a sponsor's "Other" business description, 2S1-BE-17) is
 * tested against BTG's list of restricted words and phrases. A match never
 * rejects anything by itself: it marks the text restricted, says which words
 * matched and of what kind, and the item goes to BTG's review.
 *
 * Hard to get around: case, accents and common letter swaps are undone
 * ("S3X", "cöcaine", "c0caine"), and letters spaced or dotted apart are read
 * as one word ("d r u g s", "s.e.x"). Whole words only, so a word that merely
 * contains a listed one doesn't match ("Essex", "Sussex", "skill" for "kill").
 * A listed word also matches its plain plural ("drug" finds "drugs").
 */

export const RESTRICTED_KINDS = ["ADULT", "DRUGS", "WEAPONS", "GAMBLING", "VIOLENCE_HATE", "OTHER_ILLEGAL"] as const;
export type RestrictedKind = (typeof RESTRICTED_KINDS)[number];

export const KIND_LABELS: Record<RestrictedKind, string> = {
  ADULT: "Adult",
  DRUGS: "Drugs",
  WEAPONS: "Weapons",
  GAMBLING: "Gambling",
  VIOLENCE_HATE: "Violence and hate",
  OTHER_ILLEGAL: "Other illegal",
};

/** Digits and symbols people swap in for letters. */
const SWAPS: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i" };

/** The text as words: lower case, accents and letter swaps undone, split on anything else. */
export function tokens(text: string): string[] {
  /* A swapped character only counts as a letter where it sits in a word:
     digits and $ @ next to a letter ("p0rn", "$ex", "c@sino"), ! and |
     only between two letters ("ca!sino") — a trailing "!" is punctuation. */
  const plain = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/(?<=[a-z])[!|](?=[a-z])/g, (c) => SWAPS[c] ?? c)
    .replace(/(?<=[a-z])[0134578@$]|[0134578@$](?=[a-z])/g, (c) => SWAPS[c] ?? c);
  const raw = plain.split(/[^a-z]+/).filter(Boolean);
  /* Letters spelled out one at a time ("d r u g s", "s.e.x") join into one word. */
  const out: string[] = [];
  let run = "";
  for (const t of raw) {
    if (t.length === 1) { run += t; continue; }
    if (run) { out.push(run); run = ""; }
    out.push(t);
  }
  if (run) out.push(run);
  return out;
}

/** The form a list entry is stored and compared in: its words, space-separated. */
export function normalizeEntry(word: string): string {
  return tokens(word).join(" ");
}

export type RestrictedEntry = { word: string; normalized: string; kind: string };
export type RestrictedMatch = { word: string; kind: string };

const plural = (w: string) => [w, `${w}s`, `${w}es`];

/** Which listed entries the text contains, each once, in list order. */
export function findRestricted(text: string, entries: readonly RestrictedEntry[]): RestrictedMatch[] {
  const words = tokens(text);
  if (!words.length) return [];
  const out: RestrictedMatch[] = [];
  for (const e of entries) {
    const parts = e.normalized.split(" ").filter(Boolean);
    if (!parts.length) continue;
    let hit = false;
    for (let i = 0; i + parts.length <= words.length && !hit; i++) {
      hit = parts.every((p, k) => (k === parts.length - 1 ? plural(p).includes(words[i + k]!) : words[i + k] === p));
    }
    if (hit && !out.some((m) => m.word === e.word)) out.push({ word: e.word, kind: e.kind });
  }
  return out;
}

/**
 * The starter list a tenant's list is seeded with the first time it is used.
 * Plain, widely recognised terms; BTG adds and removes from there. Slurs are
 * deliberately not shipped in the code — BTG adds any it needs.
 */
export const STARTER_WORDS: readonly { word: string; kind: RestrictedKind }[] = [
  ...["sex", "sexual", "porn", "pornography", "xxx", "escort", "escort service", "strip club", "stripper", "adult entertainment",
    "adult store", "brothel", "erotic", "fetish", "onlyfans", "webcam model", "cam girl", "massage parlor", "nude", "sex shop"]
    .map((word) => ({ word, kind: "ADULT" as const })),
  ...["drug", "narcotic", "cocaine", "heroin", "meth", "methamphetamine", "fentanyl", "crack", "ecstasy", "mdma", "lsd",
    "psilocybin", "magic mushrooms", "marijuana", "cannabis", "weed", "kratom", "dispensary", "opioid", "pill mill"]
    .map((word) => ({ word, kind: "DRUGS" as const })),
  ...["gun", "firearm", "ammo", "ammunition", "rifle", "pistol", "handgun", "explosive", "grenade", "silencer", "weapon", "gun shop"]
    .map((word) => ({ word, kind: "WEAPONS" as const })),
  ...["casino", "betting", "sportsbook", "bookie", "poker", "lottery", "gambling", "slot machine"]
    .map((word) => ({ word, kind: "GAMBLING" as const })),
  ...["hate group", "terrorism", "terrorist", "extremist", "militia", "white power", "kill", "murder", "assassination"]
    .map((word) => ({ word, kind: "VIOLENCE_HATE" as const })),
  ...["counterfeit", "fake id", "money laundering", "stolen goods", "smuggling", "human trafficking", "trafficking",
    "ponzi", "pyramid scheme", "scam", "hacking service", "piracy", "illegal"]
    .map((word) => ({ word, kind: "OTHER_ILLEGAL" as const })),
];
