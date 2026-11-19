-- 2S4-BE-18 — the live socket service's events, raised by the database itself.
--
-- Every change a person should see live is a row change, wherever it comes
-- from: a route, the worker's sweep, a payment, BTG's desk. A trigger turns
-- each into a notice on the Postgres channel `sx_live`, INSIDE the writing
-- transaction, so a notice is delivered only if the change committed and
-- never before it. The API relays each notice to the socket service
-- (backend/src/realtime/relay.ts), which passes it to the channels it names.
--
-- A notice carries ids and states only — never a message's words, an answer,
-- an amount or a name. Whoever hears it reads again through the API, where
-- every permission applies. Channels (documentation/SponsorX-Socket-Service.md):
--   chat:<chatId>:sponsor | chat:<chatId>:seller | chat:<chatId>:btg
--   inbox:sponsor:<sponsorId> | inbox:athlete:<athleteId> | inbox:property:<propertyId> | inbox:btg:<tenantId>
--   user:<userId>

-- One notice for a chat, to the given sides' chat and inbox channels.
CREATE OR REPLACE FUNCTION sx_live_chat(p_chat_id text, p_sides text[], p_event text, p_data jsonb) RETURNS void AS $$
DECLARE
  c record;
  ch text[] := ARRAY[]::text[];
BEGIN
  SELECT id, "tenantId", "orderId", "sponsorId", "athleteId", "propertyId" INTO c FROM "DealChat" WHERE id = p_chat_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF 'sponsor' = ANY(p_sides) THEN
    ch := ch || ('chat:' || c.id || ':sponsor') || ('inbox:sponsor:' || c."sponsorId");
  END IF;
  IF 'seller' = ANY(p_sides) THEN
    ch := ch || ('chat:' || c.id || ':seller');
    IF c."athleteId" IS NOT NULL THEN ch := ch || ('inbox:athlete:' || c."athleteId"); END IF;
    IF c."propertyId" IS NOT NULL THEN ch := ch || ('inbox:property:' || c."propertyId"); END IF;
  END IF;
  IF 'btg' = ANY(p_sides) THEN
    ch := ch || ('chat:' || c.id || ':btg') || ('inbox:btg:' || c."tenantId");
  END IF;
  PERFORM pg_notify('sx_live', json_build_object(
    'channels', ch,
    'event', p_event,
    'data', jsonb_build_object('chatId', c.id, 'orderId', c."orderId") || COALESCE(p_data, '{}'::jsonb)
  )::text);
END;
$$ LANGUAGE plpgsql;

-- A message's side, as a channel side.
CREATE OR REPLACE FUNCTION sx_live_side(p_side text) RETURNS text AS $$
  SELECT CASE WHEN p_side = 'SPONSOR' THEN 'sponsor' ELSE 'seller' END;
$$ LANGUAGE sql IMMUTABLE;

-- DealChat: opened, the form going out, amounts, read markers, the last warning, closed.
CREATE OR REPLACE FUNCTION sx_live_deal_chat() RETURNS trigger AS $$
DECLARE
  all_sides text[] := ARRAY['sponsor', 'seller', 'btg'];
  why text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM sx_live_chat(NEW.id, all_sides, 'chat:opened', NULL);
    RETURN NEW;
  END IF;
  IF OLD.state = 'OPEN' AND NEW.state <> 'OPEN' THEN
    SELECT COALESCE(o."cancelReason", o.state::text) INTO why FROM "MarketplaceOrder" o WHERE o.id = NEW."orderId";
    PERFORM sx_live_chat(NEW.id, all_sides, 'chat:closed', jsonb_build_object('why', CASE WHEN NEW."calledOffAt" IS NOT NULL THEN 'CALLED_OFF' ELSE COALESCE(why, 'ENDED') END));
    RETURN NEW;
  END IF;
  IF OLD."dealAgreementId" IS NULL AND NEW."dealAgreementId" IS NOT NULL THEN
    PERFORM sx_live_chat(NEW.id, all_sides, 'chat:form', NULL);
  END IF;
  IF OLD."sponsorAmountCents" IS DISTINCT FROM NEW."sponsorAmountCents" OR OLD."sellerAmountCents" IS DISTINCT FROM NEW."sellerAmountCents" THEN
    PERFORM sx_live_chat(NEW.id, all_sides, 'chat:changed', jsonb_build_object('what', 'amount'));
  END IF;
  IF OLD."sponsorReadAt" IS DISTINCT FROM NEW."sponsorReadAt" OR OLD."sellerReadAt" IS DISTINCT FROM NEW."sellerReadAt" THEN
    PERFORM sx_live_chat(NEW.id, all_sides, 'chat:changed', jsonb_build_object('what', 'read'));
  END IF;
  IF OLD."lastWarnedAt" IS DISTINCT FROM NEW."lastWarnedAt" AND NEW."lastWarnedAt" IS NOT NULL THEN
    PERFORM sx_live_chat(NEW.id, all_sides, 'chat:changed', jsonb_build_object('what', 'warning'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sx_live_deal_chat ON "DealChat";
CREATE TRIGGER sx_live_deal_chat AFTER INSERT OR UPDATE ON "DealChat" FOR EACH ROW EXECUTE FUNCTION sx_live_deal_chat();

-- DealChatMessage: a message, a hold, a release, a keep-back, a report.
-- A held message reaches the sender's side and BTG only, never the other side, until BTG releases it.
CREATE OR REPLACE FUNCTION sx_live_deal_chat_message() RETURNS trigger AS $$
DECLARE
  sender text := sx_live_side(NEW.side);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state = 'HELD' THEN
      PERFORM sx_live_chat(NEW."chatId", ARRAY[sender, 'btg'], 'chat:changed', jsonb_build_object('what', 'held'));
    ELSE
      PERFORM sx_live_chat(NEW."chatId", ARRAY['sponsor', 'seller', 'btg'], 'chat:changed', jsonb_build_object('what', 'message'));
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.state = 'HELD' AND NEW.state = 'VISIBLE' THEN
    PERFORM sx_live_chat(NEW."chatId", ARRAY['sponsor', 'seller', 'btg'], 'chat:changed', jsonb_build_object('what', 'released'));
  ELSIF OLD.state IS DISTINCT FROM NEW.state AND NEW.state = 'KEPT_BACK' THEN
    PERFORM sx_live_chat(NEW."chatId", ARRAY[sender, 'btg'], 'chat:changed', jsonb_build_object('what', 'kept-back'));
  ELSIF OLD."reportedAt" IS NULL AND NEW."reportedAt" IS NOT NULL THEN
    PERFORM sx_live_chat(NEW."chatId", ARRAY['btg'], 'chat:changed', jsonb_build_object('what', 'reported'));
  ELSIF OLD."reportClearedAt" IS NULL AND NEW."reportClearedAt" IS NOT NULL THEN
    PERFORM sx_live_chat(NEW."chatId", ARRAY['btg'], 'chat:changed', jsonb_build_object('what', 'report-cleared'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sx_live_deal_chat_message ON "DealChatMessage";
CREATE TRIGGER sx_live_deal_chat_message AFTER INSERT OR UPDATE ON "DealChatMessage" FOR EACH ROW EXECUTE FUNCTION sx_live_deal_chat_message();

-- DealChatPick: an answer picked or changed.
CREATE OR REPLACE FUNCTION sx_live_deal_chat_pick() RETURNS trigger AS $$
BEGIN
  PERFORM sx_live_chat(NEW."chatId", ARRAY['sponsor', 'seller', 'btg'], 'chat:changed', jsonb_build_object('what', 'pick'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sx_live_deal_chat_pick ON "DealChatPick";
CREATE TRIGGER sx_live_deal_chat_pick AFTER INSERT OR UPDATE ON "DealChatPick" FOR EACH ROW EXECUTE FUNCTION sx_live_deal_chat_pick();

-- DealChatExchange: an offer accepted, declined or agreed (a new offer or reply is a message, above).
CREATE OR REPLACE FUNCTION sx_live_deal_chat_exchange() RETURNS trigger AS $$
BEGIN
  IF OLD.state IS DISTINCT FROM NEW.state
     OR OLD."sponsorAcceptedMessageId" IS DISTINCT FROM NEW."sponsorAcceptedMessageId"
     OR OLD."sellerAcceptedMessageId" IS DISTINCT FROM NEW."sellerAcceptedMessageId" THEN
    PERFORM sx_live_chat(NEW."chatId", ARRAY['sponsor', 'seller', 'btg'], 'chat:changed', jsonb_build_object('what', 'offer'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sx_live_deal_chat_exchange ON "DealChatExchange";
CREATE TRIGGER sx_live_deal_chat_exchange AFTER UPDATE ON "DealChatExchange" FOR EACH ROW EXECUTE FUNCTION sx_live_deal_chat_exchange();

-- DealAgreement: a signature.
CREATE OR REPLACE FUNCTION sx_live_deal_agreement() RETURNS trigger AS $$
DECLARE
  chat_id text;
BEGIN
  SELECT id INTO chat_id FROM "DealChat" WHERE "dealAgreementId" = NEW.id LIMIT 1;
  IF chat_id IS NULL THEN RETURN NEW; END IF;
  IF OLD."sponsorAcceptanceId" IS NULL AND NEW."sponsorAcceptanceId" IS NOT NULL THEN
    PERFORM sx_live_chat(chat_id, ARRAY['sponsor', 'seller', 'btg'], 'chat:signed', jsonb_build_object('by', 'sponsor'));
  END IF;
  IF OLD."sellerAcceptanceId" IS NULL AND NEW."sellerAcceptanceId" IS NOT NULL THEN
    PERFORM sx_live_chat(chat_id, ARRAY['sponsor', 'seller', 'btg'], 'chat:signed', jsonb_build_object('by', 'seller'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sx_live_deal_agreement ON "DealAgreement";
CREATE TRIGGER sx_live_deal_agreement AFTER UPDATE ON "DealAgreement" FOR EACH ROW EXECUTE FUNCTION sx_live_deal_agreement();

-- MarketplaceOrder: every state move of an order with chats — BTG's decision, payment, the payment
-- window lapsing, the signing limit, a cancellation from anywhere — reaches every chat on it.
CREATE OR REPLACE FUNCTION sx_live_marketplace_order() RETURNS trigger AS $$
DECLARE
  chat_id text;
BEGIN
  IF OLD.state IS NOT DISTINCT FROM NEW.state THEN RETURN NEW; END IF;
  FOR chat_id IN SELECT id FROM "DealChat" WHERE "orderId" = NEW.id LOOP
    PERFORM sx_live_chat(chat_id, ARRAY['sponsor', 'seller', 'btg'], 'chat:order',
      jsonb_build_object('state', NEW.state::text, 'cancelReason', NEW."cancelReason"));
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sx_live_marketplace_order ON "MarketplaceOrder";
CREATE TRIGGER sx_live_marketplace_order AFTER UPDATE OF state ON "MarketplaceOrder" FOR EACH ROW EXECUTE FUNCTION sx_live_marketplace_order();

-- User: a login switched off loses every live connection at once.
CREATE OR REPLACE FUNCTION sx_live_user() RETURNS trigger AS $$
BEGIN
  IF OLD."disabledAt" IS NULL AND NEW."disabledAt" IS NOT NULL THEN
    PERFORM pg_notify('sx_live', json_build_object('channels', ARRAY['user:' || NEW.id], 'event', 'access:ended', 'data', '{}'::json)::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sx_live_user ON "User";
CREATE TRIGGER sx_live_user AFTER UPDATE OF "disabledAt" ON "User" FOR EACH ROW EXECUTE FUNCTION sx_live_user();
