/**
 * /api/v1 — the Phase 2 marketplace's own records: inventory (2S2-BE-01), the
 * team roster (2S2-BE-04), listings (2S3-BE-01), formal offers (2S2-BE-03)
 * and tenant branding (2S7-BE-01). No business rule lives here.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { clientIp, clientUserAgent } from "../../lib/client-ip";
import {
  BrandingInput, InventoryItemInput, InventoryItemPatch, ListingDecisionInput, ListingInput, ListingPatch, ListingState,
  ListingTransitionInput, LogoUploadInput, OfferInput, OfferResponseInput, RosterAthleteInput, TeamShareInput,
  CartLineInput, CartLinePatch, RestrictionInput, SearchQuery, SponsorCategoriesInput,
  MarketplaceOrderDecisionInput, MarketplaceOrderTransitionInput, PlaceOrderInput,
  CommissionRuleInput, CommissionRuleRevision, CommissionPreviewInput,
} from "../../contracts/marketplace";
import { createRule, listRules, previewSplit, reviseRule } from "../../domain/commission";
import { orderFinancials, propertyLedger } from "../../domain/ledger";
import { propertyAnalytics } from "../../domain/property-analytics";
import { getReservation, releaseReservation, reserveCart } from "../../domain/reservation";
import {
  decideMarketplaceOrder, getMarketplaceOrder, listMarketplaceOrders, placeOrder, transitionMarketplaceOrder,
} from "../../domain/marketplace-order";
import { createRestriction, deleteRestriction, listRestrictions, setSponsorCategories } from "../../domain/restrictions";
import { searchMarketplace } from "../../domain/marketplace-search";
import { addLine, currentCart, openCart, removeLine, updateLine } from "../../domain/cart";
import { createInventoryItem, getInventoryItem, listInventory, updateInventoryItem } from "../../domain/inventory";
import { addRosterAthlete, setTeamShare, teamAthletesPage, teamInventoryPage, teamRoster } from "../../domain/team";
import {
  createListing, decideListing, getListing, listListings, submitListing, transitionListing, updateListing,
} from "../../domain/listing";
import { createOffer, getOffer, listOffers, respondToOffer, sendOffer, withdrawOffer } from "../../domain/offer";
import { mayWriteBranding, readBranding, requestLogoUpload, updateBranding } from "../../domain/branding";
import { allowedList, pageRequest, searchTerm } from "../../lib/paging";
const ATHLETE_STATES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "ACTIVE", "SUSPENDED", "FEATURED"] as const;

export const marketplaceRouter = Router();
type Id = { id: string };

/* ── inventory ──────────────────────────────────────────────────────────── */
const inventory: RequestHandler = async (req, res) => { res.json({ items: await listInventory(req.actor!) }); };
const item: RequestHandler<Id> = async (req, res) => { res.json(await getInventoryItem(req.actor!, req.params.id)); };
const newItem: RequestHandler = async (req, res) => { res.status(201).json(await createInventoryItem(req.actor!, InventoryItemInput.parse(req.body))); };
const editItem: RequestHandler<Id> = async (req, res) => { res.json(await updateInventoryItem(req.actor!, req.params.id, InventoryItemPatch.parse(req.body))); };
marketplaceRouter.get("/inventory", requireActor, inventory);
marketplaceRouter.post("/inventory", requireActor, newItem);
marketplaceRouter.get("/inventory/:id", requireActor, item);
marketplaceRouter.patch("/inventory/:id", requireActor, editItem);

/* ── the team roster ────────────────────────────────────────────────────── */
const roster: RequestHandler = async (req, res) => { res.json(await teamRoster(req.actor!)); };
const addAthlete: RequestHandler = async (req, res) => { res.status(201).json(await addRosterAthlete(req.actor!, RosterAthleteInput.parse(req.body))); };
const share: RequestHandler<Id> = async (req, res) => { res.json(await setTeamShare(req.actor!, req.params.id, TeamShareInput.parse(req.body).teamShareBps)); };
/* Server-paged property-portal reads (2026-09-29): ?page ?size ?q, plus
   ?state (athletes, comma list) / ?active=true|false (inventory). */
const athletesPage: RequestHandler = async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const page = pageRequest({ page: 1, ...q }) as NonNullable<ReturnType<typeof pageRequest>>;
  res.json(await teamAthletesPage(req.actor!, page, {
    q: searchTerm(q),
    state: allowedList(q.state, ATHLETE_STATES),
  }));
};
const inventoryPage: RequestHandler = async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const page = pageRequest({ page: 1, ...q }) as NonNullable<ReturnType<typeof pageRequest>>;
  res.json(await teamInventoryPage(req.actor!, page, {
    q: searchTerm(q),
    active: q.active === "true" ? true : q.active === "false" ? false : undefined,
  }));
};
marketplaceRouter.get("/team/roster", requireActor, roster);
marketplaceRouter.get("/team/athletes", requireActor, athletesPage);
marketplaceRouter.get("/team/inventory", requireActor, inventoryPage);
marketplaceRouter.post("/team/roster", requireActor, addAthlete);
marketplaceRouter.patch("/team/roster/:id", requireActor, share);

/* ── listings ───────────────────────────────────────────────────────────── */
const listings: RequestHandler = async (req, res) => {
  const state = req.query.state ? ListingState.parse(req.query.state) : undefined;
  res.json({ listings: await listListings(req.actor!, state) });
};
const listing: RequestHandler<Id> = async (req, res) => { res.json(await getListing(req.actor!, req.params.id)); };
const newListing: RequestHandler = async (req, res) => { res.status(201).json(await createListing(req.actor!, ListingInput.parse(req.body))); };
const editListing: RequestHandler<Id> = async (req, res) => { res.json(await updateListing(req.actor!, req.params.id, ListingPatch.parse(req.body))); };
const submit: RequestHandler<Id> = async (req, res) => { res.json(await submitListing(req.actor!, req.params.id)); };
const moveListing: RequestHandler<Id> = async (req, res) => { res.json(await transitionListing(req.actor!, req.params.id, ListingTransitionInput.parse(req.body).to)); };
const decide: RequestHandler<Id> = async (req, res) => {
  const b = ListingDecisionInput.parse(req.body);
  res.json(await decideListing(req.actor!, req.params.id, b.decision, b.notes));
};
marketplaceRouter.get("/listings", requireActor, listings);
marketplaceRouter.post("/listings", requireActor, newListing);
marketplaceRouter.get("/listings/:id", requireActor, listing);
marketplaceRouter.patch("/listings/:id", requireActor, editListing);
marketplaceRouter.post("/listings/:id/submit", requireActor, submit);
marketplaceRouter.post("/listings/:id/transition", requireActor, moveListing);
marketplaceRouter.post("/listings/:id/decision", requireActor, decide);

/* ── formal offers ──────────────────────────────────────────────────────── */
const offers: RequestHandler = async (req, res) => { res.json({ offers: await listOffers(req.actor!) }); };
const offer: RequestHandler<Id> = async (req, res) => { res.json(await getOffer(req.actor!, req.params.id)); };
const newOffer: RequestHandler = async (req, res) => { res.status(201).json(await createOffer(req.actor!, OfferInput.parse(req.body))); };
const send: RequestHandler<Id> = async (req, res) => { res.json(await sendOffer(req.actor!, req.params.id)); };
const withdraw: RequestHandler<Id> = async (req, res) => { res.json(await withdrawOffer(req.actor!, req.params.id)); };
const respond: RequestHandler<Id> = async (req, res) => {
  const b = OfferResponseInput.parse(req.body);
  /* The signer's evidence comes through the web server's forward, like every acceptance. */
  res.json(await respondToOffer(req.actor!, req.params.id, { ...b, ip: clientIp(req), userAgent: clientUserAgent(req) }));
};
marketplaceRouter.get("/offers", requireActor, offers);
marketplaceRouter.post("/offers", requireActor, newOffer);
marketplaceRouter.get("/offers/:id", requireActor, offer);
marketplaceRouter.post("/offers/:id/send", requireActor, send);
marketplaceRouter.post("/offers/:id/withdraw", requireActor, withdraw);
marketplaceRouter.post("/offers/:id/respond", requireActor, respond);

/* ── tenant branding ────────────────────────────────────────────────────── */
const branding: RequestHandler = async (req, res) => {
  res.json({ ...(await readBranding(req.actor!)), canEdit: await mayWriteBranding(req.actor!) });
};
const setBranding: RequestHandler = async (req, res) => { res.json(await updateBranding(req.actor!, BrandingInput.parse(req.body))); };
const logo: RequestHandler = async (req, res) => { res.status(201).json(await requestLogoUpload(req.actor!, LogoUploadInput.parse(req.body))); };
marketplaceRouter.get("/branding", requireActor, branding);
marketplaceRouter.put("/branding", requireActor, setBranding);
marketplaceRouter.post("/branding/logo", requireActor, logo);

/* ── Phase 2 batch 4 — restrictions (2S2-BE-02), search (2S3-BE-04), cart (2S4-BE-01) ── */
const restrictions: RequestHandler = async (req, res) => { res.json({ restrictions: await listRestrictions(req.actor!) }); };
const newRestriction: RequestHandler = async (req, res) => { res.status(201).json(await createRestriction(req.actor!, RestrictionInput.parse(req.body))); };
const dropRestriction: RequestHandler<Id> = async (req, res) => { res.json(await deleteRestriction(req.actor!, req.params.id)); };
const sponsorCategories: RequestHandler<Id> = async (req, res) => {
  res.json(await setSponsorCategories(req.actor!, req.params.id, SponsorCategoriesInput.parse(req.body).categories));
};
marketplaceRouter.get("/restrictions", requireActor, restrictions);
marketplaceRouter.post("/restrictions", requireActor, newRestriction);
marketplaceRouter.delete("/restrictions/:id", requireActor, dropRestriction);
marketplaceRouter.put("/sponsors/:id/categories", requireActor, sponsorCategories);

const search: RequestHandler = async (req, res) => { res.json({ results: await searchMarketplace(req.actor!, SearchQuery.parse(req.query)) }); };
marketplaceRouter.get("/marketplace/search", requireActor, search);

const cart: RequestHandler = async (req, res) => { res.json({ cart: await currentCart(req.actor!) }); };
const open: RequestHandler = async (req, res) => { res.status(201).json(await openCart(req.actor!)); };
const addToCart: RequestHandler = async (req, res) => { res.status(201).json(await addLine(req.actor!, CartLineInput.parse(req.body))); };
const changeLine: RequestHandler<Id> = async (req, res) => { res.json(await updateLine(req.actor!, req.params.id, CartLinePatch.parse(req.body))); };
const dropLine: RequestHandler<Id> = async (req, res) => { res.json(await removeLine(req.actor!, req.params.id)); };
marketplaceRouter.get("/cart", requireActor, cart);
marketplaceRouter.post("/cart", requireActor, open);
marketplaceRouter.post("/cart/lines", requireActor, addToCart);
marketplaceRouter.patch("/cart/lines/:id", requireActor, changeLine);
marketplaceRouter.delete("/cart/lines/:id", requireActor, dropLine);

/* ── Phase 2 batch 5 — reservations (2S4-BE-02), orders (2S4-BE-03/-05) ── */
const reserve: RequestHandler = async (req, res) => { res.status(201).json(await reserveCart(req.actor!)); };
const reservation: RequestHandler<Id> = async (req, res) => { res.json(await getReservation(req.actor!, req.params.id)); };
const release: RequestHandler<Id> = async (req, res) => { res.json(await releaseReservation(req.actor!, req.params.id)); };
marketplaceRouter.post("/cart/reserve", requireActor, reserve);
marketplaceRouter.get("/reservations/:id", requireActor, reservation);
marketplaceRouter.post("/reservations/:id/release", requireActor, release);

const orders: RequestHandler = async (req, res) => {
  const state = typeof req.query.state === "string" ? (req.query.state as Parameters<typeof listMarketplaceOrders>[1]) : undefined;
  res.json({ orders: await listMarketplaceOrders(req.actor!, state) });
};
const order: RequestHandler<Id> = async (req, res) => { res.json(await getMarketplaceOrder(req.actor!, req.params.id)); };
const place: RequestHandler = async (req, res) => { res.status(201).json(await placeOrder(req.actor!, PlaceOrderInput.parse(req.body).reservationId)); };
const decideOrder: RequestHandler<Id> = async (req, res) => {
  const b = MarketplaceOrderDecisionInput.parse(req.body);
  res.json(await decideMarketplaceOrder(req.actor!, req.params.id, b.decision, b.notes));
};
const moveOrder: RequestHandler<Id> = async (req, res) => {
  res.json(await transitionMarketplaceOrder(req.actor!, req.params.id, MarketplaceOrderTransitionInput.parse(req.body).to));
};
marketplaceRouter.get("/marketplace-orders", requireActor, orders);
marketplaceRouter.post("/marketplace-orders", requireActor, place);
marketplaceRouter.get("/marketplace-orders/:id", requireActor, order);
marketplaceRouter.post("/marketplace-orders/:id/decision", requireActor, decideOrder);
marketplaceRouter.post("/marketplace-orders/:id/transition", requireActor, moveOrder);

/* ── Phase 2 batch 6 — commission (2S5-BE-01), the breakdown (2S4-BE-04),
   the ledger (2S5-BE-02), property analytics (2S7-DATA-01) ─────────────── */
const rules: RequestHandler = async (req, res) => { res.json({ rules: await listRules(req.actor!, { current: req.query.current === "true" }) }); };
const newRule: RequestHandler = async (req, res) => { res.status(201).json(await createRule(req.actor!, CommissionRuleInput.parse(req.body))); };
const revise: RequestHandler<Id> = async (req, res) => { res.status(201).json(await reviseRule(req.actor!, req.params.id, CommissionRuleRevision.parse(req.body))); };
marketplaceRouter.get("/commission-rules", requireActor, rules);
marketplaceRouter.post("/commission-rules", requireActor, newRule);
marketplaceRouter.post("/commission-rules/:id/revise", requireActor, revise);
const preview: RequestHandler = async (req, res) => { res.json(await previewSplit(req.actor!, CommissionPreviewInput.parse(req.body))); };
marketplaceRouter.post("/commission-rules/preview", requireActor, preview);

const financials: RequestHandler<Id> = async (req, res) => { res.json({ lines: await orderFinancials(req.actor!, req.params.id) }); };
const ledger: RequestHandler = async (req, res) => { res.json(await propertyLedger(req.actor!)); };
const analytics: RequestHandler = async (req, res) => { res.json(await propertyAnalytics(req.actor!)); };
marketplaceRouter.get("/marketplace-orders/:id/financials", requireActor, financials);
marketplaceRouter.get("/team/ledger", requireActor, ledger);
marketplaceRouter.get("/team/analytics", requireActor, analytics);
