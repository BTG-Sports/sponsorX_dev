-- 3S0-BE-02 — `notify.campaignLive` gets a consumer (3S0-DATA-01 gap G1).
-- Every launch before this queued one that nothing read, so they have been
-- waiting in the outbox. Sending them now would tell people about campaigns
-- that went live days or weeks ago, so they are closed as skipped instead:
-- marked dispatched (the drain never picks them up) with the reason in the
-- payload, so nobody mistakes them for sent. Launches after this deploy are
-- sent by the worker.
UPDATE "OutboxJob"
   SET "dispatchedAt" = (now() AT TIME ZONE 'UTC'),
       payload = payload || '{"skipped": "3S0-BE-02: queued before the campaign-live email existed; not sent"}'::jsonb
 WHERE name = 'notify.campaignLive'
   AND "dispatchedAt" IS NULL;
