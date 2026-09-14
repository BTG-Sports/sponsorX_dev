<!-- converted from SponsorX-Stage1-QA-Checklist.docx -->

SponsorX — Stage 1 QA Test Checklist
P1-QA-01 · §39 loop walk      P1-QA-02 · Accessibility      P1-QA-03 · Responsive
Checkbox legend:  ☑ executed & passed   ☒ failed   ☐ not executed. Statuses below reflect the final consolidated run; eleven product defects (D-01…D-11) were found by these audits, fixed on-branch, and re-verified in this run.
1 · P1-QA-01 — §39 business-loop walk (acceptance: all 11 steps representable and rendered; every gap fixed or filed)
Gaps fixed under this task (defects D-01…D-03): the two athlete-side Decline buttons and the default-case Upload-proof button rendered live but silently unwired — now annotated like every admin control (commit b07267d). Observation (not filed): sponsors have no brief-status surface after 'Add to brief' — by design in the §13 managed model.
2 · P1-QA-03 — Responsive audit (acceptance: no horizontal scroll at 360px; portal navigation usable on phone)
Defects fixed under this task (D-04…D-07, commit 2154c35): four routes overflowed 360 (worst: /admin/campaigns/new at 624px). One shared root cause — a grid whose minmax(0,…) column exists only at a breakpoint leaves the implicit mobile column free to adopt content min-content; overflow-x-auto does not stop that propagation during intrinsic sizing. Fix: min-w-0 on the grid's direct children.
3 · P1-QA-02 — Accessibility audit (acceptance: AA contrast both themes; keyboard navigation; redeem page works without JS)
Defects fixed under this task (D-08…D-11, commit 76df208): dark text-faint 3.05:1 → #7e88a0 (5.14); light text-faint 2.54:1 → #52708f (5.16); white-on-primary CTAs 2.95:1 in dark → themed --sx-cta-ink (dark ink 6.64, light white 5.67) swept across ~27 sites; light accent-soft 2.68:1 → #9c4507. Gradient contexts verified by composite math: band text ≥12:1 at the worst 20%-alpha edge; gradient headlines are large-text with endpoints 6.19/8.18.
4 · Defect log (found by these audits; all fixed on-branch and re-verified)
5 · Test-harness anomalies — read before any regression re-run
6 · Residual risks & sign-off
Residual risks: contrast is enforced at token level (re-run the checker when pages are added); text-muted at 11px measures 4.25:1 at the extreme 20%-alpha edge of a from-primary/20 band — avoid muted small copy at the leftmost band edge; headless-Chrome only (Safari/Gecko and real-device touch unverified); screen-reader semantics out of scope for this task set.
| Field | Value | Field | Value |
| --- | --- | --- | --- |
| Project | SponsorX (BTG) — Phase 1, Stage 1 (UI scaffold on fixtures) | Executed on | 2026-09-12 |
| Branch / build | P1-FE-QA-PMO @ 53c2c53 (all defect fixes included) | Executed by | Claude (session QA) · Owner: HeckerCreatives |
| Environment | Next.js 16.3.4 · next dev :3000 · headless Chrome (CDP) · Node 22.17.1 · Win 11 | Overall result | PASS — 23 / 23 test cases |
| Build gates | tsc --noEmit clean · eslint 0 errors · next build green (all routes) | Detail records | SponsorX-Stage1-QA-Report.md · docs/superpowers/audits/ |
| ✓ | ID | Loop step | Screen under test | Test steps | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ☑ | A-01 | 1 · Athlete application | /join | Load page; inspect the ten §11 sections and the guardian branch; hover submit | All ten sections render; submit disabled with B1/counsel tooltip; autosave annotated | PASS | 3/3 markers |
| ☑ | A-02 | 2 · Approval | /admin/applications | Inspect queue, score snapshot, guardian gate; check terminal rows | Approve disabled for unverified-guardian minor (§4); REJECTED row terminal (no actions) | PASS | 3/3 markers; app_5/app_6 rows |
| ☑ | A-03 | 3 · NIL job / rate | /athlete | Locate rate card | SX-01…07 at the athlete's confirmed rates (only surface where they render) | PASS | 1/1 marker |
| ☑ | A-04 | 4 · Sponsor brief | /sponsor/marketplace?tab=athletes | Locate brief CTAs; hover | 'Add to brief' / 'Request a brief' present, annotated 'creates DRAFT CampaignBrief — not wired' | PASS | 1/1 marker |
| ☑ | A-05 | 5 · Matching | /admin/campaigns/new | Inspect eligible-athletes table | Rules-v1 scores and conflict flags render (§13 step 3); launch CTA annotated | PASS | 2/2 markers |
| ☑ | A-06 | 6 · Invitation | /athlete/invitations | Check all lifecycle states in the inbox | INVITED/VIEWED actionable; DECLINED and EXPIRED render distinctly, non-actionable | PASS | 3/3 markers |
| ☑ | A-07 | 7 · Campaign Order | /athlete/orders/inv_1 | Inspect terms, deliverable plan, agreement, accept rail | Terms + clauses render; acceptance blocked with §37/guide-§08 tooltip | PASS | 2/2 markers |
| ☑ | A-08 | 7b · Declined order (terminal) | /athlete/orders/inv_5 | Load a declined order | 'Order status' panel with decline reason; no accept card; back-link | PASS | 2/2 markers |
| ☑ | A-09 | 8 · Deliverable review | /admin/approvals | Inspect review queue and actions | Versioned items; Approve / Request-revision annotated (not wired) | PASS | 2/2 markers |
| ☑ | A-10 | 9 · Tracking / under-delivery | /admin/campaigns/c3 | Load the under-delivering campaign | 11/22 shortfall notice; roster flags 'Under-delivering' + declined 'Replacement needed' | PASS | 2/2 markers |
| ☑ | A-11 | 10 · Earnings | /athlete/earnings | Check §21 states incl. HELD; cross-check /admin/finance | HELD bucket with reason; same held order/amount on both surfaces | PASS | 2/2 markers |
| ☑ | A-12 | 11 · Sponsor report | /sponsor/campaigns/c1/report | Inspect gauge, money story, sourcing footnote | ROI gauge; invested/attributed/media value with provenance; §16·§22 footnote | PASS | case-insensitive retest (H-01) |
| ✓ | ID | Test case | Test steps | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| ☑ | B-01 | Page width at 360×800 — every route | Mobile emulation 360×800; measure max(documentElement, body).scrollWidth on all 30 routes incl. marketplace tabs, ?demo=minor, both campaign details | scrollWidth = 360 on every route (compare to literal 360 — emulation expands the viewport around overflow, see H-02) | PASS | 30/30 routes at exactly 360; fixes D-04…D-07 verified |
| ☑ | B-02 | Phone nav — athlete portal | Open drawer via 'Open navigation'; count visible links; press Escape; assert aria-expanded after ≥1s (exit animation, H-03) | Drawer opens with full nav; Escape closes (aria-expanded=false, 0 visible drawer links) | PASS | 6 links; closed |
| ☑ | B-03 | Phone nav — sponsor portal | same | same | PASS | 5 links; closed |
| ☑ | B-04 | Phone nav — property portal | same | same | PASS | 3 links; closed |
| ☑ | B-05 | Phone nav — admin portal | same | same | PASS | 10 links; closed |
| ✓ | ID | Test case | Test steps | Expected result | Status | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| ☑ | C-01 | WCAG AA contrast — dark theme | Walk every element with a direct text node on 10 pages; composite effective background from the ancestor chain (alpha-aware); thresholds 4.5:1 normal / 3:1 large | 0 elements below AA | PASS | 853 nodes, 0 fails |
| ☑ | C-02 | WCAG AA contrast — light theme | Same walk; theme applied PRE-PAINT via localStorage('sx-theme') + reload — never flipped mid-page (H-04) | 0 elements below AA | PASS | 853 nodes, 0 fails |
| ☑ | C-03 | Focus visibility | Dispatch a real Tab keypress (CDP Input); inspect document.activeElement | :focus-visible matches; visible outline (UA auto ring; Button adds focus-visible:ring-2) | PASS | {fv:true, outline:auto} |
| ☑ | C-04 | Focus-order semantics | Scan 5 pages for positive tabindex and click-only div/span handlers | 0 offenders | PASS | 0 across /athlete /sponsor /admin / /join |
| ☑ | C-05 | User-menu keyboard | Open the top-bar user menu; press Escape | Menu closes | PASS | closed |
| ☑ | C-06 | No-JS fan redeem | Disable script execution (CDP); load /r/demo-token | Full reward copy, all four funnel steps and the token render server-side | PASS | 502 chars; fan reward + steps + token |
| ID | Sev. | Defect | Root cause | Fix / commit |
| --- | --- | --- | --- | --- |
| D-01 | Minor | /athlete/invitations Decline silently unwired | Missing annotation on athlete-side CTA | Tooltip added · b07267d |
| D-02 | Minor | /athlete dashboard Decline — same | same | b07267d |
| D-03 | Minor | /athlete Upload proof — tooltip only in minor case | Conditional title fell through to none | b07267d |
| D-04 | Major | /athletes/[slug] 415px wide at 360 | Implicit mobile grid column adopts min-content (minmax(0,…) only at lg:) | min-w-0 on grid children · 2154c35 |
| D-05 | Major | ROI report 395px wide at 360 | Same pattern at xl: | 2154c35 |
| D-06 | Major | /sponsor/marketplace 380px (all tabs) | Same, card grids | 2154c35 |
| D-07 | Major | /admin/campaigns/new 624px | Same + min-w-[34rem] table propagating through overflow-x-auto during intrinsic sizing | 2154c35 |
| D-08 | Major | Dark --sx-text-faint 3.05:1 (site-wide captions) | Token never measured for dark | #7e88a0 (5.14:1) · 76df208 |
| D-09 | Major | Light --sx-text-faint 2.54:1 | A2 light sweep covered brand/chip tokens only | #52708f (5.16:1) · 76df208 |
| D-10 | Major | White-on-primary CTAs 2.95:1 in dark (~27 sites) | text-white on bright brand fill | Themed --sx-cta-ink + sweep · 76df208 |
| D-11 | Minor | Light --sx-accent-soft 2.68:1 as text / CTA hover | Token missed the light darkening pass | #9c4507 · 76df208 |
| ID | False signal | Actual cause | Harness rule |
| --- | --- | --- | --- |
| H-01 | 'Media Value' marker missing on the report | Page renders 'Media value'; capitalised string exists only in a comment and an unused fixture | Match markers case-insensitively |
| H-02 | Overflowing routes 'pass' a scrollWidth ≤ innerWidth check | Chrome mobile emulation expands the layout viewport around overflowing content | Compare scrollWidth to literal 360 |
| H-03 | 'Escape does not close the drawer' | ~160ms exit animation; check raced it at 350ms | Assert on aria-expanded after ≥1s |
| H-04 | ~50 phantom AA failures in light theme (ratio ≈1.01) | Flipping data-theme mid-page does not recompute Tailwind v4 theme properties like a real load | Apply theme pre-paint via localStorage before navigating |
| H-05 | '$40'/'$220' athlete rates 'leaking' on every page | Next.js RSC flight payload uses $-prefixed row-reference tokens in inline scripts | Strip <script> blocks before string matching; prefer import analysis |
| Role | Name | Result | Signature | Date |
| --- | --- | --- | --- | --- |
| Executed by | Claude (session QA) · HeckerCreatives | 23 / 23 PASS |  | 2026-09-12 |
| Reviewed / approved by | rcfworks (lead) | ☐ Approved   ☐ Changes requested |  |  |