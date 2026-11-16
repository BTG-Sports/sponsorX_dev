/* --------------------------------------------------------------------------
   POL-FE-77 — the advisor pastes the school's roster (POST
   /properties/:id/roster, names and graduation years only). One student per
   line: "Full name" or "Full name, 2027" (a tab or a comma before the year,
   so a column copied from a spreadsheet works). Pure.
   -------------------------------------------------------------------------- */

export type RosterRow = { legalName: string; gradYear: number | null };
export const ROSTER_MAX = 2000;

/** The rows to send, and the lines that couldn't be read (by line number). */
export function parseRoster(text: string): { rows: RosterRow[]; problems: string[] } {
  const rows: RosterRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/\t|,/).map((p) => p.trim()).filter(Boolean);
    const last = parts.at(-1) ?? "";
    const year = /^\d{4}$/.test(last) ? Number(last) : null;
    const name = (year === null ? parts : parts.slice(0, -1)).join(" ").replace(/\s+/g, " ");
    if (!name) return problems.push(`Line ${i + 1}: no name.`);
    if (name.length > 200) return problems.push(`Line ${i + 1}: the name is too long.`);
    if (year !== null && (year < 2020 || year > 2040)) return problems.push(`Line ${i + 1}: ${year} isn't a graduation year between 2020 and 2040.`);
    const key = `${name.toLowerCase()}|${year ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ legalName: name, gradYear: year });
  });
  if (rows.length > ROSTER_MAX) problems.push(`Paste at most ${ROSTER_MAX.toLocaleString("en-US")} students at a time.`);
  return { rows, problems };
}
