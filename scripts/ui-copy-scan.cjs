#!/usr/bin/env node
// POL-FE-37..40 — the clean pass. Lists text people SEE on screen (JSX text, copy attributes, strings
// inside JSX, copy-like object keys; code comments excluded) that reads as a developer note or is
// likely out of date: section signs, task IDs, phase/stage talk, internal words, "not wired".
//
//   node scripts/ui-copy-scan.cjs                  # frontend/src, strong signals only
//   node scripts/ui-copy-scan.cjs --all            # also code-looking strings (noisier)
//   node scripts/ui-copy-scan.cjs app/(app)/athlete  # one folder under frontend/src
//
// Exit code 1 when anything is found, so it can gate a PR once the pass is done.
const fs = require('fs'), path = require('path');
const ts = require('typescript');
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const base = path.join(__dirname, '..', 'frontend', 'src');
const sub = args.find((a) => !a.startsWith('--'));
const root = sub ? path.join(base, sub) : base;
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const s = fs.statSync(p);
  if (s.isDirectory()) walk(p); else if (/\.(tsx|ts)$/.test(f) && !/\.(test|spec)\./.test(f) && !/\.d\.ts$/.test(f)) files.push(p); } })(root);
const COPY_ATTR = /^(placeholder|title|label|aria-label|alt|description|hint|note|summary|subtitle|heading|helper|caption|empty|emptyText|tooltip)$/i;
const COPY_KEY = /^(label|title|hint|note|notes|description|desc|summary|subtitle|heading|body|text|message|msg|caption|empty|blurb|detail|details|help|helper|lede|intro|copy|line|sub|why|explain|reason|tooltip|cta|banner|warning|info)$/i;
const FLAGS = [
  ['section-ref', /§\s?\d/],
  ['task-id', /\b(?:P\d{1,2}|[1-9]S\d{1,2})-(?:BE|FE|ART|OPS|PMO|LEG|SEC|DATA|INT|QA|DOC)-\d{1,3}\b|\bPOL-(?:BE|FE)-\d+\b|\bQA-\d{2}\b/],
  ['gate/phase', /\b(?:A-gate|gate one|B\d gate|Phase ?[1-6]\b|Stage ?\d\b|Addendum [A-Z]\b|blueprint)/i],
  ['env/infra', /\b(?:Railway|env(?:ironment)? var|NODE_ENV|staging|sandbox|stand-?in|standin|fixture|seed(?:ed)? data|mock(?:ed)?|stub(?:bed)?|demo data|sample data|simulated|placeholder|TODO|FIXME|lorem|this environment|localhost|dev only)\b/i],
  ['not-built', /\b(?:not (?:yet )?built|not wired|until .{0,40}(?:built|wired|ships|lands)|ships later|coming in (?:Phase|Stage)|later phase|when .{0,20}lands|blocked on|awaiting (?:the )?(?:policy|decision|counsel)|pending (?:policy|decision|counsel))/i],
  ['code-ish', /\b(?:[a-z]+[A-Z][a-zA-Z]+Id\b|GET \/|POST \/|PUT \/|\/api\/v1|`[A-Z_]{4,}`|[A-Z]{3,}_[A-Z_]{3,})/],
];
const out = [];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (!/[<"'`]/.test(src)) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const seen = new Set();
  const add = (node, text, kind) => {
    text = text.replace(/\s+/g, ' ').trim(); if (text.length < 3) return;
    const hits = FLAGS.filter(([, re]) => re.test(text)).map(([n]) => n); if (!hits.length || (!ALL && hits.every((h) => h === 'code-ish'))) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    const key = line + text; if (seen.has(key)) return; seen.add(key);
    out.push({ file: path.relative(base, f), line, kind, hits, text: text.slice(0, 260) });
  };
  const inJsx = (n) => { for (let p = n.parent; p; p = p.parent) { if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p) || ts.isJsxFragment(p)) return true; if (ts.isFunctionLike(p) && !ts.isArrowFunction(p)) return false; } return false; };
  const visit = (n) => {
    if (ts.isJsxText(n)) add(n, n.getText(), 'jsx');
    else if (ts.isJsxAttribute(n) && n.initializer && ts.isStringLiteral(n.initializer) && COPY_ATTR.test(n.name.getText())) add(n, n.initializer.text, 'attr:' + n.name.getText());
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.parent) {
      const p = n.parent;
      if (ts.isPropertyAssignment(p) && p.initializer === n && COPY_KEY.test(p.name.getText().replace(/['"]/g, ''))) add(n, n.text, 'key:' + p.name.getText());
      else if (inJsx(n) && !ts.isJsxAttribute(p) && !ts.isImportDeclaration(p) && /\s/.test(n.text) && !/^[\w\s:/\-\[\]().#%,!&>]+$/.test(n.text) || (inJsx(n) && /[§]/.test(n.text))) add(n, n.text, 'expr');
    } else if (ts.isTemplateExpression(n) && inJsx(n)) add(n, n.getText().slice(1, -1), 'tmpl');
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
let last = '';
for (const o of out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  if (o.file !== last) { console.log('\n' + o.file); last = o.file; }
  console.log(`  ${o.line}  [${o.hits.join(', ')}]  ${o.text.slice(0, 160)}`);
}
console.log(`\n${out.length} line(s) in ${new Set(out.map((o) => o.file)).size} file(s)`);
process.exit(out.length ? 1 : 0);
