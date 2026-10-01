/* --------------------------------------------------------------------------
   2S1-FE-11 (word-list half) — BTG's restricted-words desk (Claude Design
   RestrictedWords.dc.html, views list / add / test), over 2S1-BE-18's API
   (BTG admin and super admin only):

     GET    /restricted-words           every word, active and removed, + the kinds
     GET    /restricted-words/history   who added or removed what, and when
     POST   /restricted-words           {word, kind} — adds, or brings a removed word back
     DELETE /restricted-words/:id       takes a word off the list (kept, as removed)
     POST   /restricted-words/test      {text} — what would match

   Pure: shapes, grouping, and every word the screen shows that is derived
   rather than read. What matches is the API's answer, never guessed here.
   -------------------------------------------------------------------------- */

export type ApiRestrictedWord = {
  id: string;
  word: string;
  kind: string;
  active: boolean;
  /** A user id, or "starter" for the words the list began with. */
  addedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiRestrictedKind = { kind: string; label: string };
export type ApiRestrictedWordList = { words: ApiRestrictedWord[]; kinds: ApiRestrictedKind[] };

export type ApiRestrictedChange = { change: "added" | "removed"; word: string | null; by: string | null; at: string };
export type ApiRestrictedHistory = { history: ApiRestrictedChange[] };

export type ApiRestrictedTest = { restricted: boolean; matches: { word: string; kind: string; label: string }[] };

/* ---------------------------------------------------------------- groups */

export type WordGroup = { kind: string; label: string; active: ApiRestrictedWord[]; removed: ApiRestrictedWord[]; count: string };

const entries = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

/** The list by kind, in the API's kind order: active words, then removed ones. */
export function groupWords(list: ApiRestrictedWordList): WordGroup[] {
  const byWord = (a: ApiRestrictedWord, b: ApiRestrictedWord) => a.word.localeCompare(b.word);
  const known = new Set(list.kinds.map((k) => k.kind));
  /* A kind the API stores but no longer lists still shows, rather than its words vanishing. */
  const kinds = [...list.kinds, ...[...new Set(list.words.map((w) => w.kind))].filter((k) => !known.has(k)).map((k) => ({ kind: k, label: k }))];
  return kinds.map(({ kind, label }) => {
    const mine = list.words.filter((w) => w.kind === kind);
    const active = mine.filter((w) => w.active).sort(byWord);
    const removed = mine.filter((w) => !w.active).sort(byWord);
    return { kind, label, active, removed, count: entries(active.length) + (removed.length ? ` · ${removed.length} removed` : "") };
  });
}

/* --------------------------------------------------------------- history */

/** "Sep 30, 2:05 PM UTC" — the same clock the other desks use. */
export function whenOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export type HistoryLine = { at: string; when: string; text: string };

/**
 * The change history, newest first: the audit log's changes, then the day
 * the list began — the earliest starter word's own date, since seeding the
 * starter list is not an audited change.
 */
export function historyLines(history: readonly ApiRestrictedChange[], words: readonly ApiRestrictedWord[]): HistoryLine[] {
  const lines = history.map((h) => ({
    at: h.at,
    when: whenOf(h.at),
    text: `${h.by ?? "A BTG admin"} ${h.change} ${h.word ? `“${h.word}”` : "a word"}${h.change === "added" ? " to the list" : " from the list"}`,
  }));
  const started = words.filter((w) => w.addedBy === "starter").map((w) => w.createdAt).sort()[0];
  if (started) lines.push({ at: started, when: whenOf(started), text: "List started with BTG’s starter words" });
  return lines;
}

/* ------------------------------------------------------------------ test */

export type TestLine = { input: string; restricted: boolean; why: string };

/** The test box checks each line on its own, as the design shows — at most this many. */
export const TEST_LINES_MAX = 10;

export function testInputs(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, TEST_LINES_MAX);
}

/**
 * Why a line did or didn't match, in words. For a line the API passed, a
 * listed single word that sits inside a longer word is named — that is the
 * one near miss people ask about ("sex" inside "Essex").
 */
export function testWhy(input: string, result: ApiRestrictedTest, activeWords: readonly string[]): string {
  if (result.restricted) {
    const list = result.matches.map((m) => `“${m.word}” (${m.label})`);
    const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0];
    return `Matches ${joined} as a whole word. This would be held for BTG’s review — never rejected by itself.`;
  }
  const inside = nearMiss(input, activeWords);
  return inside
    ? `No match. “${inside.word}” sits inside the word “${inside.host}”, and letters inside a longer word don’t count.`
    : "No match.";
}

function nearMiss(input: string, activeWords: readonly string[]): { word: string; host: string } | null {
  const hosts = input.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (const w of activeWords) {
    if (/\s/.test(w)) continue;
    const lw = w.toLowerCase();
    const host = hosts.find((h) => h.toLowerCase() !== lw && h.toLowerCase().includes(lw));
    if (host) return { word: w, host };
  }
  return null;
}

/* ---------------------------------------------------------------- writes */

export type WordWriteFailure = { ok: false; status: number; message: string };

/** The API's own refusal, in its words ("“fake id” is already on the list."). */
export function wordRefusal(status: number, body: unknown): WordWriteFailure {
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  const m = typeof e?.message === "string" && e.message ? e.message : null;
  if (m && typeof issue === "string" && issue) return { ok: false, status, message: `${m} ${issue}` };
  return { ok: false, status, message: m ?? (status === 403 ? "Only BTG admins can change the restricted words." : "Something went wrong — nothing changed.") };
}
