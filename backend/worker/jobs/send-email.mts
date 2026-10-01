/**
 * The email job handler — P3-INT-01, G-04, Guide §10.
 *
 * **The only file in the repo that imports the email vendor.** G-04 chose
 * Resend, and `stack-decision.md` keeps that decision revisitable; a swap to
 * Postmark or SES should change this file and nothing else. The domain layer
 * calls `send()` in `src/lib/email.ts`, which writes an outbox row and knows
 * no vendor at all.
 *
 * Raw `pg` rather than Prisma, matching the worker entry: this process is not
 * bundled and the generated client is ESM-syntax TypeScript.
 *
 * ── WHY THIS HANDLER KEEPS ITS OWN LEDGER ───────────────────────────────────
 *
 * The outbox drain is at-least-once (P2-BE-05): it sends to pg-boss, then
 * marks rows dispatched, so a crash between those steps re-delivers. pg-boss
 * itself also retries a failed job. Both are correct, and both mean this
 * handler can be asked to send the same message more than once.
 *
 * So before sending it claims the message's `idempotencyKey` with an INSERT
 * that will conflict on a second attempt. Claiming *before* sending rather
 * than recording after is the important ordering: recording after leaves a
 * window where the email went out and the crash happened before the note,
 * which sends twice. Claiming first can at worst lose a message when the
 * vendor call fails after the claim — so a failed send releases the claim.
 */

import pg from "pg";

import { MUTABLE_EVENTS } from "../../src/domain/notification-rules.ts";

export type EmailJob = {
  tenantId: string;
  template: string;
  to: string;
  data: Record<string, string>;
  idempotencyKey: string;
  /** Fan emails only (P6-SEC-03): the claim whose consent this send relies on. */
  fanEventId?: string;
  /** 2S1-BE-16 — a support message replies to its sender, keeps its thread,
   *  and carries its private attachments (read here, at send time). */
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; key: string; contentType: string }[];
};

/** Reads a private-bucket object for an attachment. Injected so the handler
 *  stays testable without storage; the worker passes getPrivateObject. */
export type AttachmentLoader = (key: string) => Promise<Buffer>;

/**
 * Subject and body per template. Data, not code, so adding a message is a
 * table entry — and so that someone who is not a developer can be asked
 * whether the wording is right.
 *
 * Plain text only in Phase 1. HTML mail brings a rendering pipeline, inlined
 * CSS and a preview tool, none of which the loop in §39 needs to work.
 */
/** 2S1-BE-16 — the support address every rejection names: the sender's own
 *  value if the caller passed one, else SUPPORT_EMAIL, else the default. */
const supportAddress = (d: Record<string, string>) => d.supportEmail ?? process.env.SUPPORT_EMAIL ?? "support@sponsorx.net";

const TEMPLATES: Record<string, (d: Record<string, string>) => { subject: string; text: string }> = {
  "athlete.applicationReceived": (d) => ({
    subject: "We have your SponsorX application",
    /* 2S1-BE-09 — the receipt carries the confirmation link; most athletes are then approved by the checks. */
    text: `Hi ${d.firstName ?? "there"},\n\nThanks for applying to the SponsorX Athlete Network.${d.confirmUrl ? `\n\nFirst, confirm this is your email address:\n\n${d.confirmUrl}\n\nOnce your email is confirmed and your ID is uploaded, most applications are approved straight away.` : ""}\n\nWe will email you as soon as there is a decision.\n\n— BTG SponsorX`,
  }),
  "athlete.approved": (d) => ({
    subject: "You are in — welcome to the SponsorX Athlete Network",
    text: `Hi ${d.firstName ?? "there"},\n\nYour application has been approved. Sign in with this email address and complete your profile here:\n\n${d.portalUrl ?? ""}\n\nThe more complete your profile, the more campaigns you will be matched with.\n\n— BTG SponsorX`,
  }),
  "athlete.changesRequested": (d) => ({
    subject: "One thing to fix on your SponsorX application",
    text: `Hi ${d.firstName ?? "there"},\n\nWe need a change before we can approve your application:\n\n${d.reviewerNotes ?? "Please check your application for missing details."}\n\nUpdate it here and resubmit — you do not need to start again:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* P3-BE-16 — the decision on a profile change the athlete proposed. */
  "athlete.profileChangeApproved": (d) => ({
    subject: "Your SponsorX profile change is live",
    text: `Hi ${d.firstName ?? "there"},

The change you sent to your profile (${d.sections ?? "your profile"}) has been approved and is now live.

${d.portalUrl ?? ""}

— BTG SponsorX`,
  }),
  "athlete.profileChangeDeclined": (d) => ({
    subject: "About the change to your SponsorX profile",
    text: `Hi ${d.firstName ?? "there"},

We couldn't approve the change you sent to your profile (${d.sections ?? "your profile"}):

${d.reviewerNotes ?? ""}

Your profile is unchanged. You can send a new change from your portal:

${d.portalUrl ?? ""}

— BTG SponsorX`,
  }),
  "athlete.rejected": (d) => ({
    subject: "About your SponsorX application",
    text: `Hi ${d.firstName ?? "there"},\n\nWe are not able to approve your application at this time.\n\n${d.reviewerNotes ?? ""}\n\nThis is not necessarily permanent — the network grows, and sponsor demand changes by sport and region.\n\nQuestions? Contact BTG support at ${supportAddress(d)}.\n\n— BTG SponsorX`,
  }),
  "invitation.sent": (d) => ({
    subject: `${d.sponsorName ?? "A sponsor"} wants to work with you`,
    text: `Hi ${d.firstName ?? "there"},\n\nYou have a new campaign invitation${d.sponsorName ? ` from ${d.sponsorName}` : ""}.\n\n${d.jobName ?? "The work"}${d.offered ? ` — ${d.offered}` : ""}\n\nOpen it to see the full terms and decide:\n\n${d.portalUrl ?? ""}\n\nIt expires on ${d.expiresOn ?? "the date shown in your portal"}.\n\n— BTG SponsorX`,
  }),
  /* 2S5-INT-02 — the sponsor's receipt, sent once the payment provider
     confirms the card payment. No card details: SponsorX never had them. */
  "payment.received": (d) => ({
    subject: `Payment received for order ${d.orderRef ?? ""} — ${d.amount ?? ""}`,
    text: `Your card payment for order ${d.orderRef ?? ""} has been confirmed by our payment provider.\n\n${d.lines ?? ""}\n\nPaid: ${d.amount ?? ""}\n\nYour order is now in delivery. View it here:\n\n${d.orderUrl ?? ""}\n\nYou paid on the payment provider's secure page. SponsorX never sees your card, and this email never includes card details.\n\n— BTG SponsorX`,
  }),
  /* 2S5-BE-05 — a payee's payout, from BTG's decision to the money arriving. */
  "payout.approved": (d) => ({
    subject: `BTG approved your payout of ${d.amount ?? ""}`,
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has approved your payout of ${d.amount ?? ""}. It's on its way to your payout account — we'll email you again when it has been paid.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "payout.paid": (d) => ({
    subject: `Your payout of ${d.amount ?? ""} has been paid`,
    text: `Hi ${d.firstName ?? "there"},\n\nYour payout of ${d.amount ?? ""} has been paid, confirmed by our payment provider. It may take a few days to show in your bank.\n\nWhat it covers:\n${d.orders ?? ""}\n\nView it in SponsorX:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "payout.sentBack": (d) => ({
    subject: "About your SponsorX payout request",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG couldn't approve your payout request of ${d.amount ?? ""} yet:\n\n${d.note ?? ""}\n\nThe money is still yours and available to request again from your portal:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),

  /* 2S4-BE-06 — a seller's sale: approved, then paid. Their own lines only;
     never another seller's, never a share that isn't theirs. */
  "sale.approved": (d) => ({
    subject: `New sale: ${d.sponsorName ?? "a sponsor"} ordered from you (${d.orderRef ?? ""})`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.sponsorName ?? "A sponsor"} has ordered from you, and the order is approved (${d.orderRef ?? ""}):\n\n${d.lines ?? ""}\n\nWe'll email you again when they have paid — that's when you deliver, and when their contact details appear on the order.\n\n${d.ordersUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "sale.paid": (d) => ({
    subject: `${d.sponsorName ?? "The sponsor"} has paid — time to deliver (${d.orderRef ?? ""})`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.sponsorName ?? "The sponsor"} has paid for order ${d.orderRef ?? ""}:\n\n${d.lines ?? ""}\n\nTheir contact details are on the order now. When you have delivered, mark each line delivered with a short note — they then have 24 hours to confirm or report a problem.\n\n${d.ordersUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* 2S4-BE-07 / -08 — delivery. */
  "delivery.marked": (d) => ({
    subject: `${d.sellerName ?? "The seller"} says this was delivered: ${d.title ?? ""}`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.sellerName ?? "The seller"} marked "${d.title ?? ""}" (order ${d.orderRef ?? ""}) delivered:\n\n"${d.note ?? ""}"\n\nPlease confirm it, or report a problem, by ${d.confirmBy ?? "the time shown on your order"}. If you don't answer by then, it counts as confirmed.\n\n${d.orderUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "delivery.confirmed": (d) => ({
    subject: `Delivery confirmed: ${d.title ?? ""}`,
    text: `Hi ${d.firstName ?? "there"},\n\n"${d.title ?? ""}" (order ${d.orderRef ?? ""}) is confirmed — ${d.how ?? "the sponsor confirmed it"}. Your share can be paid out once the holding period has passed.\n\n${d.saleUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "delivery.problem": (d) => ({
    subject: `Delivery problem reported: ${d.orderRef ?? ""} · ${d.title ?? ""}`,
    text: `${d.sponsorName ?? "A sponsor"} reported a problem with "${d.title ?? ""}" (order ${d.orderRef ?? ""}):\n\n"${d.problem ?? ""}"\n\nThe line's payout is on hold until you confirm the delivery or cancel and refund it:\n\n${d.issueUrl ?? ""}\n\n— SponsorX`,
  }),
  "delivery.onHold": (d) => ({
    subject: `${d.sponsorName ?? "The sponsor"} reported a problem: ${d.title ?? ""}`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.sponsorName ?? "The sponsor"} reported a problem with "${d.title ?? ""}" (order ${d.orderRef ?? ""}):\n\n"${d.problem ?? ""}"\n\nBTG is looking into it, and this line's payout is on hold until they decide. You don't need to do anything unless BTG contacts you.\n\n${d.saleUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "delivery.resolved": (d) => ({
    subject: `BTG's decision on ${d.orderRef ?? "your order"}: ${d.title ?? ""}`,
    text: `Hi ${d.firstName ?? "there"},\n\nBTG looked into the problem reported with "${d.title ?? ""}" (order ${d.orderRef ?? ""}) and it has been ${d.decision ?? "resolved"}.\n\nBTG's note: "${d.note ?? ""}"\n\n${d.link ?? ""}\n\n— BTG SponsorX`,
  }),
  "delivery.overdue": (d) => ({
    subject: `Reminder: mark "${d.title ?? "your sale"}" delivered`,
    text: `Hi ${d.firstName ?? "there"},\n\nThe last date for "${d.title ?? ""}" (order ${d.orderRef ?? ""}, for ${d.sponsorName ?? "the sponsor"}) was ${d.lastDate ?? "recently"}, and it isn't marked delivered yet. Once it's delivered, mark it with a short note — your share is paid only after the sponsor confirms.\n\n${d.saleUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* 2S2-BE-05 — teams and the athletes they invite. */
  "team.invited": (d) => ({
    subject: `${d.teamName ?? "A team"} invited you to join their roster`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.teamName ?? "A team"} invited you to join their roster on SponsorX. The team's share would be ${d.share ?? ""} of what's left after BTG's fees and card processing.\n\nNothing changes unless you accept. Orders you already have carry on and pay you as before.\n\n${d.teamUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "team.invitationAnswered": (d) => ({
    subject: `${d.athleteName ?? "The athlete"} ${d.answer ?? "answered"} your invitation`,
    text: `Hi there,\n\n${d.athleteName ?? "The athlete"} ${d.answer ?? "answered"} your invitation to join ${d.teamName ?? "your team"}${d.share ? ` at a ${d.share} team share` : ""}.\n\n${d.rosterUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "team.linkEnded": (d) => ({
    subject: `${d.athleteName ?? "An athlete"} is no longer on ${d.teamName ?? "the team"}`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.who ?? "The link between the athlete and the team has ended."}\n\nOrders already placed carry on and pay as agreed when they were placed. New sales of the athlete's items no longer go through the team.\n\n${d.link ?? ""}\n\n— BTG SponsorX`,
  }),

  /* P6-INT-02 — the fan's voucher. The ONLY template addressed to a member
     of the public rather than to an athlete or staff, which is why the
     consent gate in `recordClaim` stands in front of it. It carries the code,
     the offer, where to use it and when it runs out, because a fan who has to
     log in to find any of those has been sent a useless email — and there is
     no login for them to use. */
  "reward.claimed": (d) => ({
    subject: `Your ${d.offerText ?? "reward"} — code ${d.code ?? ""}`,
    text: `Here is your reward.\n\n${d.offerText ?? ""}\n\nCode: ${d.code ?? ""}\n\nShow this code to claim it. Valid until ${d.expiresOn ?? "the date on the offer"}.\n\n${d.terms ?? ""}\n\n— BTG SponsorX\n\nDon't want emails from us? Unsubscribe in one tap: ${d.unsubscribeUrl ?? ""}`,
  }),

  /* P5-INT-01 — the three deliverable messages. All to the athlete: BTG sees
     the queue in their own workspace and does not need mail about it. */
  "deliverable.dueSoon": (d) => ({
    subject: `Due ${d.dueOn ?? "soon"}: ${d.title ?? "your deliverable"}`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.title ?? "A deliverable"} for ${d.campaignName ?? "your campaign"} is due on ${d.dueOn ?? "its due date"}.\n\nUpload it here:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "deliverable.revisionRequested": (d) => ({
    subject: `A change is needed: ${d.title ?? "your deliverable"}`,
    /* The reason is mandatory upstream (RevisionReasonRequiredError), so it
       is quoted rather than defaulted — an email saying "changes requested"
       with no reason is an instruction the athlete cannot follow. */
    text: `Hi ${d.firstName ?? "there"},\n\nWe need a change to ${d.title ?? "your deliverable"} before it can be approved:\n\n${d.reason ?? ""}\n\nYou do not need to start again — update and resubmit here:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "deliverable.approved": (d) => ({
    subject: `Approved: ${d.title ?? "your deliverable"}`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.title ?? "Your deliverable"} has been approved${d.campaignName ? ` for ${d.campaignName}` : ""}.\n\nOnce it is live, mark it published in your portal and add the link — that is what lets us verify it and release your earnings.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),

  "invitation.reminder": (d) => ({
    subject: "You have an open SponsorX invitation",
    text: `Hi ${d.firstName ?? "there"},\n\nYou still have an invitation waiting${d.sponsorName ? ` from ${d.sponsorName}` : ""}. There is nothing wrong — we just did not want it to get lost.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "invitation.expiring": (d) => ({
    subject: "Your SponsorX invitation expires soon",
    text: `Hi ${d.firstName ?? "there"},\n\nYour invitation${d.sponsorName ? ` from ${d.sponsorName}` : ""} expires on ${d.expiresOn ?? "shortly"}. After that the sponsor may offer the work to someone else.\n\nIf you are not interested, declining is genuinely helpful — it lets us fill the slot.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* P9-BE-13, §5.6 — SponsorX declined a business a student brought in.
     It says plainly that their sales credit is untouched, because that is a
     requirement and not a courtesy, and offers the categories still open. */
  "student.prospectDeclined": (d) => ({
    subject: `About ${d.businessName ?? "your prospect"}`,
    text: `Hi ${d.studentName ?? "there"},\n\nSponsorX can't take on ${d.businessName ?? "this business"} right now (reason: ${(d.reason ?? "OTHER").replace(/_/g, " ").toLowerCase()}).\n\nThis doesn't count against you — your sales credit and points are unchanged.${d.openCategories ? `\n\nCategories still open at your school: ${d.openCategories}.` : ""}\n\n— SponsorX NEXT`,
  }),
  /* 2S1-INT-01 — the five onboarding messages, to the organisation's primary
     contact. Every refusal quotes the reviewer's note, which is mandatory
     upstream (NEEDS_NOTE), because "changes requested" with no reason is an
     instruction nobody can follow. */
  /* 2S1-BE-06 — the receipt says what is still needed; the system approves
     as soon as it is all in, so usually no person is waited on. */
  "onboarding.received": (d) => ({
    subject: `We have ${d.orgName ?? "your"} application`,
    text: `Hi ${d.contactName ?? "there"},\n\nThanks for applying to sell on SponsorX.${d.stillNeeded ? `\n\nBefore we can approve ${d.orgName ?? "your organisation"}:\n${d.stillNeeded}\n\nAs soon as these are done we approve you automatically. Your application is here:\n\n${d.resumeUrl ?? ""}` : "\n\nWe will email you as soon as there is a decision."}\n\n— BTG SponsorX`,
  }),
  "onboarding.confirmEmail": (d) => ({
    subject: "Confirm your email for SponsorX",
    text: `Hi ${d.contactName ?? "there"},\n\nYou are the primary contact on ${d.orgName ?? "an organisation"}'s application to sell on SponsorX. Confirm this is your email address:\n\n${d.confirmUrl ?? ""}\n\nOnce your email is confirmed and your documents are uploaded, we approve you — usually straight away.\n\n— BTG SponsorX`,
  }),
  "onboarding.newOrganization": (d) => ({
    subject: `New organisation: ${d.orgName ?? "an organisation"} ${d.outcome ?? ""}`.trim(),
    text: `${d.orgName ?? "An organisation"} (${d.orgType ?? "organisation"}) ${d.outcome ?? "applied"} on SponsorX.${d.reasons ? `\n\nWhy it is waiting:\n${d.reasons}` : ""}\n\nOpen its profile:\n\n${d.profileUrl ?? ""}\n\nIf something looks wrong, reject it from that page — its sign-in and listings are switched off, its payouts held, and it is told why.\n\n— SponsorX`,
  }),
  "onboarding.accountRejected": (d) => ({
    subject: `${d.orgName ?? "Your organisation"}'s SponsorX account has been closed`,
    text: `Hi ${d.contactName ?? "there"},\n\nBTG has closed ${d.orgName ?? "your organisation"}'s account on SponsorX:\n\n${d.notes ?? ""}\n\nYour sign-in and listings are switched off and payouts are on hold. Orders already placed are not cancelled by this. If you think this is a mistake, contact BTG support at ${d.supportEmail ?? "the support address"}, or use the contact page:\n\n${d.supportUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "onboarding.reinstated": (d) => ({
    subject: `${d.orgName ?? "Your organisation"}'s SponsorX account is open again`,
    text: `Hi ${d.contactName ?? "there"},\n\nBTG has reopened ${d.orgName ?? "your organisation"}'s account. Sign in with this email address — your listing access is back and payouts are released:\n\n${d.portalUrl ?? ""}\n\nListings that ended when the account closed need listing again.\n\n— BTG SponsorX`,
  }),
  "onboarding.documentChanged": (d) => ({
    subject: `${d.orgName ?? "An organisation"} ${d.change ?? "changed a document"}`,
    text: `${d.orgName ?? "An organisation"} ${d.change ?? "changed a document"}: ${d.document ?? ""}.${d.flagged ? `\n\nIt is now flagged for you:\n${d.flagged}\n\nIts listings stay live — nothing is suspended automatically.` : ""}\n\nOpen its profile:\n\n${d.profileUrl ?? ""}\n\n— SponsorX`,
  }),
  "onboarding.changesRequested": (d) => ({
    subject: `One thing to fix on ${d.orgName ?? "your"} application`,
    text: `Hi ${d.contactName ?? "there"},\n\nWe need a change before we can approve ${d.orgName ?? "your organisation"}:\n\n${d.notes ?? ""}\n\nYour answers are saved. Update them and resubmit here — you do not need to start again:\n\n${d.resumeUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* 2S1-BE-05 — BTG's decision on a request to sponsor. */
  "sponsor.accountOpened": (d) => ({
    subject: "Your SponsorX sponsor account is ready",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has opened a sponsor account for ${d.businessName ?? "your business"} on SponsorX. Sign in with this email address:\n\n${d.portalUrl ?? ""}\n\nFrom there you can browse athletes and teams, and send BTG a brief.\n\n— BTG SponsorX`,
  }),
  "sponsor.requestDeclined": (d) => ({
    subject: "About your SponsorX sponsor request",
    text: `Hi ${d.firstName ?? "there"},\n\nThanks for asking to sponsor on SponsorX. BTG can't open an account for ${d.businessName ?? "you"} yet:\n\n${d.note ?? ""}\n\nQuestions? Write to BTG support at ${d.supportEmail ?? "the support address"}${d.supportUrl ? `, or use the contact page:\n\n${d.supportUrl}` : "."}\n\n— BTG SponsorX`,
  }),
  /* 2S1-BE-17 — automatic approval, and BTG's reject / reinstate after it. */
  "sponsor.confirmEmail": (d) => ({
    subject: "Confirm your email for SponsorX",
    text: `Hi ${d.firstName ?? "there"},\n\nThanks for asking to sponsor on SponsorX for ${d.businessName ?? "your business"}. Confirm this is your email address:\n\n${d.confirmUrl ?? ""}\n\nOnce your email is confirmed and your proof of business is uploaded, we open your account — usually straight away.\n\n— BTG SponsorX`,
  }),
  "sponsor.newSponsor": (d) => ({
    subject: `New sponsor: ${d.businessName ?? "a business"} ${d.outcome ?? ""}`.trim(),
    text: `${d.businessName ?? "A business"} ${d.outcome ?? "asked to sponsor"} on SponsorX.${d.reasons ? `\n\nWhy it is waiting for you:\n${d.reasons}` : ""}\n\nOpen the request:\n\n${d.reviewUrl ?? ""}\n\nIf the submission looks bogus, reject it from that page — the sponsor's sign-in is switched off and they are told why.\n\n— SponsorX`,
  }),
  "sponsor.accountRejected": (d) => ({
    subject: "Your SponsorX sponsor account has been closed",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has closed the sponsor account for ${d.businessName ?? "your business"} on SponsorX:\n\n${d.note ?? ""}\n\nIf you think this is a mistake, contact BTG support${d.supportEmail ? ` at ${d.supportEmail}` : ""}:\n\n${d.supportUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* 2S1-BE-09 / -10 — athletes and guardians approved automatically. */
  "athlete.confirmEmail": (d) => ({
    subject: "Confirm your email for SponsorX",
    text: `Hi ${d.firstName ?? "there"},\n\nConfirm this is your email address for your SponsorX application:\n\n${d.confirmUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "guardian.setup": (d) => ({
    subject: `${d.athleteName ?? "An athlete"} named you as their guardian on SponsorX`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.athleteName ?? "An athlete"} named you as their guardian on SponsorX. As their guardian you approve every agreement and payment for ${d.athleteFirstName ?? "them"}; they can upload their own content, and you get an email each time.\n\nSet up your guardian account here — opening the link confirms your email:\n\n${d.setupUrl ?? ""}\n\nYou'll need your government ID and proof that you're the guardian (a birth certificate naming you, a court order or a school record).\n\nNot their guardian? Reply to this email or contact BTG and we'll stop the request.\n\n— BTG SponsorX`,
  }),
  "guardian.approved": (d) => ({
    subject: `You're approved — manage ${d.athleteFirstName ?? "your athlete"}'s SponsorX account`,
    text: `Hi ${d.firstName ?? "there"},\n\nYou're approved as ${d.athleteFirstName ?? "your athlete"}'s guardian. Sign in with this email address to approve agreements and payments, and set up where ${d.athleteFirstName ?? "their"}'s money is paid:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "signup.newSignup": (d) => ({
    subject: `New ${d.kindWord ?? "sign-up"}: ${d.name ?? "someone"} ${d.outcome ?? ""}`.trim(),
    text: `${d.name ?? "Someone"} ${d.outcome ?? "signed up"} on SponsorX.${d.reasons ? `\n\nWhy it is waiting for you:\n${d.reasons}` : ""}\n\nOpen it on New sign-ups:\n\n${d.reviewUrl ?? ""}\n\nIf something is wrong, reject it from that page — their access is withdrawn and they are told why.\n\n— SponsorX`,
  }),
  "athlete.accountRejected": (d) => ({
    subject: "Your SponsorX athlete account has been closed",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has closed this SponsorX athlete account:\n\n${d.note ?? ""}\n\nMoney already earned is still owed and stays on hold until this is resolved. If you think this is a mistake, contact BTG support at ${d.supportEmail ?? "the support address"}, or use the contact page:\n\n${d.supportUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "athlete.accountReinstated": (d) => ({
    subject: "Your SponsorX athlete account is open again",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has reopened your SponsorX account. Sign in with this email address:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "guardian.accountRejected": (d) => ({
    subject: "Your SponsorX guardian account has been closed",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has closed your SponsorX guardian account:\n\n${d.note ?? ""}${d.athletes ? `\n\nThis also closes the accounts of: ${d.athletes}.` : ""}\n\nIf you think this is a mistake, contact BTG support at ${d.supportEmail ?? "the support address"}, or use the contact page:\n\n${d.supportUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "guardian.accountReinstated": (d) => ({
    subject: "Your SponsorX guardian account is open again",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has reopened your guardian account${d.athletes ? `, and ${d.athletes}'s with it` : ""}. Sign in with this email address:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  /* 2S1-BE-11 — every upload a minor makes. */
  "guardian.contentUploaded": (d) => ({
    subject: `${d.athleteFirstName ?? "Your athlete"} uploaded new content on SponsorX`,
    text: `Hi ${d.firstName ?? "there"},\n\n${d.athleteFirstName ?? "Your athlete"} uploaded new content for ${d.what ?? "a deliverable"}. You can see it here:\n\n${d.reviewUrl ?? ""}\n\nIf it shouldn't be there, ask BTG to take it down.\n\n— BTG SponsorX`,
  }),
  /* 2S1-BE-12 — coming of age. */
  "comingOfAge.started": (d) => ({
    subject: d.seat === "guardian" ? `${d.athleteFirstName ?? "Your athlete"} can now take over their SponsorX account` : `You're ${d.age ?? "an adult"} — take over your SponsorX account`,
    text: d.seat === "guardian"
      ? `Hi ${d.firstName ?? "there"},\n\n${d.athleteFirstName ?? "Your athlete"} has reached ${d.age ?? "the age of majority"}. They have until ${d.dueDate ?? "the deadline"} to upload a government ID and take over their account. Until then, new items and new deals are paused; orders already agreed carry on.\n\nYou can send them the link from here:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`
      : `Hi ${d.firstName ?? "there"},\n\nYou've reached ${d.age ?? "the age of majority"}. Upload a government ID by ${d.dueDate ?? "the deadline"} to take over your account from your guardian:\n\n${d.uploadUrl ?? ""}\n\nUntil then, new items and new deals are paused; orders already agreed carry on.\n\n— BTG SponsorX`,
  }),
  "comingOfAge.reminder": (d) => ({
    subject: `${d.daysLeft ?? "A few"} days left to upload a government ID`,
    text: d.seat === "guardian"
      ? `Hi ${d.firstName ?? "there"},\n\n${d.athleteFirstName ?? "Your athlete"} has ${d.daysLeft ?? "a few"} days left (until ${d.dueDate ?? "the deadline"}) to upload a government ID. If it isn't uploaded in time, the account is closed.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`
      : `Hi ${d.firstName ?? "there"},\n\nYou have ${d.daysLeft ?? "a few"} days left (until ${d.dueDate ?? "the deadline"}) to upload a government ID and take over your account. If it isn't uploaded in time, your account is closed.\n\n${d.uploadUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "comingOfAge.completed": (d) => ({
    subject: d.seat === "guardian" ? `${d.athleteFirstName ?? "Your athlete"} has taken over their SponsorX account` : "You're in control of your SponsorX account",
    text: d.seat === "guardian"
      ? `Hi ${d.firstName ?? "there"},\n\n${d.athleteFirstName ?? "Your athlete"} uploaded a government ID and now manages their own account. You no longer approve their agreements and payments. Money already earned is paid as before.\n\n— BTG SponsorX`
      : `Hi ${d.firstName ?? "there"},\n\nYour government ID is in, and your account is yours: you accept your own agreements and manage your own money from now on.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "comingOfAge.terminated": (d) => ({
    subject: "A SponsorX account has been closed",
    text: d.seat === "athlete"
      ? `Hi ${d.firstName ?? "there"},\n\nThe 90 days to upload a government ID have passed, so your SponsorX account is closed. Your documents are kept until ${d.until ?? "30 days from now"}. Upload a government ID before then and your account comes back:\n\n${d.uploadUrl ?? ""}\n\nMoney you already earned is still owed to you.\n\n— BTG SponsorX`
      : d.seat === "guardian-others"
        ? `Hi ${d.firstName ?? "there"},\n\nThe 90 days for ${d.athleteFirstName ?? "your athlete"} to upload a government ID have passed, so their account is closed and you're no longer their guardian on SponsorX. Your other athletes are not affected.\n\n— BTG SponsorX`
        : `Hi ${d.firstName ?? "there"},\n\nThe 90 days for ${d.athleteFirstName ?? "your athlete"} to upload a government ID have passed, so their account and your guardian account are closed. If they upload a government ID by ${d.until ?? "30 days from now"}, their account comes back.\n\n— BTG SponsorX`,
  }),
  "comingOfAge.uploadLink": (d) => ({
    subject: "Take over your SponsorX account",
    text: `Hi ${d.firstName ?? "there"},\n\n${d.guardianName ?? "Your guardian"} sent you this link. Upload a government ID by ${d.dueDate ?? "the deadline"} to take over your SponsorX account:\n\n${d.uploadUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "comingOfAge.btgSettle": (d) => ({
    subject: `Coming of age ended: ${d.athleteName ?? "an athlete"}'s account closed`,
    text: `${d.athleteName ?? "An athlete"} didn't upload a government ID within the 90 days, so their account is closed. ${d.openOrders ?? "0"} order(s) are still under way and need settling; ${d.listingsEnded ?? "0"} listing(s) were ended. Money already earned stays owed.\n\n${d.reviewUrl ?? ""}\n\n— SponsorX`,
  }),
  "offer.changeRequested": (d) => ({
    subject: `Change requested: ${d.sponsorName ?? "a sponsor"} · ${d.campaignName ?? "a campaign"}`,
    text: `${d.athleteName ?? "An athlete"} asked for a change to the offer on ${d.sponsorName ?? "a sponsor"}'s ${d.campaignName ?? "campaign"}:\n\n${d.note ?? ""}\n\nThe offer is still open — they can accept or decline it as it stands. Its terms are fixed once sent, so to change them withdraw it and send a revised offer, or tell them it stands.\n\nThe campaign:\n\n${d.campaignUrl ?? ""}\n\n— SponsorX`,
  }),
  "sponsor.accountReinstated": (d) => ({
    subject: "Your SponsorX sponsor account is open again",
    text: `Hi ${d.firstName ?? "there"},\n\nBTG has reopened the sponsor account for ${d.businessName ?? "your business"}. Sign in with this email address:\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "onboarding.approved": (d) => ({
    subject: `${d.orgName ?? "Your organisation"} is approved on SponsorX`,
    text: `Hi ${d.contactName ?? "there"},\n\n${d.orgName ?? "Your organisation"} has been approved. Your account is ready: sign in with this email address to reach your property portal.\n\n${d.portalUrl ?? ""}\n\n— BTG SponsorX`,
  }),
  "onboarding.rejected": (d) => ({
    subject: `About ${d.orgName ?? "your"} application`,
    text: `Hi ${d.contactName ?? "there"},\n\nWe are not able to approve ${d.orgName ?? "your organisation"} at this time.\n\n${d.notes ?? ""}\n\nIf you think this is a mistake, contact BTG support at ${supportAddress(d)}.\n\n— BTG SponsorX`,
  }),
  "onboarding.suspended": (d) => ({
    subject: `${d.orgName ?? "Your organisation"}'s SponsorX listings are paused`,
    text: `Hi ${d.contactName ?? "there"},\n\nWe have paused ${d.orgName ?? "your organisation"}'s access to list on SponsorX:\n\n${d.notes ?? ""}\n\nNothing has been deleted. Reply to this email and our team will work through it with you.\n\n— BTG SponsorX`,
  }),
  "guardian.verificationRequested": (d) => ({
    subject: `Please confirm you authorise ${d.athleteName ?? "an athlete"} to join SponsorX`,
    text: `Hi ${d.guardianName ?? "there"},\n\n${d.athleteName ?? "An athlete"} has listed you as their parent or guardian on a SponsorX application. Because they are under 18, we need your authorisation before they can take part in any paid campaign.\n\nA member of the BTG team will contact you to confirm.\n\n— BTG SponsorX`,
  }),

  /* 2S1-BE-13 — closing an account and coming back. */
  "account.closed": (d) => ({
    subject: "Your SponsorX account is closed",
    text: `Hi ${d.name ?? "there"},\n\nYour SponsorX account is closed. You can't sign in, and your listings have stopped.\n\nYour documents are kept until ${d.retainUntil ?? "30 days from today"}, then deleted for good. Changed your mind? Reactivate before then and everything comes back:\n\n${d.reactivateUrl ?? ""}\n\nMoney you already earned is still paid out to your payout account.\n\nQuestions: ${d.supportEmail ?? ""}\n\n— BTG SponsorX`,
  }),
  "account.reactivationLink": (d) => ({
    subject: "Your link to reactivate your SponsorX account",
    text: `Hi ${d.name ?? "there"},\n\nHere is the link you asked for. It works for 24 hours:\n\n${d.reactivateUrl ?? ""}\n\nIf you didn't ask for it, you can ignore this email — nothing changes.\n\n— BTG SponsorX`,
  }),
  "account.reactivated": (d) => ({
    subject: "Your SponsorX account is back",
    text: `Hi ${d.name ?? "there"},\n\nYour SponsorX account is active again. Sign in with this email address:\n\n${d.portalUrl ?? ""}${d.notes ? `\n\n${d.notes}` : ""}\n\n— BTG SponsorX`,
  }),
  "account.reactivationRequested": (d) => ({
    subject: `Asked to come back: ${d.name ?? "a closed account"}`,
    text: `${d.name ?? "Someone"} (${d.kind ?? "account"}), whose account BTG rejected on ${d.closedAt ?? ""}, asks you to look again:\n\n${d.note ?? "(no message)"}\n\nTheir documents are kept until ${d.retainUntil ?? ""}. To bring them back, reinstate them from their page:\n\n${d.reviewUrl ?? ""}\n\nTo say no, decline the request (they are emailed your reason):\n\n${d.requestsUrl ?? ""}\n\n— SponsorX`,
  }),
  "account.reactivationDeclined": (d) => ({
    subject: "About your request to reopen your SponsorX account",
    text: `Hi ${d.name ?? "there"},\n\nBTG looked at your account again and is not reopening it:\n\n${d.note ?? ""}\n\nIf you have something BTG hasn't seen, write to ${d.supportEmail ?? "BTG support"} or use the contact page:\n\n${d.supportUrl ?? ""}\n\n— BTG SponsorX`,
  }),

  /* 2S1-BE-14 — a sensitive profile edit, to BTG admins. */
  "athlete.sensitiveEdit": (d) => ({
    subject: `Sensitive profile change: ${d.athleteName ?? "an athlete"}`,
    text: `${d.athleteName ?? "An athlete"} changed ${d.what ?? "a sensitive detail"} on their SponsorX profile. It is live now; the automatic checks ran again:\n\n${d.checks ?? ""}\n\nOpen them on New sign-ups — Reject is there if this looks wrong:\n\n${d.reviewUrl ?? ""}\n\n— SponsorX`,
  }),

  /* 2S1-BE-15 — the guardian handoff. */
  "handoff.confirmEmail": (d) => ({
    subject: "Confirm your email to ask to become a SponsorX guardian",
    text: `Hi ${d.name ?? "there"},\n\nYou asked to become ${d.athleteFirstName ?? "an athlete"}'s guardian on SponsorX. Confirm this is your email, then finish your request — your ID, proof you are the guardian, and the guardian agreement:\n\n${d.confirmUrl ?? ""}\n\nIf this is about custody, or you can't reach the current guardian, don't send a request: contact BTG at ${d.supportEmail ?? "BTG support"}. A person decides.\n\n— BTG SponsorX`,
  }),
  "handoff.requested": (d) => ({
    subject: `${d.requesterName ?? "Someone"} asked to become ${d.athleteFirstName ?? "your athlete"}'s guardian`,
    text: `Hi ${d.name ?? "there"},\n\n${d.requesterName ?? "Someone"} (${d.relationship ?? "guardian"}) asked to become ${d.athleteFirstName ?? "your athlete"}'s guardian on SponsorX. Their ID and proof of guardianship are uploaded.\n\nOnly you can hand off or decline. Until you hand off, you stay the guardian and nothing changes:\n\n${d.portalUrl ?? ""}\n\nIf you don't know them, or this is about custody, decline and contact BTG at ${d.supportEmail ?? "BTG support"}.\n\n— BTG SponsorX`,
  }),
  "handoff.declined": (d) => ({
    subject: `About your request to become ${d.athleteFirstName ?? "an athlete"}'s guardian`,
    text: `Hi ${d.name ?? "there"},\n\n${d.currentFirstName ?? "The current guardian"} declined your request. Nothing changed on ${d.athleteFirstName ?? "the athlete"}'s account.\n\nIf this is about custody, a court order, or you can't reach them, contact BTG support — a person at BTG decides, never the system:\n\n${d.supportEmail ?? ""}\n${d.supportUrl ?? ""}\n\nYour documents are deleted 30 days after a declined request.\n\n— BTG SponsorX`,
  }),
  "handoff.switchedNew": (d) => ({
    subject: `You are now ${d.athleteFirstName ?? "your athlete"}'s guardian on SponsorX`,
    text: `Hi ${d.name ?? "there"},\n\n${d.currentFirstName ?? "The previous guardian"} handed off, and you are now ${d.athleteFirstName ?? "the athlete"}'s guardian. You approve their agreements and payments from now on. Sign in with this email address:\n\n${d.portalUrl ?? ""}\n\nNext: set up your own payout account for ${d.athleteFirstName ?? "their"} new deals. Orders already agreed continue as they are, and money already earned is paid as before.\n\n— BTG SponsorX`,
  }),
  "handoff.switchedPrevious": (d) => ({
    subject: `You handed off ${d.athleteFirstName ?? "your athlete"}'s SponsorX account`,
    text: `Hi ${d.name ?? "there"},\n\n${d.requesterName ?? "The new guardian"} is now ${d.athleteFirstName ?? "the athlete"}'s guardian on SponsorX. Money ${d.athleteFirstName ?? "they"} already earned is still paid to the payout account it was earned under, and orders already agreed continue.${d.otherChildren ? "\n\nYour other athletes are not affected." : ""}\n\nQuestions: ${d.supportEmail ?? ""}\n\n— BTG SponsorX`,
  }),
  "handoff.switchedAthlete": (d) => ({
    subject: "Your guardian on SponsorX has changed",
    text: `Hi ${d.name ?? "there"},\n\n${d.requesterName ?? "Your new guardian"} is now your guardian on SponsorX and approves your agreements and payments from now on. Your orders and campaigns carry on as agreed.\n\n— BTG SponsorX`,
  }),
  "handoff.btgNotice": (d) => ({
    subject: `Guardian changed: ${d.athleteName ?? "an athlete"}`,
    text: `${d.previousName ?? "The previous guardian"} handed ${d.athleteName ?? "an athlete"}'s account to ${d.requesterName ?? "a new guardian"} (${d.relationship ?? ""}), who was approved automatically: email confirmed, ID and proof of guardianship uploaded, guardian agreement accepted.\n\nReview them on New sign-ups — Reject is there if this looks wrong:\n\n${d.reviewUrl ?? ""}\n\n— SponsorX`,
  }),
  /* 2S1-BE-15 — "BTG staff confirm minors" is on: the current guardian handed off, and the switch waits for BTG. */
  "handoff.staffConfirm": (d) => ({
    subject: `Guardian handoff to confirm: ${d.athleteName ?? "an athlete"}`,
    text: `${d.previousName ?? "The current guardian"} has handed ${d.athleteName ?? "an athlete"}'s account to ${d.requesterName ?? "a new guardian"} (${d.relationship ?? ""}). Their email is confirmed, their ID and proof of guardianship are uploaded and they accepted the guardian agreement.\n\n"BTG staff confirm minors" is on, so nothing has switched yet: ${d.previousName ?? "the current guardian"} stays in control until you confirm or decline it:\n\n${d.reviewUrl ?? ""}\n\n— SponsorX`,
  }),
  /* 2S1-BE-15 — a dispute decided by hand: a BTG admin replaced the guardian. Each of the three reads their own version. */
  "guardian.replacedByBtg": (d) => ({
    subject: `${d.athleteFirstName ?? "An athlete"}'s guardian on SponsorX has changed`,
    text: d.seat === "new"
      ? `Hi ${d.name ?? "there"},\n\nBTG has made you ${d.athleteFirstName ?? "an athlete"}'s guardian on SponsorX, in place of ${d.previousGuardianName ?? "their previous guardian"}:\n\n${d.reason ?? ""}\n\nWe've emailed you a separate link to finish your guardian page — your ID, proof of guardianship and the guardian agreement. You act for ${d.athleteFirstName ?? "them"} once that is done.\n\nQuestions: ${d.supportEmail ?? "BTG support"}.\n\n— BTG SponsorX`
      : d.seat === "previous"
        ? `Hi ${d.name ?? "there"},\n\nBTG has replaced you as ${d.athleteFirstName ?? "an athlete"}'s guardian on SponsorX, after looking at the matter by hand:\n\n${d.reason ?? ""}\n\nMoney already earned and work already agreed stay where they are. If you think this is wrong, write to ${d.supportEmail ?? "BTG support"}.\n\n— BTG SponsorX`
        : `Hi ${d.name ?? "there"},\n\nBTG has changed your guardian on SponsorX from ${d.previousGuardianName ?? "your previous guardian"} to ${d.newGuardianName ?? "a new guardian"}:\n\n${d.reason ?? ""}\n\nYour orders and campaigns carry on. Questions: ${d.supportEmail ?? "BTG support"}.\n\n— BTG SponsorX`,
  }),

  /* 2S1-BE-16 — the contact form. The support mailbox (Zoho Desk or a shared
     inbox) receives the message with Reply-To set to the sender. */
  "support.message": (d) => ({
    subject: `[${d.topic ?? "Other"}] ${d.name ?? "Someone"} — SponsorX contact form`,
    text: `From: ${d.name ?? ""} <${d.email ?? ""}>\nTopic: ${d.topic ?? ""}\nSent: ${d.sentAt ?? ""}\nReference: ${d.reference ?? ""}\nAttachments: ${d.attachments || "none"}\n\n${d.message ?? ""}\n\n— Reply to this email to answer ${d.name ?? "them"} directly.`,
  }),
  "support.copy": (d) => ({
    subject: "We have your message — BTG SponsorX",
    text: `Hi ${d.name ?? "there"},\n\nThanks — your message reached BTG and a person reads every one. We'll reply to this email address.\n\nTopic: ${d.topic ?? ""}\nReference: ${d.reference ?? ""}\n\nYour message:\n\n${d.message ?? ""}\n\n— BTG SponsorX`,
  }),
};

/**
 * Templates addressed to a member of the public — P6-SEC-03.
 *
 * "An unsubscribe link in every fan email." Every template here must print
 * `unsubscribeUrl`, and the handler refuses to send one without it and
 * without the consent record it relies on. A template added for fans but
 * left out of this set is caught by the test that reads the enqueue sites.
 */
export const FAN_TEMPLATES: ReadonlySet<string> = new Set(["reward.claimed"]);

/** From address. A verified sending domain is required before any of this
 *  leaves the building — see the note in the task board for P3-INT-01. */
const FROM = process.env.EMAIL_FROM ?? "SponsorX <noreply@sponsorx.net>";

/**
 * Claim the key, send, and release the claim if the vendor rejects it.
 *
 * Returns `"duplicate"` when the key was already claimed, which is a success
 * for the queue's purposes — the message has been sent once, which is what
 * was asked for.
 */
/**
 * 2S6-BE-02 — has the recipient muted this event on email? Read at send time,
 * so a mute set after the job was queued still holds. The recipient is found
 * the way the message found them: a user in the job's tenant with that
 * address, or the user linked to the athlete with that address (athlete mail
 * goes to the athlete record's email). Only a mutable event can be muted —
 * a stray row can never silence a decision notice.
 */
export async function mutedFor(pool: pg.Pool, job: Pick<EmailJob, "tenantId" | "template" | "to">): Promise<boolean> {
  if (!(MUTABLE_EVENTS as readonly string[]).includes(job.template)) return false;
  const { rowCount } = await pool.query(
    `SELECT 1 FROM "NotificationPreference" np
       JOIN "User" u ON u.id = np."userId" AND u."tenantId" = np."tenantId"
      WHERE np."tenantId" = $1 AND np.event = $2 AND np.channel = 'EMAIL' AND np.muted
        AND (lower(u.email) = lower($3)
             OR u."athleteId" IN (SELECT a.id FROM "Athlete" a WHERE a."tenantId" = $1 AND lower(a.email) = lower($3)))
      LIMIT 1`,
    [job.tenantId, job.template, job.to],
  );
  return (rowCount ?? 0) > 0;
}

export async function handleSendEmail(
  pool: pg.Pool,
  job: EmailJob,
  loadAttachment?: AttachmentLoader,
): Promise<"sent" | "duplicate" | "withdrawn" | "muted"> {
  const build = TEMPLATES[job.template];
  if (!build) {
    /* Unknown template. Throwing lets pg-boss retry and then park it, which
       is right: the alternative — swallowing it — is an email nobody ever
       learns was never sent. */
    throw new Error(`No email template named ${JSON.stringify(job.template)}.`);
  }

  const fan = FAN_TEMPLATES.has(job.template);
  if (fan) {
    if (!job.fanEventId || !job.data.unsubscribeUrl) {
      throw new Error(
        `${job.template} is a fan email and must carry fanEventId and unsubscribeUrl (P6-SEC-03).`,
      );
    }
    /* Re-checked at send time, in SQL: a fan who unsubscribed between the
       claim and this job running is not emailed. Same rule as `mayContact()`
       on the API side, expressed in the WHERE clause. */
    const ok = await pool.query(
      `SELECT 1 FROM "RewardEvent"
        WHERE id = $1 AND "fanEmail" IS NOT NULL
          AND "consentVersion" IS NOT NULL AND "consentWithdrawnAt" IS NULL`,
      [job.fanEventId],
    );
    if (ok.rowCount === 0) return "withdrawn";
  }

  /* Before the claim: a muted message is not sent, and not recorded as sent. */
  if (await mutedFor(pool, job)) return "muted";

  const claimed = await pool.query(
    `INSERT INTO "EmailSendLog" ("idempotencyKey", "tenantId", template, "to")
     VALUES ($1, $2, $3, $4)
     ON CONFLICT ("idempotencyKey") DO NOTHING
     RETURNING "idempotencyKey"`,
    [job.idempotencyKey, job.tenantId, job.template, job.to],
  );
  if (claimed.rowCount === 0) return "duplicate";

  const { subject, text } = build(job.data);

  try {
    /* The vendor, imported lazily and only here. Lazy so that the worker can
       boot, drain and run every other job type with no email credentials at
       all — which is exactly the state of a fresh developer machine. */
    const { Resend } = await import("resend");
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set.");

    /* 2S1-BE-16 — attachments are read from the private bucket now, not
       stored in the queue. A read that fails throws, so the job retries. */
    let attachments: { filename: string; content: Buffer; contentType: string }[] | undefined;
    if (job.attachments?.length) {
      if (!loadAttachment) throw new Error(`${job.template} carries attachments but no attachment loader was given.`);
      attachments = [];
      for (const a of job.attachments) attachments.push({ filename: a.filename, content: await loadAttachment(a.key), contentType: a.contentType });
    }

    const resend = new Resend(apiKey);
    const result = await resend.emails.send({
      from: FROM,
      to: job.to,
      subject,
      text,
      ...(job.replyTo ? { replyTo: job.replyTo } : {}),
      ...(attachments ? { attachments } : {}),
      /* RFC 8058 one-click: mail clients show their own "Unsubscribe" button
         and POST to this URL, which the web app forwards to the API. */
      ...(fan
        ? {
            headers: {
              "List-Unsubscribe": `<${job.data.unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          }
        : job.headers
          ? { headers: job.headers }
          : {}),
    });
    if (result.error) throw new Error(`Resend rejected the message: ${result.error.message}`);
  } catch (error) {
    /* Release the claim so a retry can genuinely try again. Without this a
       transient vendor outage would permanently suppress the message, which
       is a worse failure than sending twice. */
    await pool
      .query(`DELETE FROM "EmailSendLog" WHERE "idempotencyKey" = $1`, [job.idempotencyKey])
      .catch(() => {});
    throw error;
  }

  return "sent";
}

export { TEMPLATES as EMAIL_TEMPLATES };
