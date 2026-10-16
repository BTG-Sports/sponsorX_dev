# SponsorX Model Governance Policy

**Task `3S0-PMO-02` · Version 1.0 · 2026-10-15 · Phase 3 · Approved by the owner, 2026-10-15**

How SponsorX's engines change their rules. Without this, nobody can explain
why a price, a forecast or a flag changed. It covers the engines' **settings**:
the numbers that tune each engine (the pricing caps, the forecast's risk lines,
the make-good and anomaly limits). The rules themselves are code, so a new rule
is a code change and goes through a pull request as usual.

Built by `3S8-BE-01` (the registry) and `3S8-OPS-01` (the feature switches);
see `backend/src/domain/model-registry.ts` and `model-admin.ts`. Managed on
the models screen (`/admin/intelligence/models`).

## 1 · Versioning

- **Numbered versions.** Every engine's settings are a version per tenant:
  `forecast-rules@1.0.0`, `@1.1.0`, and so on.
- **Built in first.** An engine starts on its built-in version, the settings
  it shipped with. That version is kept the first time anything changes, so it
  can always be returned to.
- **Each change is a new version** (the next minor number). It holds the whole
  set of settings, not just the difference, so any two can be compared.
- **The version is the stamp.** Every output carries the version that made it:
  a price, a forecast, a shortfall, an anomaly flag, a match run, a modelled
  partner sale (`attr-geo-time`, 3S6-BE-03). So a past output can always be
  explained by the settings behind it.

## 2 · The four states

| State | Means | Next |
|---|---|---|
| Draft | Proposed, not yet checked | Validated, by a second person |
| Validated | Checked and safe to use | Active |
| Active | The one the engine uses now; one per engine per tenant | Retired, when another becomes active |
| Retired | Used before | Active again, by rolling back |

## 3 · Validation: automatic inside the safe ranges

Every setting has a **safe range**, shown beside it. For example, the forecast's
"at risk" line is 30%–70%. Automation comes first (user, 2026-10-15):

- **Every changed value inside its safe range:** the new version is validated
  and made active **at once, automatically**, with the reason, and audited
  (`model.autoActivate`).
- **Any value outside its range:** the version is **held as a draft**, with the
  reason it was held. It goes live only when a **second person**, not the one
  who proposed it, validates it and someone activates it.
- **Values that can never be right are refused outright:** zero or less, a
  share above 100%, a fraction where a whole number is needed.

The safe ranges themselves are code. Widening one is a pull request.

## 4 · Confidence and explanation

- **Every output carries a confidence and its reasons.** A price carries its
  factors, a forecast its risk factors, a make-good its checks, a flag its
  evidence. This is already true of every engine, and a new engine must do
  the same.
- **Every output carries its version stamp** (§1).

## 5 · Overrides

- **A person may override an engine's output where the screen allows it,**
  always with a reason. For example: BTG's own price (`3S2-BE-03`), a
  make-good chosen by hand, an anomaly decision.
- **An override never edits what the engine made.** Both are kept.

## 6 · Rollback and comparison

- **Rolling back** makes a retired version active again, with a reason. The
  engines use it from their next run. No deployment is needed.
- **Comparing:** the screen shows each version's settings and what it made:
  the outputs stamped with it, and, once back-tests run (`3S9-QA-01`), their
  accuracy.

## 7 · Switching features off

Each intelligence feature can be switched off for one tenant (`3S8-OPS-01`):
- pricing;
- matching;
- forecasts;
- make-goods;
- anomalies;
- scenarios;
- the sponsor and property hubs;
- the Zoho updates;
- attribution (partner intake, matching and the desk).

**When a feature is off,** its nightly run skips that tenant, and its pages
answer that it is switched off. Switching back on resumes from the next run.

Every switch carries a reason and is audited (`flag.set`).

## 8 · Who

- **BTG admins,** for their own tenant.
- **Super admins,** for any tenant (RBAC matrix §35).
- **Every act is audited** with its reason: proposing, validating, activating,
  rolling back, switching.

## 9 · Monitoring

**What it will watch** (`3S9-OPS-01`):
- every nightly run succeeded;
- outputs keep being made;
- the active version's results don't drift from its back-test.

**If something goes wrong,** a person is told. Rolling back is the first
remedy.
