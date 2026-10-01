/**
 * One business name, compared one way — 2S1-BE-17, 2S1-BE-06. Pure.
 *
 * "Westfield Hawks", "The Westfield Hawks" and "westfield hawks, LLC" are
 * the same name. Case, accents, punctuation, spacing, a leading "The", "&"
 * for "and", and legal endings (LLC, Inc, Corp, Co, Ltd …) are ignored.
 * Sponsors use it to send a likely duplicate to BTG; organizations use it to
 * refuse a second registration of a name.
 */
const LEGAL_ENDINGS = new Set(["llc", "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "limited", "llp", "pllc", "plc", "lp", "pc"]);

export function normalizeBusinessName(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (words[0] === "the" && words.length > 1) words.shift();
  while (words.length > 1 && LEGAL_ENDINGS.has(words[words.length - 1]!)) words.pop();
  return words.join("");
}
