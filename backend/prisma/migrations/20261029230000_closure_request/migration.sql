-- POL-BE-11 — closing an account with live deals is held for BTG. A request
-- to close that can't close yet (a live deal, money with no payout account
-- to send it to, or a guardian still acting for a minor) is a ClosureRequest
-- HELD: the account stays open while BTG settles each deal, then BTG closes
-- it (CLOSED, naming the AccountClosure) or declines; the owner can withdraw.
-- Filed in BTG's tenant (the account's operator), which reads and answers it;
-- subjectTenantId is the account's own.
CREATE TABLE "ClosureRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectKind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectTenantId" TEXT NOT NULL,
    "reason" TEXT,
    "requestedBy" TEXT NOT NULL,
    "holdReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "state" TEXT NOT NULL DEFAULT 'HELD',
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,
    "declineNote" TEXT,
    "closureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClosureRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClosureRequest_tenantId_state_idx" ON "ClosureRequest"("tenantId", "state");
CREATE UNIQUE INDEX "ClosureRequest_one_held" ON "ClosureRequest"("subjectKind", "subjectId") WHERE "state" = 'HELD';
ALTER TABLE "ClosureRequest" ADD CONSTRAINT "ClosureRequest_state_check" CHECK ("state" IN ('HELD', 'CLOSED', 'DECLINED', 'WITHDRAWN'));
ALTER TABLE "ClosureRequest" ADD CONSTRAINT "ClosureRequest_subject_check" CHECK ("subjectKind" IN ('ATHLETE', 'GUARDIAN', 'PROPERTY'));
