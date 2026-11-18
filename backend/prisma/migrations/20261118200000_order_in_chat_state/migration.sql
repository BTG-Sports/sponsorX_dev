-- 2S4-BE-15 — the Deal Chat stage of a marketplace order. On its own, so the
-- next migration (and its trigger) can use the new value.
ALTER TYPE "MarketplaceOrderState" ADD VALUE IF NOT EXISTS 'IN_CHAT' BEFORE 'PENDING_SELLER';
