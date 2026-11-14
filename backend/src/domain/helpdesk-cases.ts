/**
 * The help desk's cases — POL-BE-43.
 *
 * Every situation where a SponsorX user can get stuck, as the tick-box case
 * they pick on the help desk form. The content is
 * documentation/SponsorX-Helpdesk-Cases.md (its "The user ticks" and "Who"
 * columns); it is kept HERE, in SponsorX, so the form and the inbox read one
 * list and the wording can change without touching the form.
 *
 * CHANGING A CASE. Edit its words in both places — the document and the
 * table below; tests/helpdesk-cases.test.ts fails when they differ. An ID is
 * never reused: to drop a case, move its ID to RETIRED_CASE_IDS (the inbox
 * still shows a retired ID on old messages, marked retired).
 *
 * WHO SEES A CASE (the "Who" column):
 *   - a visitor (not signed in): `public`, plus `fan` and `booth staff`, who
 *     never have a login;
 *   - a signed-in person: their role's audiences (ROLE_AUDIENCES) and `any`;
 *   - BTG staff: every case.
 * A qualifier in brackets ("guardian (new)", "athlete (AL, NE, MS, PR)")
 * narrows who the wording speaks to, not who may see it.
 */
import type { Role } from "../auth/policy";
import { HELPDESK_TOPICS } from "../contracts/support";

export type HelpdeskTopic = (typeof HELPDESK_TOPICS)[number];

/** The words on each topic. The first four are the contact form's, unchanged. */
export const HELPDESK_TOPIC_LABELS: Record<HelpdeskTopic, string> = {
  ACCOUNT: "Account",
  PAYMENT: "Payment",
  GUARDIANSHIP: "Guardianship",
  CAMPAIGNS: "Campaigns",
  SHOP: "Shop",
  REWARDS: "Rewards",
  NEXT: "NEXT",
  OTHER: "Other",
};

/** "Something else": ticking it opens the message box, and its text is required. */
export const OTHER_CASE_ID = "OTH-01";

/** IDs taken out of use. Never tick-able again, never reused. */
export const RETIRED_CASE_IDS: readonly string[] = [];

export type Audience = "public" | "any" | "athlete" | "minor" | "guardian" | "sponsor" | "teammate" | "org" | "seller" | "fan" | "student" | "advisor" | "booth staff";

/** Audiences a visitor sees: nobody in them has a login. */
const VISITOR_AUDIENCES: readonly Audience[] = ["public", "fan", "booth staff"];

/** Each role's audiences, besides `any`. */
export const ROLE_AUDIENCES: Partial<Record<Role, readonly Audience[]>> = {
  ATHLETE: ["athlete", "minor", "seller"],
  GUARDIAN: ["guardian"],
  PROPERTY_MGR: ["org", "seller"],
  SPONSOR_ADMIN: ["sponsor"],
  /* A sponsor's non-admin login — "teammate" in the document. */
  SPONSOR_ANALYST: ["sponsor", "teammate"],
  STUDENT: ["student"],
  ADVISOR: ["advisor"],
};

/** BTG's own people see every case. */
const STAFF: readonly Role[] = ["SUPER_ADMIN", "BTG_ADMIN", "SALES", "CAMPAIGN_MGR", "NETWORK_MGR", "FINANCE"];

type Row = readonly [id: string, text: string, who: string];
type Section = { topic: HelpdeskTopic; section: string | null; cases: readonly Row[] };

/* Generated from documentation/SponsorX-Helpdesk-Cases.md on 2026-11-14; since then edited by hand, alongside the document. */
export const HELPDESK_SECTIONS: readonly Section[] = [
  { topic: "ACCOUNT", section: "Signing up", cases: [
    ["ACC-01", "My application is locked and I can't edit it", "athlete"],
    ["ACC-02", "I need to add my date of birth but can't", "athlete"],
    ["ACC-03", "BTG asked for changes but the link won't let me in", "athlete"],
    ["ACC-04", "My application is \"with BTG\" and I don't know why", "athlete, public"],
    ["ACC-05", "I was flagged as a possible duplicate", "athlete"],
    ["ACC-06", "My application was rejected", "athlete, public"],
    ["ACC-07", "I was approved, then my account was rejected", "athlete"],
    ["ACC-08", "My account is suspended and won't activate", "athlete"],
    ["ACC-09", "I'm approved but not active yet", "athlete"],
    ["ACC-10", "I'm approved but have no login", "athlete, student, guardian"],
    ["ACC-11", "It says too many attempts from my network", "public"],
    ["ACC-12", "My team added me but I never got an email", "athlete"],
    ["ACC-13", "My company already has an account; I need access", "sponsor, public"],
    ["ACC-14", "I forgot to give my business type", "sponsor"],
    ["ACC-15", "My sponsor request is waiting on BTG", "sponsor, public"],
    ["ACC-16", "A sponsor with our name already exists", "sponsor, public"],
    ["ACC-17", "Our sponsor request was declined", "sponsor, public"],
    ["ACC-18", "BTG closed our sponsor account", "sponsor"],
    ["ACC-19", "My request link says not valid or gone", "sponsor, public"],
    ["ACC-20", "Our organisation name is already registered", "org, public"],
    ["ACC-21", "Review says fix it, but I can't edit after submitting", "org"],
    ["ACC-22", "It says our application isn't complete", "org"],
    ["ACC-23", "We're not in the US / state not accepted", "org"],
    ["ACC-24", "Our contact already has a SponsorX login", "org"],
    ["ACC-25", "BTG asked for changes to our application", "org"],
    ["ACC-26", "Our application was rejected", "org, public"],
    ["ACC-27", "We were approved, then rejected", "org"],
    ["ACC-28", "We're suspended and can't create listings", "org"],
    ["ACC-29", "There are no terms for us to accept", "org"],
  ] },
  { topic: "ACCOUNT", section: "Emails and links", cases: [
    ["ACC-30", "I didn't get the confirmation email", "athlete, sponsor, org, public"],
    ["ACC-31", "Resend says it's been sent too many times", "athlete, sponsor, org, public"],
    ["ACC-32", "I typed my email wrong", "athlete, public"],
    ["ACC-33", "I applied on another device and lost my application", "athlete, public"],
    ["ACC-34", "My confirmation link says not valid", "any, public"],
    ["ACC-35", "My link has expired", "any, public"],
    ["ACC-36", "I didn't get my reactivation link", "any, public"],
  ] },
  { topic: "ACCOUNT", section: "Documents and automatic checks", cases: [
    ["ACC-40", "My upload was refused (file type, size or empty)", "any, public"],
    ["ACC-41", "It says my photo is too dark, blurry or small", "any, public"],
    ["ACC-42", "It says my PDF is locked or damaged", "any, public"],
    ["ACC-43", "It says my document hasn't arrived", "any"],
    ["ACC-44", "I can't upload any more documents", "athlete, sponsor, org"],
    ["ACC-45", "My document couldn't be read", "any"],
    ["ACC-46", "It says my name isn't on my document", "any"],
    ["ACC-47", "It says I uploaded the wrong kind of document", "any"],
    ["ACC-48", "It says my ID has expired", "athlete, org signer"],
    ["ACC-49", "It says my date of birth isn't on my ID", "athlete"],
    ["ACC-50", "It won't take my school ID", "athlete (adult)"],
    ["ACC-51", "BTG sent my document back", "athlete, sponsor, org"],
    ["ACC-52", "A required document is missing", "org"],
    ["ACC-53", "We were flagged after removing a document", "org"],
    ["ACC-54", "I can't change our documents here", "org"],
  ] },
  { topic: "ACCOUNT", section: "Signing in", cases: [
    ["ACC-60", "I signed in but it says my account isn't set up", "any"],
    ["ACC-61", "I signed in with a different email than I applied with", "any"],
    ["ACC-62", "I applied but can't sign in yet", "any, public"],
    ["ACC-63", "My account was closed and I can't sign in", "any"],
    ["ACC-64", "I was removed from my company's team", "teammate"],
    ["ACC-65", "I forgot my password or code", "any, public"],
    ["ACC-66", "We're approved: which email do I sign in with?", "sponsor, org"],
  ] },
  { topic: "ACCOUNT", section: "Profile changes", cases: [
    ["ACC-70", "I can't edit my profile yet", "athlete"],
    ["ACC-71", "My legal name change needs an ID", "athlete"],
    ["ACC-72", "My new legal name isn't showing yet", "athlete"],
    ["ACC-73", "The ID for my name change was refused", "athlete"],
    ["ACC-74", "My name change is held by the ID check", "athlete"],
    ["ACC-75", "BTG declined or sent back my name change", "athlete"],
    ["ACC-76", "I need to change my email or phone", "any"],
    ["ACC-77", "We need to change our name or main contact", "org"],
    ["ACC-78", "I want to choose which emails I get", "any"],
  ] },
  { topic: "ACCOUNT", section: "Sponsor team and organisation roster", cases: [
    ["ACC-80", "My teammate never got the invite", "teammate, sponsor"],
    ["ACC-81", "My invite is refused: that address has a login", "sponsor"],
    ["ACC-82", "I can't re-invite someone we removed", "sponsor"],
    ["ACC-83", "Our only admin has left the company", "sponsor, teammate"],
    ["ACC-84", "The invite went to the wrong address", "sponsor"],
    ["ACC-85", "I'm read-only and can't do anything", "teammate"],
    ["ACC-86", "Invites or resends are rate-limited", "sponsor"],
    ["ACC-87", "I can't accept a team invitation", "athlete"],
    ["ACC-88", "We can't add or invite athletes", "org"],
  ] },
  { topic: "ACCOUNT", section: "Closing or reopening an account", cases: [
    ["ACC-90", "I want to close my account but can't", "sponsor, teammate, student"],
    ["ACC-91", "My request to close is waiting for BTG", "athlete, org"],
    ["ACC-92", "BTG declined my request to close", "athlete, org"],
    ["ACC-93", "I want my account back", "any, public"],
    ["ACC-94", "Reactivate is refused: BTG closed it", "any, public"],
    ["ACC-95", "The 30 days to come back have passed", "any, public"],
    ["ACC-96", "I'm back, but my listings are still paused", "athlete, org"],
    ["ACC-97", "I asked BTG to look again and nothing happened", "sponsor, org, public"],
    ["ACC-98", "I want my data deleted or a copy of it", "any, public"],
  ] },
  { topic: "ACCOUNT", section: "Agreements and confirmations", cases: [

  ] },
  { topic: "PAYMENT", section: "Paying (checkout)", cases: [
    ["PAY-01", "The Pay button is greyed out", "sponsor"],
    ["PAY-02", "My order has no pay-by date", "sponsor"],
    ["PAY-03", "Payments reopened and now I only have 3 days", "sponsor"],
    ["PAY-04", "I can't pay until my order is approved", "sponsor"],
    ["PAY-05", "The payment page wouldn't open", "sponsor"],
    ["PAY-06", "It said \"BTG has the details\" and wouldn't open", "sponsor"],
    ["PAY-07", "My card was declined", "sponsor"],
    ["PAY-08", "The payment page expired before I finished", "sponsor"],
    ["PAY-09", "My bank's extra security check failed", "sponsor"],
    ["PAY-10", "I paid but it still says \"confirming\"", "sponsor"],
    ["PAY-11", "I was charged but it says the payment failed", "sponsor"],
    ["PAY-12", "I was charged a different amount", "sponsor"],
    ["PAY-13", "I paid twice for the same order", "sponsor"],
    ["PAY-14", "I paid after my order was cancelled", "sponsor"],
    ["PAY-15", "The total changed when I placed the order", "sponsor"],
    ["PAY-16", "My billing details were refused", "sponsor"],
    ["PAY-17", "Why is there a fee on top of my order?", "sponsor"],
    ["PAY-18", "I never got my receipt", "sponsor"],
    ["PAY-19", "I paid by bank transfer or cheque; it isn't showing", "sponsor"],
    ["PAY-20", "I paid the invoice but the order is still unpaid", "sponsor"],
    ["PAY-21", "I paid less than the invoice, or in another currency", "sponsor"],
    ["PAY-22", "I paid the invoice after the order was cancelled", "sponsor"],
    ["PAY-23", "What is my spending limit?", "sponsor"],
  ] },
  { topic: "PAYMENT", section: "Refunds", cases: [
    ["PAY-30", "Where is my refund?", "sponsor"],
    ["PAY-31", "My refund went to my card; when will I see it?", "sponsor"],
    ["PAY-32", "Stripe couldn't refund my card", "sponsor"],
    ["PAY-33", "My refund is delayed", "sponsor"],
    ["PAY-34", "My refund is refused because I disputed the charge", "sponsor"],
    ["PAY-35", "My refund is blocked by a payout in progress", "sponsor"],
    ["PAY-36", "I need a credit note for a refunded invoice", "sponsor"],
    ["PAY-37", "The NEXT edition I bought ads in was cancelled", "sponsor"],
    ["PAY-38", "My spending limit stopped rising after a refund", "sponsor"],
  ] },
  { topic: "PAYMENT", section: "Payouts (shop and marketplace sales, through Stripe)", cases: [
    ["PAY-40", "I can't set up payouts yet", "seller"],
    ["PAY-41", "The Stripe set-up page won't open", "seller"],
    ["PAY-42", "Payout set-up says my login has no email", "seller"],
    ["PAY-43", "My payout account isn't set up", "seller"],
    ["PAY-44", "Stripe says it needs more information", "seller"],
    ["PAY-45", "Stripe rejected or closed my payout account", "seller"],
    ["PAY-46", "It says nothing is ready to pay out", "seller"],
    ["PAY-47", "My money is waiting for the sponsor to pay", "seller"],
    ["PAY-48", "My money is held: the sponsor reported a problem", "seller"],
    ["PAY-49", "My money is held while BTG reviews a payment", "seller"],
    ["PAY-50", "My payout is being reviewed by BTG", "seller"],
    ["PAY-51", "BTG sent my payout back", "seller"],
    ["PAY-52", "My payout was cancelled because the sponsor was refunded", "seller"],
    ["PAY-53", "My payout is approved but hasn't been sent", "seller"],
    ["PAY-54", "My payout failed and will be retried", "seller"],
    ["PAY-55", "It says fix my payout account", "seller"],
    ["PAY-56", "My bank returned my payout", "seller"],
    ["PAY-57", "My payout failed and BTG is looking into it", "seller"],
    ["PAY-58", "It says paid, but nothing reached my bank", "seller"],
    ["PAY-59", "Part of my payout was taken back", "seller"],
    ["PAY-60", "It says I owe money back", "seller"],
    ["PAY-61", "My payouts are on hold since my account was closed or rejected", "seller"],
    ["PAY-62", "I closed my account and I'm still owed money", "seller"],
  ] },
  { topic: "PAYMENT", section: "Tax forms", cases: [
    ["PAY-70", "Where do I give my W-9 / W-8?", "seller"],
    ["PAY-71", "Stripe wants tax information before paying me", "seller"],
    ["PAY-72", "My payout failed: tax ID doesn't match", "seller"],
    ["PAY-73", "Why doesn't SponsorX ask for my tax ID on campaign earnings?", "athlete"],
    ["PAY-74", "Where is my 1099?", "seller"],
  ] },
  { topic: "PAYMENT", section: "Campaign earnings (paid by BTG Finance outside SponsorX)", cases: [
    ["PAY-80", "My earning is still in review", "athlete"],
    ["PAY-81", "My earning cleared but isn't approved", "athlete"],
    ["PAY-82", "My earning is approved: when am I paid?", "athlete"],
    ["PAY-83", "It says paid, but I haven't received it", "athlete"],
    ["PAY-84", "My earning is on hold or disputed", "athlete"],
    ["PAY-85", "My earning is held because of a complaint about my deal", "athlete"],
    ["PAY-86", "My deal was cancelled midway: what am I owed?", "athlete"],
    ["PAY-87", "My earning disappeared", "athlete"],
    ["PAY-88", "My earning amount changed", "athlete"],
    ["PAY-89", "My share or commission looks wrong", "athlete, org"],
  ] },
  { topic: "PAYMENT", section: "Invoices (Zoho)", cases: [
    ["PAY-90", "How do I pay this invoice?", "sponsor"],
    ["PAY-91", "My invoice shows overdue", "sponsor"],
    ["PAY-92", "I paid but the invoice still shows unpaid", "sponsor"],
    ["PAY-93", "An invoice is missing from my list", "sponsor"],
    ["PAY-94", "My invoice says withdrawn or partly paid", "sponsor"],
    ["PAY-95", "I can't see our invoices", "teammate"],
  ] },
  { topic: "PAYMENT", section: "Card disputes (chargebacks)", cases: [
    ["PAY-97", "I disputed a charge with my bank", "sponsor"],
    ["PAY-98", "My bank decided, but it still shows open", "sponsor"],
    ["PAY-99", "The sponsor won a chargeback and now I owe money", "seller"],
  ] },
  { topic: "GUARDIANSHIP", section: "The guardian's email and link", cases: [
    ["GRD-01", "My guardian never got the set-up email", "minor, public"],
    ["GRD-02", "I resent it many times; now it says contact BTG", "minor, public"],
    ["GRD-03", "I typed my guardian's email wrong", "minor, public"],
    ["GRD-04", "I need to change my guardian, but they're approved", "minor"],
    ["GRD-05", "It won't accept my guardian's email", "minor, public"],
    ["GRD-06", "My set-up link has expired", "guardian, public"],
    ["GRD-07", "My link says I'm no longer this athlete's guardian", "guardian, public"],
    ["GRD-08", "The page shows another child's or old details", "guardian"],
    ["GRD-09", "A second child named me; it only asks for proof", "guardian"],
    ["GRD-10", "I'm approved but can't sign in as a guardian", "guardian"],
    ["GRD-11", "I need to add a guardian after approval", "minor"],
  ] },
  { topic: "GUARDIANSHIP", section: "Guardian verification", cases: [
    ["GRD-20", "Everything is in but we're still waiting", "minor, guardian"],
    ["GRD-21", "My ID or proof was flagged", "guardian"],
    ["GRD-22", "BTG sent my document back", "guardian"],
    ["GRD-23", "My proof must name my child; upload refused", "guardian"],
    ["GRD-24", "I can't edit my details now I'm approved", "guardian"],
    ["GRD-25", "My guardian account was closed by BTG", "guardian"],
    ["GRD-26", "My account was rejected because of my guardian", "minor"],
    ["GRD-27", "I'm verified for one child; the other is still pending", "guardian"],
    ["GRD-28", "My details were held and nothing happens", "guardian (named late)"],
    ["GRD-29", "I'm signed in but don't see my child", "guardian"],
    ["GRD-30", "My state isn't recognised, so I'm treated as 18", "athlete"],
  ] },
  { topic: "GUARDIANSHIP", section: "Consent and agreements", cases: [
    ["GRD-40", "The agreement won't accept: \"text has changed\"", "guardian"],
    ["GRD-41", "It says my child is an adult, no agreement needed", "guardian"],
    ["GRD-42", "I can't accept agreements or confirm rules myself", "minor"],
    ["GRD-43", "Deals are blocked until rules or agreements are confirmed", "minor, guardian"],
    ["GRD-44", "Acceptance refused: my guardian must authorise", "minor"],
    ["GRD-45", "My child can't be featured: consent not recorded", "guardian"],
    ["GRD-46", "I want to withdraw consent for my child", "guardian"],
    ["GRD-47", "I can't close my own account", "minor"],
  ] },
  { topic: "GUARDIANSHIP", section: "Changing guardian (handoff)", cases: [
    ["GRD-50", "I can't find my child on the handoff page", "guardian (new), public"],
    ["GRD-51", "My child is 18 but a minor in our state; not found", "guardian (new), public"],
    ["GRD-52", "It says my email belongs to someone else on SponsorX", "guardian (new)"],
    ["GRD-53", "I never got the confirm email and can't restart", "guardian (new)"],
    ["GRD-54", "My handoff link has expired", "guardian (new)"],
    ["GRD-55", "My upload was refused", "guardian (new)"],
    ["GRD-56", "BTG sent my handoff document back", "guardian (new)"],
    ["GRD-57", "The current guardian isn't answering", "guardian (new)"],
    ["GRD-58", "My request was declined", "guardian (new)"],
    ["GRD-59", "I handed off but nothing changed", "guardian (current)"],
    ["GRD-60", "The switch failed: the new guardian's login is in use", "guardian"],
    ["GRD-61", "There's a guardian request I can't answer", "minor"],
    ["GRD-62", "Our guardian can't be reached; BTG must replace them", "guardian, minor"],
    ["GRD-63", "Payouts stopped after the guardian changed", "guardian"],
  ] },
  { topic: "GUARDIANSHIP", section: "Coming of age", cases: [
    ["GRD-70", "I turned 18 (or my state's age): what now?", "athlete"],
    ["GRD-71", "I never got the coming-of-age email", "athlete"],
    ["GRD-72", "\"Send link\" fails: no email, or sent too many", "guardian"],
    ["GRD-73", "New deals and listings are paused", "athlete, guardian"],
    ["GRD-74", "I uploaded my ID but it's still checking", "athlete"],
    ["GRD-75", "BTG sent my ID back and my account is ending", "athlete"],
    ["GRD-76", "My account was ended after 90 days", "athlete"],
    ["GRD-77", "It's too late to come back", "athlete"],
    ["GRD-78", "My guardian login stopped when my child turned 18", "guardian"],
    ["GRD-79", "I took over, but payouts stopped", "athlete"],
    ["GRD-80", "My date of birth or state change is waiting for BTG", "minor"],
    ["GRD-81", "I'm 18 but treated as a minor", "athlete (AL, NE, MS, PR)"],
  ] },
  { topic: "GUARDIANSHIP", section: "What a minor can't do while waiting", cases: [
    ["GRD-90", "I can't accept offers or invitations myself", "minor"],
    ["GRD-91", "I can't list items myself", "minor"],
    ["GRD-92", "I can't set up or request payouts myself", "minor"],
    ["GRD-93", "It says \"once your guardian set-up is finished\"", "guardian"],
    ["GRD-94", "I'm not getting any offers", "minor"],
    ["GRD-95", "My content always waits for BTG review", "minor"],
    ["GRD-96", "I picked one child and it shows another", "guardian (several children)"],
  ] },
  { topic: "CAMPAIGNS", section: "Briefs and requests", cases: [
    ["CMP-01", "I haven't heard back about my brief", "sponsor"],
    ["CMP-02", "My brief is waiting because no athletes fit yet", "sponsor"],
    ["CMP-03", "My budget is below the package price", "sponsor"],
    ["CMP-04", "My campaign dates weren't accepted", "sponsor"],
    ["CMP-05", "My objective is too short", "sponsor"],
    ["CMP-06", "My custom request needs pricing", "sponsor"],
    ["CMP-07", "My brand category needs extra review", "sponsor"],
    ["CMP-08", "My account standing is holding my brief", "sponsor"],
    ["CMP-09", "I can't edit my request any more", "sponsor"],
    ["CMP-10", "My request was closed and I don't know why", "sponsor"],
    ["CMP-11", "I want to reopen a closed request", "sponsor"],
    ["CMP-12", "The student code on my brief isn't accepted", "sponsor"],
  ] },
  { topic: "CAMPAIGNS", section: "Staffing, offers and invitations", cases: [
    ["CMP-20", "My campaign still says \"being set up\"", "sponsor"],
    ["CMP-21", "Not enough athletes have signed", "sponsor"],
    ["CMP-22", "Staffing stopped: my budget ran out", "sponsor"],
    ["CMP-23", "I'm still waiting for athletes to accept", "sponsor"],
    ["CMP-24", "My campaign hasn't launched", "sponsor"],
    ["CMP-25", "My invitation expired before I answered", "athlete"],
    ["CMP-26", "My offer expired before I accepted", "athlete"],
    ["CMP-27", "I asked for changes to an offer and heard nothing", "athlete"],
    ["CMP-28", "I was told a revised offer is coming; nothing yet", "athlete"],
    ["CMP-29", "I can't answer: the offer was withdrawn", "athlete"],
    ["CMP-30", "Accept failed: the terms changed", "athlete"],
    ["CMP-31", "A brand restriction blocks this offer", "athlete"],
    ["CMP-32", "My item is no longer available for this offer", "athlete"],
    ["CMP-33", "It says I already have this order", "athlete"],
    ["CMP-34", "I can't accept my campaign order", "athlete"],
    ["CMP-35", "My order was cancelled with the campaign", "athlete"],
  ] },
  { topic: "CAMPAIGNS", section: "Content (deliverables)", cases: [
    ["CMP-40", "The automatic check sent my draft back", "athlete"],
    ["CMP-41", "It says my caption needs #ad", "athlete"],
    ["CMP-42", "My file type isn't accepted", "athlete"],
    ["CMP-43", "My caption is too long", "athlete"],
    ["CMP-44", "It says my upload wasn't for this deliverable", "athlete"],
    ["CMP-45", "I can't resubmit while it's being reviewed", "athlete"],
    ["CMP-46", "My draft has waited days for BTG", "athlete"],
    ["CMP-47", "The sponsor hasn't reviewed my draft", "athlete"],
    ["CMP-48", "A revision was asked for: what do I change?", "athlete"],
    ["CMP-49", "I can't approve: BTG is still reviewing", "sponsor"],
    ["CMP-50", "I want to reject this content outright", "sponsor"],
    ["CMP-51", "It wants a link to mark my post published", "athlete"],
    ["CMP-52", "My post is live but not verified", "athlete, sponsor"],
    ["CMP-53", "My athletes' content is late", "sponsor"],
    ["CMP-54", "It says the deliverable changed; reload", "athlete, sponsor"],
  ] },
  { topic: "CAMPAIGNS", section: "Results and reports", cases: [
    ["CMP-60", "My campaign is delivering less than promised", "sponsor"],
    ["CMP-61", "My final report is \"still being prepared\"", "sponsor"],
    ["CMP-62", "My results show no data", "sponsor"],
  ] },
  { topic: "CAMPAIGNS", section: "Changes, cancellations and disputes", cases: [
    ["CMP-70", "My change or cancel request is waiting for BTG", "sponsor"],
    ["CMP-71", "I can't cancel or change a campaign in reporting", "sponsor"],
    ["CMP-72", "I can't lower the budget below what's committed", "sponsor"],
    ["CMP-73", "A request is already with BTG", "sponsor"],
    ["CMP-74", "BTG declined my change request", "sponsor"],
    ["CMP-75", "Only my admin can change or cancel the campaign", "teammate"],
    ["CMP-76", "My deal is paused for documents", "athlete"],
    ["CMP-77", "I sent documents; it's still paused", "athlete"],
    ["CMP-78", "My dispute document was refused", "athlete"],
    ["CMP-79", "My deal was cancelled after a review", "athlete"],
    ["CMP-80", "My campaign content is frozen with no reason", "sponsor"],
    ["CMP-81", "I want to raise a concern about a deal", "sponsor, guardian, public"],
  ] },
  { topic: "SHOP", section: "Listings (selling)", cases: [
    ["SHP-01", "My listing is waiting for BTG approval", "seller"],
    ["SHP-02", "My listing was held for restricted words", "seller"],
    ["SHP-03", "It says BTG is checking my account", "seller"],
    ["SHP-04", "It's held because I cancelled sold sessions", "seller"],
    ["SHP-05", "BTG paused my listing", "seller"],
    ["SHP-06", "BTG sent back or rejected my listing", "seller"],
    ["SHP-07", "Submit refused: \"not publishable yet\"", "seller"],
    ["SHP-08", "I can't change the price while it's live", "seller"],
    ["SHP-09", "My item was rejected", "seller"],
    ["SHP-10", "I can't list: not approved or on a team", "athlete"],
    ["SHP-11", "We can't create listings yet", "org"],
    ["SHP-12", "My athlete's own listing blocks our team listing", "org"],
    ["SHP-13", "This item already has a live listing", "seller"],
    ["SHP-14", "Our listing won't go live: the athlete left our team", "org"],
  ] },
  { topic: "SHOP", section: "Buying (cart and orders)", cases: [
    ["SHP-20", "My order is stuck waiting for the seller", "sponsor"],
    ["SHP-21", "My order is waiting for BTG (over my limit)", "sponsor"],
    ["SHP-22", "The seller declined my order", "sponsor"],
    ["SHP-23", "My order was cancelled: the seller never answered", "sponsor"],
    ["SHP-24", "BTG rejected my order", "sponsor"],
    ["SHP-25", "My order was cancelled because I didn't pay", "sponsor"],
    ["SHP-26", "I can't cancel after paying", "sponsor"],
    ["SHP-27", "Cancel is blocked while my card payment confirms", "sponsor"],
    ["SHP-28", "My 48 hours to accept the order ran out", "seller"],
    ["SHP-29", "My sale was cancelled: the sponsor never paid", "seller"],
    ["SHP-30", "My checkout hold expired", "sponsor"],
    ["SHP-31", "My cart expired or is locked", "sponsor"],
    ["SHP-32", "An item in my cart isn't available any more", "sponsor"],
    ["SHP-33", "I can't buy: my brand category isn't set", "sponsor"],
    ["SHP-34", "This item is restricted for my category", "sponsor"],
    ["SHP-35", "The price is below the owner's price", "sponsor"],
    ["SHP-36", "I can't place the order: terms unavailable", "sponsor"],
    ["SHP-37", "The terms changed during checkout", "sponsor"],
    ["SHP-38", "My order won't complete: a line is open", "sponsor, seller"],
  ] },
  { topic: "SHOP", section: "Delivery problems and cancelling lines", cases: [
    ["SHP-40", "The seller marked it delivered, but it's wrong", "sponsor"],
    ["SHP-41", "I missed the 24 hours to report a problem", "sponsor"],
    ["SHP-42", "The seller hasn't delivered and the date has passed", "sponsor"],
    ["SHP-43", "A sponsor reported a problem: I have 72 hours", "seller"],
    ["SHP-44", "I missed my 72 hours; it went to BTG", "seller"],
    ["SHP-45", "I disagree with the seller's answer", "sponsor"],
    ["SHP-46", "I didn't answer the seller in time", "sponsor"],
    ["SHP-47", "When will BTG decide my problem?", "sponsor, seller"],
    ["SHP-48", "Can I cancel a line for free?", "sponsor"],
    ["SHP-49", "Cancelling needs the seller's agreement now", "sponsor"],
    ["SHP-50", "Too late to cancel: the first date started", "sponsor"],
    ["SHP-51", "The seller declined or ignored my cancel request", "sponsor"],
    ["SHP-52", "Only my admin can cancel a line", "teammate"],
    ["SHP-53", "I can't mark it delivered", "seller"],
    ["SHP-54", "My proof photo won't upload", "seller"],
    ["SHP-55", "I can't deliver a sold line", "seller"],
  ] },
  { topic: "REWARDS", section: "The QR page and the booth", cases: [
    ["RWD-01", "It says this code isn't valid", "fan, public"],
    ["RWD-02", "The reward isn't active right now", "fan, public"],
    ["RWD-03", "The reward has expired", "fan, public"],
    ["RWD-04", "It says my code was already used", "fan, public"],
    ["RWD-05", "The reward has run out", "fan, public"],
    ["RWD-06", "My hold ran out before I got to the booth", "fan, public"],
    ["RWD-07", "It asks me to tick a box to get my code by email", "fan, public"],
    ["RWD-08", "The booth says claim first", "fan, public"],
    ["RWD-09", "It asks for a staff code", "booth staff, public"],
    ["RWD-10", "Wrong staff code; now it's locked", "booth staff, public"],
    ["RWD-11", "We lost the booth staff code", "sponsor"],
    ["RWD-12", "We redeemed by mistake and can't undo it", "booth staff"],
    ["RWD-13", "It says someone just redeemed or it sold out", "fan, public"],
    ["RWD-14", "The reward service is busy", "fan, public"],
    ["RWD-15", "The merchant ran out: please pause our reward", "sponsor"],
    ["RWD-16", "Our reward expired and can't be relaunched", "sponsor"],
    ["RWD-17", "I don't have my fan reward QR code", "athlete"],
    ["RWD-18", "Fans scan but nobody redeems", "sponsor"],
  ] },
  { topic: "REWARDS", section: "Fan emails", cases: [
    ["RWD-20", "I claimed but never got my code email", "fan, public"],
    ["RWD-21", "I want to stop reward emails", "fan, public"],
    ["RWD-22", "The unsubscribe link didn't work", "fan, public"],
    ["RWD-23", "The sponsor still contacts me after I unsubscribed", "fan, public"],
    ["RWD-24", "My old email link no longer finds my claim", "fan, public"],
  ] },
  { topic: "NEXT", section: null, cases: [
    ["NXT-01", "I applied and heard nothing", "student, public"],
    ["NXT-02", "My application is held: roster problem", "student"],
    ["NXT-03", "It's held: no school email, or age unknown", "student"],
    ["NXT-04", "My school asked for changes but I can't edit", "student"],
    ["NXT-05", "I'm under 18 and my application is refused", "student, public"],
    ["NXT-06", "My school isn't found", "student, public"],
    ["NXT-07", "I'm approved but can't do anything", "student"],
    ["NXT-08", "I'm approved but have no login", "student"],
    ["NXT-09", "I've been suspended or marked as left", "student"],
    ["NXT-10", "My child's NEXT application was never sent to me", "guardian"],
    ["NXT-11", "I claimed my profile and heard nothing", "athlete (featured)"],
    ["NXT-12", "The school says it can't verify me", "athlete (featured)"],
    ["NXT-13", "My claim was rejected and nobody told me", "athlete (featured)"],
    ["NXT-14", "My ad artwork failed the automatic checks", "sponsor"],
    ["NXT-15", "My artwork title has restricted words", "sponsor"],
    ["NXT-16", "I can't replace my artwork", "sponsor"],
    ["NXT-17", "My artwork is locked: the edition is in production", "sponsor"],
  ] },
  { topic: "OTHER", section: null, cases: [
    ["OTH-01", "Something else", "any, public"],
  ] },
];

export type HelpdeskCase = {
  id: string;
  topic: HelpdeskTopic;
  section: string | null;
  /** The words the person ticks. */
  text: string;
  /** The "Who" column as written. */
  who: string;
  audiences: Audience[];
  /** Shown before sign-in. */
  public: boolean;
};

/** "athlete (AL, NE, MS, PR), public" → athlete, public: commas inside brackets don't split. */
function audiencesOf(who: string): Audience[] {
  const parts: string[] = [];
  let depth = 0, cur = "";
  for (const ch of who) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => {
    const a = p.replace(/\(.*\)/, "").trim();
    return (a === "org signer" ? "org" : a) as Audience;
  });
}

export const HELPDESK_CASES: readonly HelpdeskCase[] = HELPDESK_SECTIONS.flatMap((s) => s.cases.map(([id, text, who]) => {
  const audiences = audiencesOf(who);
  return { id, topic: s.topic, section: s.section, text, who, audiences, public: audiences.some((a) => VISITOR_AUDIENCES.includes(a)) };
}));

const BY_ID = new Map(HELPDESK_CASES.map((c) => [c.id, c]));

export const helpdeskCase = (id: string): HelpdeskCase | undefined => BY_ID.get(id);

/** Who is filling in the form: nobody signed in, or a signed-in person's roles. */
export type HelpdeskViewer = { roles: readonly Role[] } | null;

/** May this person see (and so tick) this case? */
export function canSeeCase(viewer: HelpdeskViewer, c: HelpdeskCase): boolean {
  if (!viewer) return c.public;
  if (viewer.roles.some((r) => STAFF.includes(r))) return true;
  const mine = new Set<Audience>(["any", ...viewer.roles.flatMap((r) => ROLE_AUDIENCES[r] ?? [])]);
  return c.audiences.some((a) => mine.has(a));
}

/**
 * GET /public/support/cases — the topics, each with the cases this person
 * may tick, grouped by section in the document's order. A topic with none
 * of theirs still shows, empty: "Something else" is always on Other.
 */
export function helpdeskFor(viewer: HelpdeskViewer, only?: HelpdeskTopic) {
  return HELPDESK_TOPICS.filter((t) => !only || t === only).map((key) => ({
    key,
    label: HELPDESK_TOPIC_LABELS[key],
    sections: HELPDESK_SECTIONS.filter((s) => s.topic === key)
      .map((s) => ({
        title: s.section,
        cases: s.cases.map(([id]) => BY_ID.get(id)!).filter((c) => canSeeCase(viewer, c)).map((c) => ({ id: c.id, text: c.text })),
      }))
      .filter((s) => s.cases.length > 0),
  }));
}

/**
 * The ticked cases, checked: each must exist, not be retired, be on the
 * chosen topic ("Something else" goes with any topic) and be one this person
 * may see. Returns the problem in words, or null.
 */
export function refusedCases(viewer: HelpdeskViewer, topic: HelpdeskTopic, ids: readonly string[]): string | null {
  for (const id of ids) {
    const c = BY_ID.get(id);
    if (!c || RETIRED_CASE_IDS.includes(id)) return `${id} isn't one of the help desk's cases.`;
    if (c.id !== OTHER_CASE_ID && c.topic !== topic) return `${id} isn't under ${HELPDESK_TOPIC_LABELS[topic]}.`;
    if (!canSeeCase(viewer, c)) return viewer ? `${id} isn't a case for your account.` : `${id} is only for signed-in accounts. Sign in to choose it.`;
  }
  return null;
}

/** A stored case ID as the inbox labels it: today's words, or marked retired. */
export function caseLabel(id: string) {
  const c = BY_ID.get(id);
  return c && !RETIRED_CASE_IDS.includes(id)
    ? { id, topic: c.topic, text: c.text, retired: false }
    : { id, topic: null, text: null, retired: true };
}
