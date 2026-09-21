-- The outbox drain only ever scans undispatched rows.
--
-- Without the WHERE clause this index grows with every job ever dispatched, and
-- the drain query pays for that history on every poll. Partial, it stays the
-- size of the backlog — which is usually nothing.

CREATE INDEX IF NOT EXISTS outbox_pending
  ON "OutboxJob" ("createdAt")
  WHERE "dispatchedAt" IS NULL;
