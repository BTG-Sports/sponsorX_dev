-- 3S1-DATA-02 · the money snapshots (design §7). They start the day copying
-- began; earlier days are absent, never invented (user, 2026-10-13). A day's
-- state is the latest raw version copied by the end of that day (UTC).
--
-- A DIARY. Days already written are never rewritten: each run redoes only
-- from the last day written (today, while today is still open) to today, so
-- the work does not grow with history. A day missed while the worker was down
-- is filled from the raw versions, which are kept, so it reads the same.
CREATE TEMP TABLE _days ON COMMIT DROP AS
  SELECT g::date AS d
    FROM generate_series(
           least(
             coalesce((SELECT max(d.date) FROM dw.snap_ledger_daily s JOIN dw.dim_date d USING (date_key)),
                      (SELECT coalesce(min(started_at AT TIME ZONE 'UTC')::date, current_date) FROM raw._ingest_run)),
             coalesce((SELECT max(d.date) FROM dw.snap_payment_status_daily s JOIN dw.dim_date d USING (date_key)),
                      (SELECT coalesce(min(started_at AT TIME ZONE 'UTC')::date, current_date) FROM raw._ingest_run))),
           (now() AT TIME ZONE 'UTC')::date, interval '1 day') g;
DELETE FROM dw.snap_ledger_daily WHERE date_key IN (SELECT dw.dk(d) FROM _days);
DELETE FROM dw.snap_payment_status_daily WHERE date_key IN (SELECT dw.dk(d) FROM _days);

INSERT INTO dw.snap_ledger_daily
SELECT dw.dk(dy.d), v.tenant_id, v._row->>'partyTenantId', v._row->>'partyType', v._row->>'partyId', v._row->>'account', v._row->>'status',
       count(*), sum((v._row->>'debitCents')::bigint), sum((v._row->>'creditCents')::bigint),
       sum((v._row->>'debitCents')::bigint - (v._row->>'creditCents')::bigint)
  FROM _days dy
  CROSS JOIN LATERAL (
    SELECT DISTINCT ON (id) id, tenant_id, _row, _deleted FROM raw."LedgerEntry"
     WHERE _ingested_at < ((dy.d + 1)::timestamp AT TIME ZONE 'UTC') ORDER BY id, _version_id DESC
  ) v
 WHERE NOT v._deleted
 GROUP BY 1, 2, 3, 4, 5, 6, 7;

/* Payment subjects: every copied version, with the run of versions in the
   same state numbered so a state's first appearance is known. */
CREATE TEMP TABLE _subj ON COMMIT DROP AS
WITH v AS (
  SELECT 'PAYMENT_ATTEMPT' AS st, id, tenant_id, _row, _deleted, _version_id, _ingested_at, 'SPONSOR' AS party_type, _row->>'sponsorId' AS party_id,
         (_row->>'refundedCents')::bigint AS refunded, _row->>'state' IN ('SUCCEEDED','PARTIALLY_REFUNDED','REFUNDED','FAILED') AS closed FROM raw."PaymentAttempt"
  UNION ALL
  SELECT 'PAYOUT', id, tenant_id, _row, _deleted, _version_id, _ingested_at, _row->>'payeeType', _row->>'payeeId', 0, _row->>'state' IN ('PAID','REJECTED') FROM raw."Payout"
  UNION ALL
  SELECT 'REFUND_DUE', id, tenant_id, _row, _deleted, _version_id, _ingested_at, 'SPONSOR', _row->>'sponsorId', 0, _row->>'state' = 'SENT' FROM raw."RefundDue"
)
SELECT *, sum(changed) OVER (PARTITION BY st, id ORDER BY _version_id) AS run
  FROM (SELECT v.*, CASE WHEN _row->>'state' IS DISTINCT FROM lag(_row->>'state') OVER (PARTITION BY st, id ORDER BY _version_id) THEN 1 ELSE 0 END AS changed FROM v) x;

CREATE TEMP TABLE _since ON COMMIT DROP AS
  SELECT st, id, run, min(coalesce((_row->>'updatedAt')::timestamp::date, (_ingested_at AT TIME ZONE 'UTC')::date)) AS since
    FROM _subj GROUP BY 1, 2, 3;

INSERT INTO dw.snap_payment_status_daily
SELECT dw.dk(dy.d), cur.tenant_id, cur.st, cur.id, coalesce(cur.party_type, ''), coalesce(cur.party_id, ''), cur._row->>'state',
       (cur._row->>'amountCents')::bigint, coalesce(cur.refunded, 0), greatest(dy.d - s.since, 0), cur.closed
  FROM _days dy
  CROSS JOIN LATERAL (SELECT DISTINCT ON (st, id) * FROM _subj WHERE _ingested_at < ((dy.d + 1)::timestamp AT TIME ZONE 'UTC') ORDER BY st, id, _version_id DESC) cur
  JOIN _since s ON s.st = cur.st AND s.id = cur.id AND s.run = cur.run
  LEFT JOIN LATERAL (SELECT DISTINCT ON (st, id) closed FROM _subj p
                      WHERE p.st = cur.st AND p.id = cur.id AND p._ingested_at < (dy.d::timestamp AT TIME ZONE 'UTC') ORDER BY st, id, _version_id DESC) prev ON true
 WHERE NOT cur._deleted
   AND (NOT cur.closed OR prev.closed = false);
