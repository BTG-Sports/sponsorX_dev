/**
 * The deal agreement's PDF page — the download both sides and BTG take
 * (2S4-BE-14, owner 2026-11-17; designed 2026-11-20).
 *
 * EVERY WORD OF THE SIGNED TEXT IS ON THE PAGE, IN ORDER. Only the
 * presentation changes: the title and order lines head a cover panel, "D1."
 * lines become numbered sections, "- " lines become marked lists, and the
 * chat messages quoted in D4 become quoted messages. The parties, amount and
 * signature counts on the cover are read off the same text and the record,
 * added beside it, never in place of it. A body that is not the DEAL
 * template's shape is printed verbatim, as before.
 *
 * Static HTML and CSS only (renderPdf runs with JavaScript off and no
 * network): system fonts, inline SVG, no <script>, no handler attributes.
 */
import type { DealAgreementView, DealState } from "./deal-agreement";
import { usdOf } from "./deal-agreement-render";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const DEAL_STATE_WORDS: Record<DealState, string> = {
  OPEN: "Waiting for signatures",
  SIGNED: "Signed by both sides",
  WITHDRAWN: "Replaced by a newer form — not in force",
};

/* ── reading the signed text's shape ───────────────────────────────────── */

type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "msg"; who: string; text: string };
type Section = { num: string; title: string; blocks: Block[] };
export type ParsedDeal = { titleLine: string; form: string; version: string; preamble: Block[]; sections: Section[] };

const TITLE = /^SPONSORX DEAL AGREEMENT — (.+) — VERSION (\d+)$/;
const HEADING = /^(D\d+[a-z]?)\. (\S.*)$/;
/** A quoted chat message in D4: two spaces, "[who, when]", the text; its later lines indented two spaces. */
const MESSAGE = /^ {2}\[([^\]]+)\] ?(.*)$/;

/** The DEAL text's shape, or null when it is not the template's (printed verbatim then). Pure. */
export function parseDealBody(body: string): ParsedDeal | null {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const titleLine = (lines[0] ?? "").trim();
  const head = TITLE.exec(titleLine);
  if (!head) return null;
  const out: ParsedDeal = { titleLine, form: head[1]!, version: head[2]!, preamble: [], sections: [] };
  let blocks: Block[] = out.preamble;
  let para: string[] = [];
  let list: string[] = [];
  let msg: Extract<Block, { kind: "msg" }> | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", text: para.join("\n") });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: "list", items: list });
    list = [];
  };
  for (const raw of lines.slice(1)) {
    const line = raw.replace(/\s+$/, "");
    const m = MESSAGE.exec(raw);
    if (m) {
      flushPara(); flushList();
      msg = { kind: "msg", who: m[1]!, text: m[2]! };
      blocks.push(msg);
      continue;
    }
    if (msg && raw.startsWith("  ")) {
      msg.text += `\n${raw.slice(2)}`;
      continue;
    }
    msg = null;
    const h = HEADING.exec(line);
    if (h) {
      flushPara(); flushList();
      const s: Section = { num: h[1]!, title: h[2]!, blocks: [] };
      out.sections.push(s);
      blocks = s.blocks;
      continue;
    }
    if (!line) { flushPara(); flushList(); continue; }
    if (line.startsWith("- ")) { flushPara(); list.push(line.slice(2)); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out;
}

/* ── the page ──────────────────────────────────────────────────────────── */

const PARTIES = /This agreement is between (.+?) \("the Sponsor"\) and (.+?) \("the Seller"\)/;
const NOTES = [/^These are the exact messages/, /^This is the amount the Sponsor pays/, /^Where the Seller is under 18/];

function blockHtml(b: Block, num: string): string {
  if (b.kind === "msg") {
    return `<figure class="msg"><figcaption>${esc(b.who)}</figcaption><blockquote>${esc(b.text)}</blockquote></figure>`;
  }
  if (b.kind === "list") {
    if (num === "D2") {
      return `<ul class="deliverables">${b.items.map((i, n) => {
        const at = i.lastIndexOf(" · ");
        const what = at < 0 ? i : i.slice(0, at);
        return `<li><span class="idx">${String(n + 1).padStart(2, "0")}</span><b>${esc(what)}</b>${at < 0 ? "" : `<span class="dates">${esc(i.slice(at + 3))}</span>`}</li>`;
      }).join("")}</ul>`;
    }
    return `<ul class="${num === "D3" ? "checks" : "points"}">${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  }
  const t = b.text;
  if (num === "D5") {
    const m = /^(\$[\d,]+\.\d{2})(\.?)([\s\S]*)$/.exec(t);
    if (m) return `<p class="amount"><span class="fig">${esc(m[1]! + m[2]!)}</span>${m[3] ? `<span class="rest">${esc(m[3])}</span>` : ""}</p>`;
  }
  if (t === "None.") return `<p class="none">${esc(t)}</p>`;
  if (/^Special term \d+/.test(t)) return `<p class="term-head">${esc(t)}</p>`;
  if (/confirms that:$/.test(t)) return `<p class="lead">${esc(t)}</p>`;
  if (NOTES.some((r) => r.test(t))) return `<p class="note">${esc(t)}</p>`;
  return `<p>${esc(t)}</p>`;
}

const sectionHtml = (s: Section) => `
<section class="term" data-section="${esc(s.num)}">
  <div class="num"><span>${esc(s.num)}</span></div>
  <div class="body"><h3>${esc(s.title)}</h3>${s.blocks.map((b) => blockHtml(b, s.num)).join("")}</div>
</section>`;

/** The seal beside the fingerprint: a ring of words, the SponsorX mark, the state. */
function seal(state: DealState): string {
  const word = state === "SIGNED" ? "SIGNED" : state === "OPEN" ? "PENDING" : "VOID";
  return `<svg class="seal" viewBox="0 0 120 120" aria-hidden="true">
  <defs><path id="ring" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"/></defs>
  <circle cx="60" cy="60" r="57" fill="none" stroke="#f97a1f" stroke-width="1.4"/>
  <circle cx="60" cy="60" r="53" fill="none" stroke="rgba(255,255,255,.18)" stroke-width=".6"/>
  <circle cx="60" cy="60" r="34" fill="none" stroke="rgba(255,255,255,.28)" stroke-width=".7" stroke-dasharray="1.5 2.5"/>
  <text font-size="7.4" font-weight="700" letter-spacing="1.6" fill="#f4f5f7" font-family="Segoe UI,Helvetica Neue,Arial,Noto Sans,sans-serif"><textPath href="#ring" textLength="280" lengthAdjust="spacing">SPONSORX · DEAL RECORD · SHA-256 FINGERPRINT ·</textPath></text>
  <text x="60" y="62" text-anchor="middle" font-size="22" font-weight="800" fill="#ffffff" font-family="Segoe UI,Helvetica Neue,Arial,Noto Sans,sans-serif">S<tspan fill="#f97a1f">X</tspan></text>
  <text x="60" y="76" text-anchor="middle" font-size="6.6" font-weight="700" letter-spacing="1.8" fill="${state === "SIGNED" ? "#22c98d" : state === "OPEN" ? "#facc15" : "#ff4d4f"}" font-family="Segoe UI,Helvetica Neue,Arial,Noto Sans,sans-serif">${word}</text>
</svg>`;
}

const CSS = `
:root{--ink:#0a0c10;--ink2:#12151d;--line:#e3e8f0;--text:#1b2230;--muted:#5d6678;--faint:#8a93a6;
  --orange:#f97a1f;--blue:#2e9bf5;--green:#16a36f;--amber:#f5b301;--red:#e5484d;--paper:#ffffff;--wash:#f5f7fb;
  --sans:"Inter","Segoe UI","Helvetica Neue",Helvetica,Arial,"Noto Sans","FreeSans",sans-serif;
  --serif:Georgia,"Noto Serif","FreeSerif","Times New Roman",serif;
  --mono:"JetBrains Mono","SF Mono",Consolas,"Noto Sans Mono","DejaVu Sans Mono","FreeMono",monospace}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--paper);color:var(--text);font:10.2pt/1.6 var(--serif)}
p{margin:0 0 7pt}

/* cover */
.cover{position:relative;overflow:hidden;border-radius:16px;background:var(--ink);color:#f4f5f7;padding:24px 30px 26px;
  background-image:
    radial-gradient(520px 260px at 100% 0%,rgba(249,122,31,.38),transparent 70%),
    radial-gradient(460px 260px at 0% 100%,rgba(46,155,245,.30),transparent 70%),
    linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);
  background-size:auto,auto,22px 22px,22px 22px}
.cover .ghost{position:absolute;right:-18px;top:-62px;font:900 230pt/1 var(--sans);letter-spacing:-.06em;color:transparent;
  -webkit-text-stroke:1.2px rgba(255,255,255,.09)}
.top{position:relative;display:flex;justify-content:space-between;align-items:center;font:600 7.6pt/1 var(--sans);letter-spacing:.22em;text-transform:uppercase;color:rgba(244,245,247,.66)}
.wordmark{font:900 12pt/1 var(--sans);letter-spacing:.02em;color:#fff;text-transform:none}
.wordmark i{font-style:normal;color:var(--orange)}
.kicker{position:relative;margin:30px 0 8px;font:500 7.4pt/1.4 var(--mono);letter-spacing:.08em;color:rgba(244,245,247,.55)}
h1{position:relative;margin:0;font:800 40pt/.98 var(--sans);letter-spacing:-.035em;color:#fff}
h1 em{display:block;font:italic 400 36pt/1.05 var(--serif);letter-spacing:-.02em;color:var(--orange)}
.meta{position:relative;display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:16px;font:600 8pt/1 var(--sans)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#e9ecf2}
.chip.state{border-color:transparent;color:#0a0c10}
.chip.state::before{content:"";width:6px;height:6px;border-radius:50%;background:#0a0c10;opacity:.7}
.state-OPEN{background:var(--amber)}.state-SIGNED{background:#22c98d}.state-WITHDRAWN{background:var(--red);color:#fff!important}
.parties{position:relative;display:grid;grid-template-columns:1fr 34px 1fr;align-items:stretch;margin-top:22px}
.party{border-radius:12px;padding:13px 15px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.12)}
.party.sponsor{box-shadow:inset 3px 0 0 var(--orange)}.party.seller{box-shadow:inset 3px 0 0 var(--blue)}
.party .role{font:700 6.8pt/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:rgba(244,245,247,.55)}
.party.sponsor .role{color:#ffb27a}.party.seller .role{color:#8cc8fa}
.party .name{margin-top:7px;font:800 15pt/1.15 var(--sans);letter-spacing:-.015em;color:#fff}
.party .sub{margin-top:4px;font:400 8pt/1.35 var(--sans);color:rgba(244,245,247,.62)}
.link{display:flex;align-items:center;justify-content:center}
.link span{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--ink2);border:1px solid rgba(255,255,255,.2);font:700 10pt/1 var(--sans);color:#fff}
.figures{position:relative;display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:0;margin-top:14px;border-top:1px solid rgba(255,255,255,.12);padding-top:14px}
.figures div{padding:0 14px;border-left:1px solid rgba(255,255,255,.12)}.figures div:first-child{padding-left:0;border-left:0}
.figures dt{font:700 6.6pt/1 var(--sans);letter-spacing:.2em;text-transform:uppercase;color:rgba(244,245,247,.5)}
.figures dd{margin:7px 0 0;font:800 17pt/1 var(--sans);letter-spacing:-.02em;color:#fff;font-variant-numeric:tabular-nums}
.figures dd small{font:600 8pt/1 var(--sans);color:rgba(244,245,247,.55);letter-spacing:0}
.figures .money dd{font-size:24pt;color:#fff}
.figures .money dd b{color:var(--orange)}

/* terms */
.rule{display:flex;align-items:center;gap:12px;margin:26px 0 10px;font:800 7.4pt/1 var(--sans);letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.rule::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--line),transparent)}
.rule b{color:var(--orange)}
.term{display:grid;grid-template-columns:20mm 1fr;gap:0 4mm;padding:13px 0 9px;border-top:1px solid var(--line)}
.term h3,.lead,.term-head{break-after:avoid}
.term p,.term li,.msg{break-inside:avoid}
.term:first-of-type{border-top:0}
.term .num span{display:inline-block;font:800 17pt/1 var(--sans);letter-spacing:-.03em;color:var(--ink)}
.term .num span::after{content:"";display:block;width:16px;height:3px;margin-top:6px;border-radius:2px;background:var(--orange)}
.term h3{margin:1px 0 7px;font:750 12pt/1.25 var(--sans);font-weight:800;letter-spacing:-.01em;color:var(--ink)}
.term p{color:#2a3140}
.lead{margin-top:8px;font:700 8.8pt/1.4 var(--sans);color:var(--ink)!important}
.note{font:italic 8.8pt/1.5 var(--serif);color:var(--muted)!important;padding-left:10px;border-left:2px solid var(--line)}
.none{display:inline-block;padding:3px 10px;border-radius:999px;background:var(--wash);border:1px solid var(--line);font:600 8.4pt/1.4 var(--sans);color:var(--muted)!important}
ul{list-style:none;margin:0 0 8pt;padding:0}
.points li{position:relative;padding-left:16px;margin:0 0 4pt}
.points li::before{content:"";position:absolute;left:2px;top:.62em;width:6px;height:6px;border-radius:1.5px;background:var(--orange);transform:rotate(45deg)}
.checks li{position:relative;padding:6px 10px 6px 30px;margin:0 0 5px;border-radius:9px;background:var(--wash);border:1px solid #edf1f7;line-height:1.45}
.checks li::before{content:"";position:absolute;left:9px;top:8px;width:13px;height:13px;border-radius:50%;background:var(--green)}
.checks li::after{content:"";position:absolute;left:13.3px;top:10.6px;width:3.2px;height:6px;border:solid #fff;border-width:0 1.6px 1.6px 0;transform:rotate(45deg)}
.deliverables li{display:flex;align-items:center;gap:12px;padding:10px 14px;margin:0 0 6px;border-radius:10px;background:var(--ink);color:#fff;font:600 10pt/1.3 var(--sans)}
.deliverables .idx{font:700 7.4pt/1 var(--mono);color:var(--orange)}
.deliverables b{flex:1;font-weight:700}
.deliverables .dates{font:500 8pt/1 var(--mono);color:rgba(244,245,247,.7);padding:5px 8px;border-radius:6px;background:rgba(255,255,255,.08)}
.amount{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:2px 0 8px}
.amount .fig{font:800 30pt/1 var(--sans);letter-spacing:-.04em;color:var(--ink);background:linear-gradient(transparent 62%,rgba(249,122,31,.28) 62%);padding:0 2px}
.amount .rest{font:400 10pt/1.5 var(--serif);color:var(--muted)}
.term-head{margin-top:6px;font:700 8.8pt/1.4 var(--sans);color:var(--ink)!important}
.msg{margin:0 0 7px;padding:9px 12px;border-radius:4px 12px 12px 12px;background:var(--wash);border:1px solid var(--line)}
.msg figcaption{font:700 6.8pt/1 var(--mono);letter-spacing:.06em;color:var(--blue);text-transform:uppercase;margin-bottom:5px}
.msg blockquote{margin:0;white-space:pre-wrap;font:italic 9.6pt/1.5 var(--serif);color:var(--text)}
.verbatim{white-space:pre-wrap;font:10.2pt/1.6 var(--serif)}

/* signatures */
.sign{break-inside:avoid}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{position:relative;border-radius:14px;padding:15px 16px 14px;border:1.5px dashed #c9d2e0;background:#fff}
.card.done{border:1.5px solid rgba(22,163,111,.45);background:linear-gradient(180deg,rgba(34,201,141,.08),#fff 70%)}
.card .role{font:800 6.8pt/1 var(--sans);letter-spacing:.2em;text-transform:uppercase}
.card.sponsor .role{color:#c75a0c}.card.seller .role{color:#1869b2}
.card .who{margin:8px 0 18px;font:800 12.5pt/1.2 var(--sans);letter-spacing:-.01em;color:var(--ink)}
.card .line{height:24px;border-bottom:1px solid #b9c3d3;margin-bottom:7px;font:italic 15pt/24px var(--serif);color:var(--ink)}
.card .status{font:600 8pt/1.4 var(--sans);color:var(--muted)}
.card.done .status{color:var(--green)}
.badge{position:absolute;right:13px;top:12px;padding:4px 8px;border-radius:999px;font:800 6.6pt/1 var(--sans);letter-spacing:.14em;text-transform:uppercase}
.card.done .badge{background:var(--green);color:#fff}.card:not(.done) .badge{background:#fff4d6;color:#8a5a00}

.record{display:grid;grid-template-columns:30mm 1fr;gap:18px;align-items:center;margin-top:14px;padding:18px 20px;border-radius:16px;background:var(--ink);color:#f4f5f7;
  background-image:radial-gradient(360px 160px at 100% 100%,rgba(249,122,31,.22),transparent 70%)}
.seal{width:30mm;height:30mm;display:block}
.record dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font:500 8pt/1.4 var(--sans)}
.record dt{color:rgba(244,245,247,.5);font-weight:700;letter-spacing:.14em;text-transform:uppercase;font-size:6.6pt;padding-top:1.5px}
.record dd{margin:0;color:#f4f5f7}
.record .hash{font:500 7.6pt/1.5 var(--mono);color:#ffb27a;word-break:break-all}
.record .full{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.12)}
.record .full p{margin:0 0 2px;font:500 7.8pt/1.5 var(--sans);color:rgba(244,245,247,.78)}

.watermark{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9}
.watermark span{transform:rotate(-28deg);font:900 76pt/1 var(--sans);letter-spacing:.04em;color:rgba(229,72,77,.13);border:6px solid rgba(229,72,77,.13);padding:6px 26px;border-radius:18px}
`;

/** The PDF's page: the exact signed text, laid out, then who signed and when, and its fingerprint. Pure. */
export function dealAgreementHtml(v: DealAgreementView): string {
  const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : null);
  const sponsorAt = when(v.sponsorSignedAt);
  const sellerAt = when(v.sellerSignedAt);
  const status = `Status: ${DEAL_STATE_WORDS[v.state]}`;
  const sponsorLine = sponsorAt ? `Signed for the Sponsor on ${sponsorAt}` : "Not yet signed by the Sponsor";
  const sellerLine = sellerAt ? `Signed ${v.signedByGuardian ? "by the Seller's parent or guardian" : "by the Seller"} on ${sellerAt}` : "Not yet signed by the Seller";
  const amountLine = `Amount: ${usdOf(v.amountCents)}`;
  const hashLine = `Fingerprint (SHA-256 of the text above): ${v.bodyHash}`;

  const doc = parseDealBody(v.body);
  const d1 = doc?.sections.find((s) => s.num === "D1")?.blocks.find((b) => b.kind === "p");
  const parties = d1 && d1.kind === "p" ? PARTIES.exec(d1.text) : null;
  const sponsorName = parties?.[1] ?? "The Sponsor";
  const [sellerName, sellerRep] = (parties?.[2] ?? "The Seller").split(/, (?=represented by )/);
  const deliverables = doc?.sections.find((s) => s.num === "D2")?.blocks.reduce((n, b) => n + (b.kind === "list" ? b.items.length : 0), 0) ?? 0;
  const signedCount = (sponsorAt ? 1 : 0) + (sellerAt ? 1 : 0);
  const [dollars, cents] = usdOf(v.amountCents).split(".");
  const metaLine = doc?.preamble.find((b) => b.kind === "p" && b.text.startsWith("Order "));
  const preamble = doc?.preamble.filter((b) => b !== metaLine) ?? [];

  const cover = `
<header class="cover">
  <div class="ghost" aria-hidden="true">SX</div>
  <div class="top"><span class="wordmark">Sponsor<i>X</i></span><span>Deal agreement · v${esc(String(v.version))}</span></div>
  <div class="kicker">${esc(doc?.titleLine ?? `SPONSORX DEAL AGREEMENT — VERSION ${v.version}`)}</div>
  <h1>Deal agreement<em>for ${esc((doc?.form ?? "the deal").toLowerCase().replace(/_/g, " "))}.</em></h1>
  <div class="meta">
    <span class="chip">${esc(metaLine && metaLine.kind === "p" ? metaLine.text : `Order ${v.orderRef}`)}</span>
    <span class="chip state state-${v.state}">${esc(DEAL_STATE_WORDS[v.state])}</span>
  </div>
  <div class="parties">
    <div class="party sponsor"><div class="role">The Sponsor</div><div class="name">${esc(sponsorName)}</div></div>
    <div class="link"><span>×</span></div>
    <div class="party seller"><div class="role">The Seller</div><div class="name">${esc(sellerName ?? "The Seller")}</div>${sellerRep ? `<div class="sub">${esc(sellerRep)}</div>` : ""}</div>
  </div>
  <dl class="figures">
    <div class="money"><dt>Amount</dt><dd>${esc(dollars!)}<b>.${esc(cents ?? "00")}</b></dd></div>
    <div><dt>Deliverables</dt><dd>${deliverables}</dd></div>
    <div><dt>Signatures</dt><dd>${signedCount}<small> / 2</small></dd></div>
    <div><dt>Order</dt><dd style="font-size:11pt;padding-top:5px">${esc(v.orderRef)}</dd></div>
  </dl>
</header>`;

  const terms = doc
    ? `<div class="rule"><b>01</b> The terms</div>${preamble.map((b) => blockHtml(b, "")).join("")}${doc.sections.map(sectionHtml).join("")}`
    : `<div class="rule"><b>01</b> The terms</div><div class="verbatim">${esc(v.body)}</div>`;

  const card = (side: "sponsor" | "seller", role: string, who: string, at: string | null, line: string) => `
  <div class="card ${side}${at ? " done" : ""}">
    <span class="badge">${at ? "Signed" : "Awaiting"}</span>
    <div class="role">${role}</div>
    <div class="who">${esc(who)}</div>
    <div class="line">${at ? esc(who) : ""}</div>
    <div class="status">${esc(line)}</div>
  </div>`;

  const signatures = `
<section class="sign">
  <div class="rule"><b>02</b> Signatures</div>
  <div class="cards">
    ${card("sponsor", "For the Sponsor", sponsorName, sponsorAt, sponsorLine)}
    ${card("seller", v.signedByGuardian ? "For the Seller · by parent or guardian" : "For the Seller", sellerName ?? "The Seller", sellerAt, sellerLine)}
  </div>
  <div class="record">
    ${seal(v.state)}
    <div>
      <dl>
        <dt>Status</dt><dd>${esc(DEAL_STATE_WORDS[v.state])}</dd>
        <dt>Amount</dt><dd>${esc(usdOf(v.amountCents))}</dd>
        <dt>Order</dt><dd>${esc(v.orderRef)} · version ${esc(String(v.version))}</dd>
        <dt>SHA-256</dt><dd class="hash">${esc(v.bodyHash)}</dd>
      </dl>
      <div class="full">${[status, sponsorLine, sellerLine, amountLine, hashLine].map((l) => `<p>${esc(l)}</p>`).join("")}</div>
    </div>
  </div>
</section>`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SponsorX deal agreement ${esc(v.orderRef)}</title>
<style>${CSS}</style></head>
<body>${v.state === "WITHDRAWN" ? `<div class="watermark" aria-hidden="true"><span>NOT IN FORCE</span></div>` : ""}
${cover}
${terms}
${signatures}
</body></html>`;
}

/** The running footer on every page: what this is, a short fingerprint, the page count. */
export function dealAgreementFooter(v: DealAgreementView): string {
  const hash = v.bodyHash.replace(/^sha256:/, "");
  return `<div style="width:100%;padding:0 12mm;display:flex;justify-content:space-between;align-items:center;font:600 7px Segoe UI,Helvetica Neue,Arial,Noto Sans,sans-serif;letter-spacing:.06em;color:#8a93a6">
<span><b style="color:#0a0c10">Sponsor<span style="color:#f97a1f">X</span></b> &nbsp;·&nbsp; Deal agreement ${esc(v.orderRef)} &nbsp;·&nbsp; v${esc(String(v.version))}</span>
<span style="font-family:Consolas,Noto Sans Mono,monospace">sha256 ${esc(hash.slice(0, 8))}…${esc(hash.slice(-8))}</span>
<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
}

/** Margins leave room for the footer; the cover panel sits inside them. */
export const DEAL_PDF_MARGIN = { top: "12mm", right: "12mm", bottom: "16mm", left: "12mm" } as const;
