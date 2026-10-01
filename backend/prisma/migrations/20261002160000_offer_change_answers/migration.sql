-- 2S2-FE-03 follow-up — BTG answers an athlete's change request, once.
--
-- A SENT offer's terms are fixed (offer_terms_immutable), so BTG answers a
-- request one of two ways: KEPT — the offer stands as it is, with a reply to
-- the athlete; or REVISED — the offer is withdrawn and a new draft copied
-- from it (revisedOfferId), which carries "Revised from …" (fromOfferId).
ALTER TABLE "OfferChangeRequest"
    ADD COLUMN "answeredAt" TIMESTAMP(3),
    ADD COLUMN "answeredBy" TEXT,
    ADD COLUMN "answer" TEXT,
    ADD COLUMN "answerNote" TEXT,
    ADD COLUMN "revisedOfferId" TEXT;

ALTER TABLE "OfferChangeRequest" ADD CONSTRAINT "OfferChangeRequest_answer_check"
    CHECK ("answer" IS NULL OR "answer" IN ('KEPT', 'REVISED'));
-- Answered means all three: what, when and by whom — or none of them.
ALTER TABLE "OfferChangeRequest" ADD CONSTRAINT "OfferChangeRequest_answered_check"
    CHECK ((("answer" IS NULL) = ("answeredAt" IS NULL)) AND (("answer" IS NULL) = ("answeredBy" IS NULL)));
-- KEPT carries BTG's reply; REVISED names the draft that replaces the offer.
ALTER TABLE "OfferChangeRequest" ADD CONSTRAINT "OfferChangeRequest_kept_note_check"
    CHECK ("answer" IS DISTINCT FROM 'KEPT' OR length(btrim("answerNote")) BETWEEN 1 AND 2000);
ALTER TABLE "OfferChangeRequest" ADD CONSTRAINT "OfferChangeRequest_revised_offer_check"
    CHECK ("answer" IS DISTINCT FROM 'REVISED' OR "revisedOfferId" IS NOT NULL);
ALTER TABLE "OfferChangeRequest" ADD CONSTRAINT "OfferChangeRequest_revisedOfferId_fkey"
    FOREIGN KEY ("revisedOfferId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Offer" ADD COLUMN "fromOfferId" TEXT;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_fromOfferId_fkey"
    FOREIGN KEY ("fromOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
