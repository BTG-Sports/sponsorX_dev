/* --------------------------------------------------------------------------
   POL-FE-99 — help search. Pure and synchronous, so the search bar filters on
   every keystroke with no request.

   Every word typed must match the start of a word somewhere in the article
   ("withdr" finds "withdraw"). Where it matches decides the rank: the
   question counts most, then keywords, the short answer, and last the step
   text. A whole-word match beats a prefix. Case and accents are ignored.
   -------------------------------------------------------------------------- */

import type { HelpArticle } from "./types";

export type Seg = { text: string; hit: boolean };
/** What search reads of an article — a full article, or the lighter card the client islands get. */
export type Searchable = Pick<HelpArticle, "question" | "summary" | "keywords"> & { steps: readonly { title: string; body: string }[] };

export type HelpHit<T extends Searchable = HelpArticle> = {
  article: T;
  score: number;
  question: Seg[];
  summary: Seg[];
  /** A step that matched, when the question itself didn't. */
  step: { index: number; title: string; body: Seg[] } | null;
};

const WEIGHT = { question: 8, keywords: 5, summary: 3, steps: 1 } as const;
const WORD = /[\p{L}\p{N}]+/gu;

export function normalise(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function terms(q: string): string[] {
  return [...new Set(normalise(q).match(WORD) ?? [])];
}

function words(s: string): string[] {
  return normalise(s).match(WORD) ?? [];
}

/** 1 for a whole word, 0.7 for a prefix, 0 for no match. */
function fieldMatch(fieldWords: string[], term: string): number {
  let best = 0;
  for (const w of fieldWords) {
    if (w === term) return 1;
    if (w.startsWith(term)) best = 0.7;
  }
  return best;
}

/** `text` cut into plain and matched pieces; joined they give `text` back. */
export function segments(text: string, ts: string[]): Seg[] {
  if (!ts.length) return [{ text, hit: false }];
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD)) {
    const word = normalise(m[0]);
    const term = ts.filter((t) => word.startsWith(t)).sort((a, b) => b.length - a.length)[0];
    if (!term) continue;
    const start = m.index!;
    const end = start + Math.min(term.length, m[0].length);
    if (start > last) out.push({ text: text.slice(last, start), hit: false });
    out.push({ text: text.slice(start, end), hit: true });
    last = end;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}

export function searchHelp<T extends Searchable>(articles: readonly T[], q: string, limit = 50): HelpHit<T>[] {
  const ts = terms(q);
  if (!ts.length) return [];
  const hits: HelpHit<T>[] = [];
  articles.forEach((article) => {
    const fields = {
      question: words(article.question),
      keywords: article.keywords.flatMap(words),
      summary: words(article.summary),
      steps: article.steps.flatMap((s) => words(`${s.title} ${s.body}`)),
    };
    let score = 0;
    for (const t of ts) {
      let termScore = 0;
      for (const f of Object.keys(WEIGHT) as (keyof typeof WEIGHT)[]) termScore += WEIGHT[f] * fieldMatch(fields[f], t);
      if (!termScore) return; // every word must match somewhere
      score += termScore;
    }
    const inQuestion = ts.some((t) => fieldMatch(fields.question, t) > 0);
    const stepIndex = inQuestion ? -1 : article.steps.findIndex((s) => ts.some((t) => fieldMatch(words(`${s.title} ${s.body}`), t) > 0));
    hits.push({
      article,
      score,
      question: segments(article.question, ts),
      summary: segments(article.summary, ts),
      step: stepIndex >= 0 ? { index: stepIndex, title: article.steps[stepIndex].title, body: segments(article.steps[stepIndex].body, ts) } : null,
    });
  });
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
