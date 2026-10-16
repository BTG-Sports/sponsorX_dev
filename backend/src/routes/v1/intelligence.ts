/**
 * /api/v1/intelligence — Phase 3's engines, read by the admin intelligence
 * screens (documentation/SponsorX-Phase3-Screen-Contracts.md).
 *
 * 3S2-BE-02/03 — the CPM engine's suggested prices: the pricing panel's list,
 * one item's detail, and a BTG admin's override with a reason.
 *
 * 3S3-BE-02/03 — the match engine: a brief's ranked candidates, one kind a
 * page, and the brief's shortlist (briefMatch, RBAC matrix §29).
 *
 * 3S4 — the delivery forecast: active campaigns' forecasts, one campaign's
 * detail, and a campaign's guarantee (campaignForecast, RBAC matrix §30). Tenant-wide, for BTG admins, campaign managers and
 * Sales (pricingRecommendation, RBAC matrix §28).
 *
 * 3S5 — make-goods: campaigns' shortfalls with their substitutes, and
 * approving one (makeGood, RBAC matrix §31). BTG admins and campaign managers.
 *
 * 3S7-BE-02 — the sponsor's and the property's own hubs (sponsorIntelligence,
 * propertyIntelligence, RBAC matrix §32), scoped by the actor, never the request.
 *
 * 3S7-BE-01 — the scenario planner (scenario, §33). 3S8-DATA-01 — anomaly
 * flags and their dispositions (anomaly, §34).
 *
 * 3S8-BE-01, 3S8-OPS-01 — the model registry and feature flags
 * (modelRegistry, §35; documentation/SponsorX-Model-Governance.md).
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { ForecastsQuery, GuaranteeInput, MakeGoodApproveInput, MakeGoodsQuery, MatchesQuery, PricingDeskQuery, PricingOverrideInput, ShortlistInput, SponsorIntelQuery, ScenarioCalculateInput, ScenarioSaveInput, AnomaliesQuery, AnomalyDispositionInput, FlagInput, ModelReasonInput, ModelRollbackInput, ModelSettingsInput, PartnerInput, AttributionDeskQuery, AttributionDismissInput } from "../../contracts/intelligence";
import { forecastDetail, forecastList, setGuarantee } from "../../domain/forecast-engine";
import { anomalyDesk, disposeAnomaly } from "../../domain/anomaly-engine";
import { addPartner, partnerDesk } from "../../domain/attribution-intake";
import { attributionDesk, dismissUnmatched } from "../../domain/attribution-desk";
import { approveMakeGood, makeGoodList } from "../../domain/makegood-engine";
import { activateVersion, changeSettings, modelRegistry, rollbackModel, setFlag, validateVersion } from "../../domain/model-admin";
import { calculateScenario, saveScenario, scenarioDesk } from "../../domain/scenario-engine";
import { matchPage, saveShortlist } from "../../domain/match-engine";
import { overridePrice, pricingDesk, pricingDetail } from "../../domain/pricing-engine";
import { propertyIntelligence } from "../../domain/property-intelligence";
import { sponsorIntelligence } from "../../domain/sponsor-intelligence";
import { pageRequest } from "../../lib/paging";

export const intelligenceRouter = Router();

/** GET /intelligence/pricing?page&size&q&view=above|below|low — an unknown view is 400, like an unknown kind or risk. */
const desk: RequestHandler = async (req, res) => {
  const q = PricingDeskQuery.parse(req.query ?? {});
  const page = pageRequest({ page: 1, ...req.query })!;
  res.json(await pricingDesk(req.actor!, { page, search: q.q, view: q.view ?? "" }));
};

/** GET /intelligence/pricing/:inventoryId */
const detail: RequestHandler<{ inventoryId: string }> = async (req, res) => {
  res.json(await pricingDetail(req.actor!, req.params.inventoryId));
};

intelligenceRouter.get("/intelligence/pricing", requireActor, desk);
intelligenceRouter.get("/intelligence/pricing/:inventoryId", requireActor, detail);

/** POST /intelligence/pricing/recommendations/:recommendationId/overrides { cpmCents, reason } */
const override: RequestHandler<{ recommendationId: string }> = async (req, res) => {
  const body = PricingOverrideInput.parse(req.body ?? {});
  res.status(201).json(await overridePrice(req.actor!, req.params.recommendationId, body));
};

intelligenceRouter.post("/intelligence/pricing/recommendations/:recommendationId/overrides", requireActor, override);

/** GET /intelligence/briefs/:briefId/matches?kind=athlete|property|inventory&page&size */
const matches: RequestHandler<{ briefId: string }> = async (req, res) => {
  const q = MatchesQuery.parse(req.query ?? {});
  const page = pageRequest({ page: 1, ...req.query })!;
  res.json(await matchPage(req.actor!, req.params.briefId, q.kind, page));
};

/** POST /intelligence/briefs/:briefId/shortlist { entryIds } */
const shortlist: RequestHandler<{ briefId: string }> = async (req, res) => {
  const body = ShortlistInput.parse(req.body ?? {});
  res.json(await saveShortlist(req.actor!, req.params.briefId, body.entryIds));
};

intelligenceRouter.get("/intelligence/briefs/:briefId/matches", requireActor, matches);
intelligenceRouter.post("/intelligence/briefs/:briefId/shortlist", requireActor, shortlist);

/** GET /intelligence/forecasts?risk=all|at_risk|watch|on_track&page&size */
const forecasts: RequestHandler = async (req, res) => {
  const q = ForecastsQuery.parse(req.query ?? {});
  const page = pageRequest({ page: 1, ...req.query })!;
  res.json(await forecastList(req.actor!, { risk: q.risk, page }));
};

/** GET /intelligence/forecasts/:campaignId */
const forecast: RequestHandler<{ campaignId: string }> = async (req, res) => {
  res.json(await forecastDetail(req.actor!, req.params.campaignId));
};

/** PUT /intelligence/forecasts/:campaignId/guarantee { metric, value } */
const guarantee: RequestHandler<{ campaignId: string }> = async (req, res) => {
  const body = GuaranteeInput.parse(req.body ?? {});
  res.json(await setGuarantee(req.actor!, req.params.campaignId, { metric: body.metric, value: body.value ?? null }));
};

intelligenceRouter.get("/intelligence/forecasts", requireActor, forecasts);
intelligenceRouter.get("/intelligence/forecasts/:campaignId", requireActor, forecast);
intelligenceRouter.put("/intelligence/forecasts/:campaignId/guarantee", requireActor, guarantee);

/** GET /intelligence/make-goods?status=open|approved&campaign&page&size */
const makeGoods: RequestHandler = async (req, res) => {
  const q = MakeGoodsQuery.parse(req.query ?? {});
  const page = pageRequest({ page: 1, ...req.query })!;
  res.json(await makeGoodList(req.actor!, { status: q.status, campaignId: q.campaign, page }));
};

/** POST /intelligence/make-goods/:shortfallId/approve { optionId, note } */
const approve: RequestHandler<{ shortfallId: string }> = async (req, res) => {
  const body = MakeGoodApproveInput.parse(req.body ?? {});
  res.json(await approveMakeGood(req.actor!, req.params.shortfallId, body));
};

intelligenceRouter.get("/intelligence/make-goods", requireActor, makeGoods);
intelligenceRouter.post("/intelligence/make-goods/:shortfallId/approve", requireActor, approve);

/** GET /intelligence/sponsor?range=7d|30d|90d|all — the caller's own sponsor org. */
const sponsorHub: RequestHandler = async (req, res) => {
  const q = SponsorIntelQuery.parse(req.query ?? {});
  res.json(await sponsorIntelligence(req.actor!, q.range));
};

/** GET /intelligence/property — the caller's own property. */
const propertyHub: RequestHandler = async (req, res) => {
  res.json(await propertyIntelligence(req.actor!));
};

intelligenceRouter.get("/intelligence/sponsor", requireActor, sponsorHub);
intelligenceRouter.get("/intelligence/property", requireActor, propertyHub);

/** GET /intelligence/scenarios?page&size */
const scenarios: RequestHandler = async (req, res) => {
  res.json(await scenarioDesk(req.actor!, pageRequest({ page: 1, ...req.query })!));
};

/** POST /intelligence/scenarios/calculate { inputs } — nothing stored. */
const calculate: RequestHandler = async (req, res) => {
  const body = ScenarioCalculateInput.parse(req.body ?? {});
  res.json(await calculateScenario(req.actor!, body.inputs));
};

/** POST /intelligence/scenarios { name, inputs } */
const saveOne: RequestHandler = async (req, res) => {
  const body = ScenarioSaveInput.parse(req.body ?? {});
  res.status(201).json(await saveScenario(req.actor!, body));
};

intelligenceRouter.get("/intelligence/scenarios", requireActor, scenarios);
intelligenceRouter.post("/intelligence/scenarios/calculate", requireActor, calculate);
intelligenceRouter.post("/intelligence/scenarios", requireActor, saveOne);

/** GET /intelligence/anomalies?tab=open|resolved&kind&page&size */
const anomalies: RequestHandler = async (req, res) => {
  const q = AnomaliesQuery.parse(req.query ?? {});
  res.json(await anomalyDesk(req.actor!, { tab: q.tab, kind: q.kind, page: pageRequest({ page: 1, ...req.query })! }));
};

/** POST /intelligence/anomalies/:anomalyId/disposition { outcome, note } */
const dispose: RequestHandler<{ anomalyId: string }> = async (req, res) => {
  const body = AnomalyDispositionInput.parse(req.body ?? {});
  res.json(await disposeAnomaly(req.actor!, req.params.anomalyId, body));
};

intelligenceRouter.get("/intelligence/anomalies", requireActor, anomalies);
intelligenceRouter.post("/intelligence/anomalies/:anomalyId/disposition", requireActor, dispose);

/** GET /intelligence/models */
const models: RequestHandler = async (req, res) => {
  res.json(await modelRegistry(req.actor!));
};

/** PATCH /intelligence/models/:key/thresholds { values, reason } */
const settings: RequestHandler<{ key: string }> = async (req, res) => {
  res.json(await changeSettings(req.actor!, req.params.key, ModelSettingsInput.parse(req.body ?? {})));
};

/** POST /intelligence/models/:key/versions/:version/validate { reason } */
const validate: RequestHandler<{ key: string; version: string }> = async (req, res) => {
  res.json({ model: await validateVersion(req.actor!, req.params.key, req.params.version, ModelReasonInput.parse(req.body ?? {})) });
};

/** POST /intelligence/models/:key/versions/:version/activate { reason } */
const activate: RequestHandler<{ key: string; version: string }> = async (req, res) => {
  res.json({ model: await activateVersion(req.actor!, req.params.key, req.params.version, ModelReasonInput.parse(req.body ?? {})) });
};

/** POST /intelligence/models/:key/rollback { toVersion, reason } */
const rollback: RequestHandler<{ key: string }> = async (req, res) => {
  res.json({ model: await rollbackModel(req.actor!, req.params.key, ModelRollbackInput.parse(req.body ?? {})) });
};

/** PATCH /intelligence/flags { feature, tenantId, enabled, reason } */
const flag: RequestHandler = async (req, res) => {
  res.json({ flag: await setFlag(req.actor!, FlagInput.parse(req.body ?? {})) });
};

intelligenceRouter.get("/intelligence/models", requireActor, models);
intelligenceRouter.patch("/intelligence/models/:key/thresholds", requireActor, settings);
intelligenceRouter.post("/intelligence/models/:key/versions/:version/validate", requireActor, validate);
intelligenceRouter.post("/intelligence/models/:key/versions/:version/activate", requireActor, activate);
intelligenceRouter.post("/intelligence/models/:key/rollback", requireActor, rollback);
intelligenceRouter.patch("/intelligence/flags", requireActor, flag);

/** GET /intelligence/attribution/partners — the adapters, and this tenant's partners (3S6-BE-01). */
const partners: RequestHandler = async (req, res) => {
  res.json(await partnerDesk(req.actor!));
};

/** POST /intelligence/attribution/partners { name, adapter } — the token comes back once. */
const partnerAdd: RequestHandler = async (req, res) => {
  res.status(201).json(await addPartner(req.actor!, PartnerInput.parse(req.body ?? {})));
};

intelligenceRouter.get("/intelligence/attribution/partners", requireActor, partners);
intelligenceRouter.post("/intelligence/attribution/partners", requireActor, partnerAdd);

/** GET /intelligence/attribution?campaign&tab=events|unmatched&class&page&size — matched partner sales and the queue (3S6-BE-03/04). */
const attributionRead: RequestHandler = async (req, res) => {
  const q = AttributionDeskQuery.parse(req.query ?? {});
  const page = pageRequest({ page: 1, ...req.query })!;
  res.json(await attributionDesk(req.actor!, { campaign: q.campaign, tab: q.tab, class: q.class, page }));
};

/** POST /intelligence/attribution/unmatched/:saleId/dismiss { reason } */
const dismiss: RequestHandler<{ saleId: string }> = async (req, res) => {
  res.json(await dismissUnmatched(req.actor!, req.params.saleId, AttributionDismissInput.parse(req.body ?? {})));
};

intelligenceRouter.get("/intelligence/attribution", requireActor, attributionRead);
intelligenceRouter.post("/intelligence/attribution/unmatched/:saleId/dismiss", requireActor, dismiss);
