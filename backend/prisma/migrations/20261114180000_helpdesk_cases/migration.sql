-- POL-BE-43 — the help desk form: a support message stores the cases the
-- sender ticked (IDs from backend/src/domain/helpdesk-cases.ts) and, when it
-- was sent while signed in, the account it came from.

ALTER TABLE "SupportMessage" ADD COLUMN "caseIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SupportMessage" ADD COLUMN "userId" TEXT;

-- The text is now needed only when nothing is ticked (or "Something else"
-- is, which the API checks): a message is either some text or some cases.
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_text_or_cases"
  CHECK (btrim("message") <> '' OR cardinality("caseIds") > 0);

ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SupportMessage_userId_idx" ON "SupportMessage"("userId");
-- The inbox's filter by case: "caseIds" @> ARRAY['ACC-30'].
CREATE INDEX "SupportMessage_caseIds_idx" ON "SupportMessage" USING GIN ("caseIds");
