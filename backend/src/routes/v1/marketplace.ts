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
} from "../../contracts/marketplace";
import { createInventoryItem, getInventoryItem, listInventory, updateInventoryItem } from "../../domain/inventory";
import { addRosterAthlete, setTeamShare, teamRoster } from "../../domain/team";
import {
  createListing, decideListing, getListing, listListings, submitListing, transitionListing, updateListing,
} from "../../domain/listing";
import { createOffer, getOffer, listOffers, respondToOffer, sendOffer, withdrawOffer } from "../../domain/offer";
import { readBranding, requestLogoUpload, updateBranding } from "../../domain/branding";

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
marketplaceRouter.get("/team/roster", requireActor, roster);
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
const branding: RequestHandler = async (req, res) => { res.json(await readBranding(req.actor!)); };
const setBranding: RequestHandler = async (req, res) => { res.json(await updateBranding(req.actor!, BrandingInput.parse(req.body))); };
const logo: RequestHandler = async (req, res) => { res.status(201).json(await requestLogoUpload(req.actor!, LogoUploadInput.parse(req.body))); };
marketplaceRouter.get("/branding", requireActor, branding);
marketplaceRouter.put("/branding", requireActor, setBranding);
marketplaceRouter.post("/branding/logo", requireActor, logo);
