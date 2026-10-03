/**
 * /api/v1 — the Phase 2 marketplace's own records: inventory (2S2-BE-01), the
 * team roster (2S2-BE-04), listings (2S3-BE-01), formal offers (2S2-BE-03)
 * and tenant branding (2S7-BE-01). No business rule lives here.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { clientIp, clientUserAgent } from "../../lib/client-ip";
import {
  BrandingInput, InventoryItemInput, InventoryItemPatch, ListingBtgActionInput, ListingDecisionInput, ListingInput, ListingPatch, ListingState, LiveListingsQuery,
  ListingTransitionInput, LogoUploadInput, OfferAthletesQuery, OfferChecksQuery, OfferDraftQuery, OfferInput, OfferKeepInput, OfferPatch, OfferResponseInput,
  RosterAthleteInput, TeamShareInput,
  CartLineInput, CartLinePatch, RestrictionInput, SearchQuery, SponsorCategoriesInput,
  MarketplaceOrderDecisionInput, MarketplaceOrderTransitionInput, PlaceOrderInput, SellerApprovalDecisionInput,
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
import { decideSellerApproval, mySellerApproval, mySellerApprovals } from "../../domain/order-approval";
import { sponsorSpendingLimit } from "../../domain/spending-limit";
import { searchMarketplace } from "../../domain/marketplace-search";
import { addLine, currentCart, openCart, removeLine, updateLine } from "../../domain/cart";
import { createInventoryItem, getInventoryItem, listInventory, updateInventoryItem } from "../../domain/inventory";
import { addRosterAthlete, setTeamShare, teamAthletesPage, teamInventoryPage, teamRoster } from "../../domain/team";
import {
  autoPublishedListings, btgActOnListing, liveListings, createListing, decideListing, getListing, listListings, submitListing, transitionListing, updateListing,
} from "../../domain/listing";
import {
  createOffer, getOffer, keepOffer, listOffers, respondToOffer, reviseOffer, sendOffer, updateOffer, withdrawOffer,
} from "../../domain/offer";
import { offerAthletes, offerChecks } from "../../domain/offer-desk";
import { offerDraft } from "../../domain/offer-draft";
import { mayWriteBranding, readBranding, requestLogoUpload, updateBranding } from "../../domain/branding";
import { allowedList, pageRequest, searchTerm } from "../../lib/paging";
import {
  CancellationAnswerInput, DeliveryCancelInput, DeliveryProblemInput, DeliveryProofQuery, DeliveryResolutionInput, InvitableAthletesQuery, MarkDeliveredInput,
  ProblemAnswerInput, ProofUploadInput, ReplyAnswerInput, SaleCancelInput, TeamInvitationInput,
  TeamInvitationResponseInput,
} from "../../contracts/delivery";
import { RefundSentInput, RefundsQuery } from "../../contracts/refunds";
import {
  answerCancellation, answerProblem, answerReply, cancelLine, cancellationFor, confirmDelivery, deliveryExchange, deliveryIssue, deliveryIssues, markDelivered,
  mySale, mySales, orderDeliveries, proofLink, remindSeller, reportProblem, requestProofUpload, resolveIssue, sellerCancel,
} from "../../domain/delivery";
import { listRefunds, markRefundSent } from "../../domain/refunds";
import { sellerSummary } from "../../domain/seller-summary";
import {
  inviteAthlete, invitableAthletes, leaveTeam, myTeam, removeFromRoster, respondToInvitation, teamInvitations, withdrawInvitation,
} from "../../domain/team-invitations";
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
/* 2S3-BE-06 — BTG's "Published automatically" tab, and its pause / end / resume. */
const autoPublished: RequestHandler = async (req, res) => { res.json({ listings: await autoPublishedListings(req.actor!) }); };
const live: RequestHandler = async (req, res) => { res.json(await liveListings(req.actor!, LiveListingsQuery.parse(req.query).page ?? 1)); };
const btgAct: RequestHandler<Id> = async (req, res) => {
  const b = ListingBtgActionInput.parse(req.body);
  res.json(await btgActOnListing(req.actor!, req.params.id, b.action, b.reason));
};
marketplaceRouter.get("/listings", requireActor, listings);
marketplaceRouter.post("/listings", requireActor, newListing);
/* Mounted before /listings/:id, which would take it. */
marketplaceRouter.get("/listings/auto-published", requireActor, autoPublished);
marketplaceRouter.get("/listings/live", requireActor, live);
marketplaceRouter.get("/listings/:id", requireActor, listing);
marketplaceRouter.patch("/listings/:id", requireActor, editListing);
marketplaceRouter.post("/listings/:id/submit", requireActor, submit);
marketplaceRouter.post("/listings/:id/transition", requireActor, moveListing);
marketplaceRouter.post("/listings/:id/decision", requireActor, decide);
marketplaceRouter.post("/listings/:id/btg-action", requireActor, btgAct);

/* ── formal offers ──────────────────────────────────────────────────────── */
const offers: RequestHandler = async (req, res) => { res.json({ offers: await listOffers(req.actor!) }); };
const offer: RequestHandler<Id> = async (req, res) => { res.json(await getOffer(req.actor!, req.params.id)); };
const newOffer: RequestHandler = async (req, res) => { res.status(201).json(await createOffer(req.actor!, OfferInput.parse(req.body))); };
const editOffer: RequestHandler<Id> = async (req, res) => { res.json(await updateOffer(req.actor!, req.params.id, OfferPatch.parse(req.body))); };
const send: RequestHandler<Id> = async (req, res) => { res.json(await sendOffer(req.actor!, req.params.id)); };
const keep: RequestHandler<{ id: string; requestId: string }> = async (req, res) => {
  res.json(await keepOffer(req.actor!, req.params.id, req.params.requestId, OfferKeepInput.parse(req.body).note));
};
const reviseOne: RequestHandler<Id> = async (req, res) => { res.json(await reviseOffer(req.actor!, req.params.id)); };
const withdraw: RequestHandler<Id> = async (req, res) => { res.json(await withdrawOffer(req.actor!, req.params.id)); };
const respond: RequestHandler<Id> = async (req, res) => {
  const b = OfferResponseInput.parse(req.body);
  /* The signer's evidence comes through the web server's forward, like every acceptance. */
  res.json(await respondToOffer(req.actor!, req.params.id, { ...b, ip: clientIp(req), userAgent: clientUserAgent(req) }));
};
/* 2S2-FE-03 — BTG's new-offer form: the athlete picker and the live checks.
   /offers/athletes is mounted before /offers/:id, which would take it. */
const offerAthletePicker: RequestHandler = async (req, res) => {
  res.json({ athletes: await offerAthletes(req.actor!, OfferAthletesQuery.parse(req.query).q) });
};
const offerCheck: RequestHandler<Id> = async (req, res) => {
  res.json(await offerChecks(req.actor!, req.params.id, OfferChecksQuery.parse(req.query)));
};
/* P4-BE-08 — the same form, filled in from the records; creates nothing. */
const draftOne: RequestHandler<Id> = async (req, res) => {
  res.json(await offerDraft(req.actor!, req.params.id, OfferDraftQuery.parse(req.query)));
};
marketplaceRouter.get("/offers/athletes", requireActor, offerAthletePicker);
marketplaceRouter.get("/campaigns/:id/offer-checks", requireActor, offerCheck);
marketplaceRouter.get("/campaigns/:id/offer-draft", requireActor, draftOne);
marketplaceRouter.get("/offers", requireActor, offers);
marketplaceRouter.post("/offers", requireActor, newOffer);
marketplaceRouter.get("/offers/:id", requireActor, offer);
marketplaceRouter.patch("/offers/:id", requireActor, editOffer);
marketplaceRouter.post("/offers/:id/send", requireActor, send);
marketplaceRouter.post("/offers/:id/withdraw", requireActor, withdraw);
marketplaceRouter.post("/offers/:id/respond", requireActor, respond);
marketplaceRouter.post("/offers/:id/change-requests/:requestId/keep", requireActor, keep);
marketplaceRouter.post("/offers/:id/revise", requireActor, reviseOne);

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
const place: RequestHandler = async (req, res) => {
  /* 2S4-FE-02 — the acceptance's evidence comes through the web server's forward, like every acceptance. */
  res.status(201).json(await placeOrder(req.actor!, { ...PlaceOrderInput.parse(req.body), ip: clientIp(req) ?? "", userAgent: clientUserAgent(req) ?? "" }));
};
const decideOrder: RequestHandler<Id> = async (req, res) => {
  const b = MarketplaceOrderDecisionInput.parse(req.body);
  res.json(await decideMarketplaceOrder(req.actor!, req.params.id, b.decision, b.notes));
};
const moveOrder: RequestHandler<Id> = async (req, res) => {
  const b = MarketplaceOrderTransitionInput.parse(req.body);
  res.json(await transitionMarketplaceOrder(req.actor!, req.params.id, b.to, b.payment));
};
marketplaceRouter.get("/marketplace-orders", requireActor, orders);
marketplaceRouter.post("/marketplace-orders", requireActor, place);
marketplaceRouter.get("/marketplace-orders/:id", requireActor, order);
marketplaceRouter.post("/marketplace-orders/:id/decision", requireActor, decideOrder);
marketplaceRouter.post("/marketplace-orders/:id/transition", requireActor, moveOrder);

/* ── 2S4-BE-09 — the seller's answer to an order a listing asks to approve
   (the seller's own, in their own tenant, like /sales), and BTG's read of a
   sponsor's spending limit ───────────────────────────────────────────────── */
marketplaceRouter.get("/seller-approvals", requireActor, (async (req, res) => { res.json(await mySellerApprovals(req.actor!)); }) as RequestHandler);
marketplaceRouter.get("/seller-approvals/:id", requireActor, (async (req, res) => { res.json(await mySellerApproval(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.post("/seller-approvals/:id/decision", requireActor, (async (req, res) => {
  const b = SellerApprovalDecisionInput.parse(req.body);
  res.json(await decideSellerApproval(req.actor!, req.params.id, b.decision, b.reason));
}) as RequestHandler<Id>);
marketplaceRouter.get("/sponsors/:id/spending-limit", requireActor, (async (req, res) => { res.json(await sponsorSpendingLimit(req.actor!, req.params.id)); }) as RequestHandler<Id>);

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

/* ── 2S4-BE-06 / -07 / -08 — sellers' orders and delivery ─────────────────
   /sales is the seller's (the team's manager, the athlete): their own sold
   lines, their own share. /deliveries/{lineId} is the buying sponsor's answer;
   /delivery-issues is BTG's desk. The id is always the order line's. */
marketplaceRouter.get("/sales", requireActor, (async (req, res) => { res.json(await mySales(req.actor!)); }) as RequestHandler);
/* 2S2-FE-01 — before /sales/:id, which would take "summary" for an id. */
marketplaceRouter.get("/sales/summary", requireActor, (async (req, res) => { res.json(await sellerSummary(req.actor!)); }) as RequestHandler);
marketplaceRouter.get("/sales/:id", requireActor, (async (req, res) => { res.json(await mySale(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.post("/sales/:id/proof", requireActor, (async (req, res) => {
  res.status(201).json(await requestProofUpload(req.actor!, req.params.id, ProofUploadInput.parse(req.body)));
}) as RequestHandler<Id>);
marketplaceRouter.post("/sales/:id/delivered", requireActor, (async (req, res) => {
  res.json(await markDelivered(req.actor!, req.params.id, MarkDeliveredInput.parse(req.body)));
}) as RequestHandler<Id>);
marketplaceRouter.get("/marketplace-orders/:id/deliveries", requireActor, (async (req, res) => { res.json(await orderDeliveries(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.post("/deliveries/:id/confirm", requireActor, (async (req, res) => { res.json(await confirmDelivery(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.post("/deliveries/:id/problem", requireActor, (async (req, res) => {
  res.json(await reportProblem(req.actor!, req.params.id, DeliveryProblemInput.parse(req.body).note));
}) as RequestHandler<Id>);
marketplaceRouter.get("/deliveries/:id/proof", requireActor, (async (req, res) => {
  res.json(await proofLink(req.actor!, req.params.id, DeliveryProofQuery.parse(req.query)));
}) as RequestHandler<Id>);
/* 2S4-BE-11 — a problem settled between them: the seller answers, the sponsor accepts or rejects; the exchange reads the same for both and BTG. */
marketplaceRouter.post("/sales/:id/problem-answer", requireActor, (async (req, res) => {
  res.json(await answerProblem(req.actor!, req.params.id, ProblemAnswerInput.parse(req.body)));
}) as RequestHandler<Id>);
marketplaceRouter.post("/deliveries/:id/problem-answer", requireActor, (async (req, res) => {
  res.json(await answerReply(req.actor!, req.params.id, ReplyAnswerInput.parse(req.body)));
}) as RequestHandler<Id>);
marketplaceRouter.get("/deliveries/:id/exchange", requireActor, (async (req, res) => { res.json(await deliveryExchange(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.get("/delivery-issues", requireActor, (async (req, res) => { res.json(await deliveryIssues(req.actor!)); }) as RequestHandler);
marketplaceRouter.get("/delivery-issues/:id", requireActor, (async (req, res) => { res.json(await deliveryIssue(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.post("/delivery-issues/:id/resolve", requireActor, (async (req, res) => {
  const b = DeliveryResolutionInput.parse(req.body);
  res.json(await resolveIssue(req.actor!, req.params.id, b.decision, b.note));
}) as RequestHandler<Id>);
marketplaceRouter.post("/delivery-issues/:id/remind", requireActor, (async (req, res) => { res.json(await remindSeller(req.actor!, req.params.id)); }) as RequestHandler<Id>);
/* 2S4-BE-12 — cancelling a paid line: the sponsor's terms and cancel, the seller's cancel and its answer to a request. */
marketplaceRouter.get("/deliveries/:id/cancellation", requireActor, (async (req, res) => { res.json(await cancellationFor(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.post("/deliveries/:id/cancel", requireActor, (async (req, res) => {
  res.json(await cancelLine(req.actor!, req.params.id, DeliveryCancelInput.parse(req.body ?? {})));
}) as RequestHandler<Id>);
marketplaceRouter.post("/sales/:id/cancel", requireActor, (async (req, res) => {
  res.json(await sellerCancel(req.actor!, req.params.id, SaleCancelInput.parse(req.body).reason));
}) as RequestHandler<Id>);
marketplaceRouter.post("/sales/:id/cancellation-answer", requireActor, (async (req, res) => {
  res.json(await answerCancellation(req.actor!, req.params.id, CancellationAnswerInput.parse(req.body)));
}) as RequestHandler<Id>);
/* 2S4-BE-13 — refunds to send (BTG admin and Finance). */
marketplaceRouter.get("/refunds", requireActor, (async (req, res) => { res.json(await listRefunds(req.actor!, RefundsQuery.parse(req.query).state)); }) as RequestHandler);
marketplaceRouter.post("/refunds/:id/sent", requireActor, (async (req, res) => {
  res.json(await markRefundSent(req.actor!, req.params.id, RefundSentInput.parse(req.body)));
}) as RequestHandler<Id>);

/* ── 2S2-BE-05 — a team invites an athlete already on SponsorX ──────────── */
marketplaceRouter.get("/team/invitations", requireActor, (async (req, res) => { res.json(await teamInvitations(req.actor!)); }) as RequestHandler);
marketplaceRouter.get("/team/invitations/candidates", requireActor, (async (req, res) => {
  res.json(await invitableAthletes(req.actor!, InvitableAthletesQuery.parse(req.query).q));
}) as RequestHandler);
marketplaceRouter.post("/team/invitations", requireActor, (async (req, res) => { res.status(201).json(await inviteAthlete(req.actor!, TeamInvitationInput.parse(req.body))); }) as RequestHandler);
marketplaceRouter.post("/team-invitations/:id/withdraw", requireActor, (async (req, res) => { res.json(await withdrawInvitation(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.post("/team-invitations/:id/respond", requireActor, (async (req, res) => {
  res.json(await respondToInvitation(req.actor!, req.params.id, TeamInvitationResponseInput.parse(req.body).decision));
}) as RequestHandler<Id>);
marketplaceRouter.post("/team/roster/:id/remove", requireActor, (async (req, res) => { res.json(await removeFromRoster(req.actor!, req.params.id)); }) as RequestHandler<Id>);
marketplaceRouter.get("/me/team", requireActor, (async (req, res) => { res.json(await myTeam(req.actor!)); }) as RequestHandler);
marketplaceRouter.post("/me/team/leave", requireActor, (async (req, res) => { res.json(await leaveTeam(req.actor!)); }) as RequestHandler);
