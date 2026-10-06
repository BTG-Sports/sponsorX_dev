-- 2S0-SEC-01 — payments and PII review. A refused payment-provider delivery
-- (WebhookDelivery, source 'payments:<provider>', status REJECTED) used to be
-- kept as its whole body, up to 4,000 characters, or its first 4,000
-- characters as `truncated`. A real Stripe event refused there carries the
-- sponsor's name, email, phone and billing address (`customer_details`) and
-- card details (`payment_method_details`). From now on only which event it
-- claimed to be is kept (domain/payment-events.ts `rejectedDeliveryRecord`);
-- this brings the rows already recorded to the same shape. The row itself,
-- its status, error and signature verdict stay: the audit of refused
-- deliveries is unchanged. PaymentEvent is untouched: its payload was always
-- the provider-neutral event (ids, amounts, a reason), and its unique
-- (provider, providerEventId) is what makes a redelivery a no-op.
UPDATE "WebhookDelivery"
SET "payload" = jsonb_strip_nulls(jsonb_build_object(
      'id',            CASE WHEN jsonb_typeof("payload"->'id') = 'string' THEN to_jsonb(left("payload"->>'id', 200)) END,
      'object',        CASE WHEN jsonb_typeof("payload"->'object') = 'string' THEN to_jsonb(left("payload"->>'object', 200)) END,
      'type',          CASE WHEN jsonb_typeof("payload"->'type') = 'string' THEN to_jsonb(left("payload"->>'type', 200)) END,
      'created',       CASE WHEN jsonb_typeof("payload"->'created') IN ('string', 'number') THEN "payload"->'created' END,
      'account',       CASE WHEN jsonb_typeof("payload"->'account') = 'string' THEN to_jsonb(left("payload"->>'account', 200)) END,
      'livemode',      CASE WHEN jsonb_typeof("payload"->'livemode') = 'boolean' THEN "payload"->'livemode' END,
      'subjectObject', CASE WHEN jsonb_typeof("payload"->'data'->'object'->'object') = 'string' THEN to_jsonb(left("payload"->'data'->'object'->>'object', 200)) END,
      'subjectId',     CASE WHEN jsonb_typeof("payload"->'data'->'object'->'id') = 'string' THEN to_jsonb(left("payload"->'data'->'object'->>'id', 200)) END,
      'unparseable',   CASE WHEN "payload" ? 'truncated' THEN to_jsonb(true) END,
      'minimised',     to_jsonb(true)
    ))
WHERE "source" LIKE 'payments:%';
