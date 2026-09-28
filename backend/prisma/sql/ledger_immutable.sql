-- 2S5-BE-01 / 2S4-BE-04 / 2S5-BE-02 / 2S5-SEC-01 — the money records keep themselves.
-- (documentation/SponsorX-Phase2-Ledger-Design.md §3–§4.) Idempotent: CI
-- re-applies every file here after migrating.

-- A commission rule version is never rewritten. The one change allowed is
-- closing its window, once, when a new version replaces it.
CREATE OR REPLACE FUNCTION commission_rule_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD."effectiveTo" IS NULL AND NEW."effectiveTo" IS NOT NULL
     AND (to_jsonb(NEW) - 'effectiveTo') = (to_jsonb(OLD) - 'effectiveTo') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'commission_rule_immutable: rule % version % is never rewritten — write a new version', OLD."ruleKey", OLD.version
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS commission_rule_immutable ON "CommissionRule";
CREATE TRIGGER commission_rule_immutable BEFORE UPDATE ON "CommissionRule"
  FOR EACH ROW EXECUTE FUNCTION commission_rule_immutable();
ALTER TABLE "CommissionRule" DROP CONSTRAINT IF EXISTS "CommissionRule_shape";
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_shape"
  CHECK ("bps" BETWEEN 0 AND 10000 AND "fixedCents" >= 0
         AND "kind" IN ('PLATFORM_FEE','MANAGEMENT_FEE','PROCESSING','REFERRAL','RESERVE','TEAM_SHARE')
         AND "scope" IN ('GLOBAL','PROPERTY_KIND','PROPERTY','SPONSOR')
         AND (("scope" = 'GLOBAL') = ("scopeRef" IS NULL))
         AND ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"));

-- A frozen breakdown is frozen.
CREATE OR REPLACE FUNCTION order_line_financials_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'order_line_financials_immutable: the breakdown of line % was frozen at contract time', OLD."lineId"
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS order_line_financials_immutable ON "OrderLineFinancials";
CREATE TRIGGER order_line_financials_immutable BEFORE UPDATE ON "OrderLineFinancials"
  FOR EACH ROW EXECUTE FUNCTION order_line_financials_immutable();
ALTER TABLE "OrderLineFinancials" DROP CONSTRAINT IF EXISTS "OrderLineFinancials_sums";
ALTER TABLE "OrderLineFinancials" ADD CONSTRAINT "OrderLineFinancials_sums"
  CHECK ("netCents" = "grossCents" - "discountCents"
         AND "propertyShareCents" = "netCents" - "platformFeeCents" - "managementFeeCents" - "processingCents"
         AND "availableCents" = "propertyShareCents" - "referralCents" - "reserveCents"
         AND "propertyShareCents" >= 0 AND "availableCents" >= 0);

-- A ledger entry is a debit or a credit, never both, never nothing; it is
-- never rewritten except to move its status forward.
ALTER TABLE "LedgerEntry" DROP CONSTRAINT IF EXISTS "LedgerEntry_one_side";
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_one_side"
  CHECK ("debitCents" >= 0 AND "creditCents" >= 0 AND (("debitCents" = 0) <> ("creditCents" = 0))
         AND "status" IN ('PENDING','AVAILABLE','PAID','REVERSED'));
CREATE OR REPLACE FUNCTION ledger_entry_immutable() RETURNS trigger AS $$
DECLARE rank_old int; rank_new int;
BEGIN
  IF (to_jsonb(NEW) - 'status') <> (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'ledger_entry_immutable: entry % is never rewritten — post a new journal', OLD.id USING ERRCODE = 'check_violation';
  END IF;
  rank_old := array_position(ARRAY['PENDING','AVAILABLE','PAID'], OLD."status");
  rank_new := array_position(ARRAY['PENDING','AVAILABLE','PAID'], NEW."status");
  IF NEW."status" = 'REVERSED' AND OLD."status" <> 'PAID' THEN RETURN NEW; END IF;
  IF rank_old IS NULL OR rank_new IS NULL OR rank_new < rank_old THEN
    RAISE EXCEPTION 'ledger_entry_immutable: entry % status only moves forward (% → % refused)', OLD.id, OLD."status", NEW."status" USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS ledger_entry_immutable ON "LedgerEntry";
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_immutable();

-- 2S5-SEC-01 — the audit log is append-only. No row is ever rewritten, and
-- none is deleted — except in a database an operator has deliberately marked
-- for purging (the test databases: `ALTER DATABASE … SET
-- sponsorx.audit_purge = 'on'`). Production and staging never carry it.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('sponsorx.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log_append_only: audit entry % cannot be %d', OLD.id, lower(TG_OP) USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_log_append_only ON "AuditLog";
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
