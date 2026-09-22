/* SponsorX NEXT — Integration Specification → .docx
 * Renders documentation/SponsorX-NEXT-Integration-Spec.md (the source of record)
 * so the two can never drift. Print-light palette: the app is dark-themed, a
 * printed spec is not. */
const fs = require("fs");
const D = require("docx");
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageBreak, Footer, Header, PageNumber, LevelFormat,
} = D;

const BLUE = "1F6FB2", BLUE_LT = "2E9BF5", ORANGE = "B4500C";
const INK = "16181D", MUTED = "5C6373", RULE = "D5D9E2";
const HEADFILL = "EEF4FB", CODEFILL = "F4F6F9";
const PAGE_W = 12240, PAGE_H = 15840, MARGIN = 1440;
const CONTENT = PAGE_W - MARGIN * 2;

const src = fs.readFileSync("spec.md", "utf8").split("\n");

/* ── inline: recursive, so **bold with `code`** works ──────────────────── */
function inline(text, base = {}) {
  const runs = [];
  const re = /(\*\*[\s\S]+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]*\)|(?<![*\w])\*(?!\s)[^*]+?\*(?!\w))/g;
  let last = 0, m;
  const lit = (t) => { if (t) runs.push(new TextRun({ text: t, ...base })); };
  while ((m = re.exec(text))) {
    lit(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) runs.push(...inline(tok.slice(2, -2), { ...base, bold: true }));
    else if (tok.startsWith("`"))
      runs.push(new TextRun({ ...base, text: tok.slice(1, -1), font: "Consolas",
        size: (base.size || 21) - 3, color: ORANGE }));
    else if (tok.startsWith("["))
      runs.push(new TextRun({ ...base, text: tok.slice(1, tok.indexOf("]")), color: BLUE }));
    else runs.push(...inline(tok.slice(1, -1), { ...base, italics: true }));
    last = m.index + tok.length;
  }
  lit(text.slice(last));
  return runs.length ? runs : [new TextRun({ text: "", ...base })];
}

/* ── pass 1: blocks (folds continuation lines into their owner) ────────── */
const STARTS = /^(#{1,6} |```|\||>|---\s*$|\s*[-*] |\d+\. )/;
const blocks = [];
for (let i = 0; i < src.length; i++) {
  const l = src[i];
  if (!l.trim()) continue;

  if (l.startsWith("```")) {
    const code = []; i++;
    while (i < src.length && !src[i].startsWith("```")) code.push(src[i++]);
    blocks.push({ t: "code", lines: code });
  } else if (l.startsWith("|")) {
    const rows = [];
    while (i < src.length && src[i].startsWith("|")) rows.push(src[i++]);
    i--; blocks.push({ t: "table", rows });
  } else if (l.startsWith(">")) {
    const q = [];
    while (i < src.length && src[i].startsWith(">")) q.push(src[i++].replace(/^>\s?/, ""));
    i--; blocks.push({ t: "quote", lines: q });
  } else if (/^#{1,6} /.test(l)) {
    blocks.push({ t: "h", depth: l.match(/^#+/)[0].length, text: l.replace(/^#+ /, "").trim() });
  } else if (/^---\s*$/.test(l)) {
    blocks.push({ t: "hr" });
  } else {
    let t, text, indent = 0;
    const bul = l.match(/^(\s*)[-*] (.*)$/), num = l.match(/^(\s*)\d+\. (.*)$/);
    if (bul) { t = "bul"; indent = bul[1].length >= 2 ? 1 : 0; text = bul[2]; }
    else if (num) { t = "num"; text = num[2]; }
    else { t = "p"; text = l.trim(); }
    // fold wrapped/continuation lines
    while (i + 1 < src.length && src[i + 1].trim() && !STARTS.test(src[i + 1]))
      text += " " + src[++i].trim();
    blocks.push({ t, text, indent });
  }
}

/* ── pass 2: render ────────────────────────────────────────────────────── */
const body = [];
const P = (o) => body.push(new Paragraph(o));

function table(rows) {
  const cells = rows.map((r) => r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
  const head = cells[0], data = cells.slice(2), n = head.length;
  const base = Math.floor(CONTENT / n);
  const w = Array.from({ length: n }, (_, k) => (k === n - 1 ? CONTENT - base * (n - 1) : base));
  const row = (vals, isHead) => new TableRow({
    tableHeader: !!isHead, cantSplit: true,
    children: vals.map((v, k) => new TableCell({
      width: { size: w[k], type: WidthType.DXA },
      shading: isHead ? { type: ShadingType.CLEAR, fill: HEADFILL, color: "auto" } : undefined,
      margins: { top: 90, bottom: 90, left: 130, right: 130 },
      children: [new Paragraph({ spacing: { before: 0, after: 0, line: 252 },
        children: inline(v, { size: 18, bold: !!isHead, color: isHead ? BLUE : INK }) })],
    })),
  });
  const b = (sz, col) => ({ style: BorderStyle.SINGLE, size: sz, color: col });
  body.push(new Table({
    columnWidths: w, width: { size: CONTENT, type: WidthType.DXA },
    borders: { top: b(4, RULE), bottom: b(4, RULE), left: b(4, RULE), right: b(4, RULE),
               insideHorizontal: b(2, RULE), insideVertical: b(2, RULE) },
    rows: [row(head, true), ...data.map((d) => row(d))],
  }));
  P({ spacing: { after: 200 }, children: [] });
}

const firstSection = blocks.findIndex((x) => x.t === "h" && x.depth === 2);
for (const b of blocks.slice(firstSection)) {   // front matter lives on the cover
  switch (b.t) {
    case "h":
      if (b.depth === 1) break;                       // title → cover
      if (b.depth === 2)
        P({ heading: HeadingLevel.HEADING_1, spacing: { before: 380, after: 170 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE_LT } },
            children: inline(b.text, { size: 27, bold: true, color: BLUE }) });
      else
        P({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 },
            children: inline(b.text, { size: 23, bold: true, color: INK }) });
      break;
    case "p":
      P({ spacing: { before: 0, after: 150 }, children: inline(b.text, { size: 21, color: INK }) });
      break;
    case "bul":
      P({ numbering: { reference: "bul", level: b.indent }, spacing: { before: 50, after: 50 },
          children: inline(b.text, { size: 21, color: INK }) });
      break;
    case "num":
      P({ numbering: { reference: "num", level: 0 }, spacing: { before: 50, after: 50 },
          children: inline(b.text, { size: 21, color: INK }) });
      break;
    case "code":
      b.lines.forEach((cl, k) => P({
        spacing: { before: k === 0 ? 130 : 0, after: k === b.lines.length - 1 ? 190 : 0, line: 240 },
        shading: { type: ShadingType.CLEAR, fill: CODEFILL, color: "auto" },
        indent: { left: 260, right: 260 },
        children: [new TextRun({ text: cl || " ", font: "Consolas", size: 16, color: INK })],
      }));
      break;
    case "quote": {
      const joined = [];
      let cur = "";
      for (const q of b.lines) {
        if (!q.trim()) { if (cur) joined.push(cur); cur = ""; }
        else cur = cur ? cur + " " + q.trim() : q.trim();
      }
      if (cur) joined.push(cur);
      joined.forEach((q, k) => {
        const isH = /^#{1,6} /.test(q);
        P({ spacing: { before: k === 0 ? 150 : 70, after: k === joined.length - 1 ? 190 : 70 },
            indent: { left: 400 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: ORANGE, space: 14 } },
            children: inline(q.replace(/^#+ /, ""),
              { size: isH ? 21 : 20, bold: isH, color: isH ? INK : MUTED }) });
      });
      break;
    }
    case "table": table(b.rows); break;
    case "hr":
      P({ spacing: { before: 170, after: 170 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } } });
      break;
  }
}

/* ── cover + static contents ───────────────────────────────────────────── */
const meta = blocks.find((b) => b.t === "p" && b.text.includes("P0-PMO-14"));
const lede = blocks.filter((b) => b.t === "p").slice(1, 3);

const front = [
  new Paragraph({ spacing: { before: 2500, after: 0 },
    children: [new TextRun({ text: "B T G   S P O R T S   G R O U P   ·   S P O N S O R X",
      size: 17, bold: true, color: MUTED })] }),
  new Paragraph({ spacing: { before: 260, after: 0 },
    children: [new TextRun({ text: "SponsorX NEXT", size: 68, bold: true, color: BLUE })] }),
  new Paragraph({ spacing: { before: 60, after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: ORANGE } },
    children: [new TextRun({ text: "Integration Specification", size: 40, color: INK })] }),
  new Paragraph({ spacing: { before: 200, after: 260 },
    children: [new TextRun({ size: 22, color: MUTED, italics: true,
      text: "How the student-run high-school sports media programme joins the existing SponsorX platform — what already exists, what does not, and in what order it should be built." })] }),
];
if (meta) front.push(new Paragraph({ spacing: { before: 0, after: 220 },
  children: inline(meta.text, { size: 21, color: INK }) }));
lede.forEach((b) => front.push(new Paragraph({ spacing: { before: 0, after: 150 },
  children: inline(b.text, { size: 20, color: INK }) })));
front.push(new Paragraph({ spacing: { before: 1500, after: 0 },
  children: [
    new TextRun({ text: "Source of record: documentation/SponsorX-NEXT-Integration-Spec.md", size: 16, color: MUTED }),
    new TextRun({ break: 1, text: "This document is generated from it — edit the Markdown, not this file.", size: 16, color: MUTED })] }));
front.push(new Paragraph({ children: [new PageBreak()] }));

front.push(new Paragraph({ spacing: { after: 220 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE_LT } },
  children: [new TextRun({ text: "Contents", size: 27, bold: true, color: BLUE })] }));
for (const b of blocks) {
  if (b.t !== "h") continue;
  if (b.depth === 2)
    front.push(new Paragraph({ spacing: { before: 110, after: 0 },
      children: inline(b.text, { size: 21, bold: true, color: INK }) }));
  else if (b.depth === 3)
    front.push(new Paragraph({ spacing: { before: 40, after: 0 }, indent: { left: 340 },
      children: inline(b.text, { size: 19, color: MUTED }) }));
}
front.push(new Paragraph({ children: [new PageBreak()] }));

/* ── document ──────────────────────────────────────────────────────────── */
const page = { size: { width: PAGE_W, height: PAGE_H },
               margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } };
const doc = new Document({
  creator: "BTG Sports Group — SponsorX",
  title: "SponsorX NEXT — Integration Specification",
  description: "P0-PMO-14 · integration specification for the SponsorX NEXT programme",
  styles: { default: { document: { run: { font: "Calibri", size: 21, color: INK },
                                   paragraph: { spacing: { line: 276 } } } } },
  numbering: { config: [
    { reference: "bul", levels: [
      { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 420, hanging: 220 } } } },
      { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 800, hanging: 220 } } } }] },
    { reference: "num", levels: [
      { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 420, hanging: 220 } } } }] },
  ] },
  sections: [
    { properties: { page }, children: front },
    { properties: { page },
      headers: { default: new Header({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT, spacing: { after: 140 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE } },
        children: [new TextRun({ text: "SponsorX NEXT — Integration Specification", size: 15, color: MUTED })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "P0-PMO-14   ·   ", size: 15, color: MUTED }),
                   new TextRun({ children: [PageNumber.CURRENT], size: 15, color: MUTED })] })] }) },
      children: body },
  ],
});

Packer.toBuffer(doc).then((b) => {
  fs.writeFileSync("SponsorX-NEXT-Integration-Spec.docx", b);
  console.log("wrote .docx", b.length, "bytes ·", blocks.length, "blocks");
});
