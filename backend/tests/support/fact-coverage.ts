/* --------------------------------------------------------------------------
   3S1-QA-02 — the scanner behind tests/fact-coverage.static.test.ts.

   Finds every place in the code that writes money or delivery data: the
   fields a fact is made from (an order's state and price, a deliverable's
   state and due date, an earning's payment, a metric, an invoice, an ad
   slot's sale, a marketplace line's financials, a refund being sent, a
   ledger reversal), and any write at all to the fact tables themselves.

   Each place is named `file › function › model.op` — stable across edits
   that move lines — so the test can hold a reviewed decision for each one.
   Pure: it takes source text, so the test can hand it a copy with a fact
   call removed and watch it fail.
   -------------------------------------------------------------------------- */

export type Source = { file: string; text: string };
/** `count`: how many writes of this kind the function makes — each needs its own fact call. */
export type Site = { key: string; file: string; fn: string; line: number; count: number };

/** Model → the fields whose change is a fact. `ALL` — every write counts (creates, deletes and upserts always do). */
const WATCHED: Record<string, RegExp | "ALL"> = {
  campaignOrder: /\b(state|acceptedAt|sellPrice|compensation|jobId|athleteId|campaignId)\b/,
  deliverable: /\b(state|dueDate|platform|publishedAt)\b/,
  earning: /\b(state|paidAt|gross|adjustment)\b/,
  metricDaily: "ALL",
  campaignInvoice: "ALL",
  adSlot: /\b(campaignId|soldCents|soldAt)\b/,
  placementWindow: /\b(state|priceCents|campaignId)\b/,
  orderLineFinancials: "ALL",
  refundDue: /\b(state|sentAt|sentOn|amountCents)\b/,
  ledgerEntry: /"REVERSED"/,
  fact: "ALL",
  campaignDaySummary: "ALL",
};
const TABLES: Record<string, string> = {
  CampaignOrder: "campaignOrder", Deliverable: "deliverable", Earning: "earning", MetricDaily: "metricDaily",
  CampaignInvoice: "campaignInvoice", AdSlot: "adSlot", OrderLineFinancials: "orderLineFinancials", RefundDue: "refundDue",
  LedgerEntry: "ledgerEntry", Fact: "fact", CampaignDaySummary: "campaignDaySummary",
};

const WRITE = /\b(?:tx|prisma|db|client)\.(\w+)\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\(/g;
const ALWAYS = new Set(["create", "createMany", "createManyAndReturn", "upsert", "delete", "deleteMany"]);
const RAW = /\b(?:tx|prisma|db|client)\.\$(executeRaw|executeRawUnsafe|queryRaw|queryRawUnsafe)(?:<[^`(]*?>)?(`|\()/g;
const RAW_WRITE = /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"(\w+)"/gi;
/** A top-level function or const, at the start of a line. */
const TOP = /^(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*(\w+)|const\s+(\w+)\s*(?::[^=]+)?=)/gm;

function extent(s: string, start: number, open: string): number {
  let i = start;
  if (open === "`") {
    while (i < s.length && s[i] !== "`") i++;
    return i + 1;
  }
  let depth = 1;
  while (depth && i < s.length) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    i++;
  }
  return i;
}

function inComment(s: string, index: number): boolean {
  const lineStart = s.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\*|\/\/|\/\*)/.test(s.slice(lineStart, index));
}

/** The top-level functions of a file: name, start and end offsets. */
export function functionsOf(text: string): Array<{ name: string; start: number; end: number }> {
  const starts = [...text.matchAll(TOP)].map((m) => ({ name: (m[1] ?? m[2])!, start: m.index! }));
  return starts.map((f, i) => ({ ...f, end: starts[i + 1]?.start ?? text.length }));
}

/** Code only — comments blanked — so a fact call mentioned in a comment does not count as made. */
export function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, (c) => " ".repeat(c.length));
}

/** Every money or delivery write in these sources. */
export function factSites(sources: Source[]): Site[] {
  const sites: Site[] = [];
  for (const { file, text } of sources) {
    const fns = functionsOf(text);
    const fnAt = (i: number) => [...fns].reverse().find((f) => f.start <= i)?.name ?? "(top level)";
    const lineOf = (i: number) => text.slice(0, i).split("\n").length;
    const add = (i: number, what: string) => {
      const fn = fnAt(i);
      sites.push({ key: `${file} › ${fn} › ${what}`, file, fn, line: lineOf(i), count: 1 });
    };
    for (const m of text.matchAll(WRITE)) {
      const watch = WATCHED[m[1]!];
      if (!watch || inComment(text, m.index!)) continue;
      const args = text.slice(m.index! + m[0].length, extent(text, m.index! + m[0].length, "(") - 1);
      /* What an update changes is its `data`; how it finds its row (`where`) changes nothing. */
      const changes = args.includes("data:") ? args.slice(args.indexOf("data:")) : args;
      if (watch === "ALL" || ALWAYS.has(m[2]!) || watch.test(changes)) add(m.index!, `${m[1]}.${m[2]}`);
    }
    for (const m of text.matchAll(RAW)) {
      if (inComment(text, m.index!)) continue;
      const body = text.slice(m.index! + m[0].length, extent(text, m.index! + m[0].length, m[2]!) - 1);
      for (const w of body.matchAll(RAW_WRITE)) {
        const model = TABLES[w[1]!];
        if (model) add(m.index!, `raw ${w[0].split(/\s+/)[0]!.toUpperCase()} ${w[1]}`);
      }
    }
  }
  /* One key per function and write: several of the same write in one function share a decision, counted. */
  const byKey = new Map<string, Site>();
  for (const s of sites) {
    const had = byKey.get(s.key);
    if (had) had.count++;
    else byKey.set(s.key, s);
  }
  return [...byKey.values()];
}

/** The code of one named top-level function in a source, comments blanked; "" when it is not there. */
export function functionCode(sources: Source[], file: string, fn: string): string {
  const src = sources.find((s) => s.file === file);
  if (!src) return "";
  const f = functionsOf(src.text).find((x) => x.name === fn);
  return f ? codeOf(src.text.slice(f.start, f.end)) : "";
}
