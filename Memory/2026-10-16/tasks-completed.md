# 2026-10-16

## rcfworks — 3S6-BE-02, 3S6-BE-03, 3S6-BE-04: partner sales matched, and the queue

The last Phase 3 backend tasks. The plan was approved by the user before starting, with dismiss-only on the queue (no manual assignment) and the click id read as the athlete's existing tracking-link code (no change to the redirect).

**Built:**
- **3S6-BE-02: `PartnerSaleAttribution`.** One row per partner sale or refund, holding:
  - its source, method, matched key, window, confidence and model version;
  - the campaign and athlete it matched.

  The partner's own id is unique per partner, so a resent sale counts once. A database CHECK refuses a modelled sale labelled verified. It is wrapped in `IS TRUE`, because the first version let a NULL key through; the test caught it.
- **3S6-BE-03: exact first.**
  - **Keys, in order:** reward token, then tracking-link code, then an order id already matched (how a refund finds its sale), each inside the adapter's window.
  - **Modelled fallback:** `attr-geo-time@0.1.0`, the new `attribution` model in the registry. It runs only when no key matched and the adapter declares probabilistic. The generic webhook doesn't, so nothing changes for it.
  - **Sponsor hub:** "sales matched" and "sales likely" now read these rows.
- **3S6-BE-04: the queue.**
  - **Every unmatched sale stays** with its reason: `no_match`, `ambiguous`, `outside_window` or `unknown_token`.
  - **Nightly retry:** a new `attribution` step in the chain, recorded in `PipelineRun`.
  - **Dismissing:** BTG admins dismiss with a reason. It is audited (`attribution.dismiss`), and the sale stays on the list, marked.
  - **Endpoint:** `GET /intelligence/attribution` serves the 3S6-FE-01 screen contract.
- **Permission:** `attribution` read is widened to `CAMPAIGN_MGR` and `SALES` (the screen contract's readers). Writing stays with BTG admins.
  - The RBAC matrix §36 is updated, and the digest is now `8f3f5c877af850bb`.
- **Docs:**
  - new: `SponsorX-Attribution-Matching.md`;
  - updated: the Phase 3 plan entries, the screen contract ("Mounted 2026-10-16"), Attribution Framework, Hub Intelligence, Model Governance, Pipeline Monitoring and RBAC §36.
- **Migration:** `20261016120000_partner_sale_attribution`.

**Checks:**
- `tests/attribution-matching.test.ts` (12 tests) covers:
  - every key and every reason;
  - the CHECK refusing five bad label combinations;
  - the modelled fallback, including ambiguous;
  - a refund inheriting "modelled";
  - the nightly retry;
  - the desk's totals, with refunds taken off;
  - dismissing;
  - who may see and do what;
  - the sponsor hub.
- The tenant-isolation sweep covers the dismiss route.

**Tracker:** 3S6-BE-02/03/04 moved to Done on 2026-10-16, after #237 merged with acceptance met. Sync PR #238 (main_development → main) is open; the deploy follows once main is green.
