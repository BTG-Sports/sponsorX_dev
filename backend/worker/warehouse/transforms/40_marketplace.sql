-- 3S1-DATA-02 · fact_marketplace_order_line (design §7): one row per order
-- line, its milestones as date keys, its financial split and refunds.
SELECT dw.ensure_dates(ARRAY(
  SELECT (o._row->>c)::timestamp::date FROM stg."MarketplaceOrder" o, unnest(ARRAY['createdAt','contractedAt','paidAt','fulfilledAt','refundedAt']) c
  UNION SELECT (l._row->>c)::timestamp::date FROM stg."MarketplaceOrderLine" l, unnest(ARRAY['startsOn','endsOn']) c
  UNION SELECT at::date FROM stg.audit WHERE action = 'marketplaceOrder.cancelled'));

INSERT INTO dw.fact_marketplace_order_line
SELECT o.tenant_id, l._row->>'itemTenantId', o.id, l.id,
       coalesce(sp.sponsor_key, 0), coalesce(pr.property_key, 0), coalesce(at.athlete_key, 0), coalesce(inv.inventory_key, 0),
       CASE WHEN dw.market_key(pr.city, pr.state_code) <> 0 THEN dw.market_key(pr.city, pr.state_code)
            ELSE coalesce(dw.market_key(at.city, at.state_code), 0) END,
       dw.dk(placed), dw.dk((o._row->>'contractedAt')::timestamp::date), dw.dk((o._row->>'paidAt')::timestamp::date),
       dw.dk((o._row->>'fulfilledAt')::timestamp::date),
       dw.dk(coalesce((o._row->>'refundedAt')::timestamp::date, cx.at::date)),
       dw.dk((l._row->>'startsOn')::timestamp::date), dw.dk((l._row->>'endsOn')::timestamp::date),
       o._row->>'state', coalesce(o._row->>'currency', 'USD'), (l._row->>'quantity')::int,
       (l._row->>'unitPriceCents')::bigint, (l._row->>'lineTotalCents')::bigint,
       coalesce((f._row->>'grossCents')::bigint, 0), coalesce((f._row->>'discountCents')::bigint, 0), coalesce((f._row->>'netCents')::bigint, 0),
       coalesce((f._row->>'platformFeeCents')::bigint, 0), coalesce((f._row->>'managementFeeCents')::bigint, 0), coalesce((f._row->>'processingCents')::bigint, 0),
       coalesce((f._row->>'propertyShareCents')::bigint, 0), coalesce((f._row->>'referralCents')::bigint, 0), coalesce((f._row->>'reserveCents')::bigint, 0),
       coalesce((f._row->>'availableCents')::bigint, 0), coalesce((f._row->>'teamAvailableCents')::bigint, 0), coalesce((f._row->>'teamReserveCents')::bigint, 0),
       coalesce(rf.refunded, 0)
  FROM stg."MarketplaceOrderLine" l
  JOIN stg."MarketplaceOrder" o ON o.id = l._row->>'orderId'
  CROSS JOIN LATERAL (SELECT (o._row->>'createdAt')::timestamp::date AS placed) p
  LEFT JOIN LATERAL (SELECT _row FROM stg."OrderLineFinancials" f WHERE f._row->>'lineId' = l.id LIMIT 1) f ON true
  LEFT JOIN LATERAL (SELECT sum((_row->>'amountCents')::bigint) AS refunded FROM stg."RefundDue" r
                      WHERE r._row->>'lineId' = l.id AND r._row->>'state' = 'SENT') rf ON true
  LEFT JOIN LATERAL (SELECT min(at) AS at FROM stg.audit a WHERE a.entity_id = o.id AND a.action = 'marketplaceOrder.cancelled') cx ON true
  LEFT JOIN dw.dim_sponsor sp ON sp.sponsor_id = o._row->>'sponsorId' AND placed BETWEEN sp.valid_from AND sp.valid_to
  LEFT JOIN dw.dim_property pr ON pr.property_id = l._row->>'propertyId' AND placed BETWEEN pr.valid_from AND pr.valid_to
  LEFT JOIN dw.dim_athlete at ON at.athlete_id = coalesce(l._row->>'sellerAthleteId', f._row->>'athleteId') AND placed BETWEEN at.valid_from AND at.valid_to
  LEFT JOIN dw.dim_inventory inv ON inv.inventory_kind = 'LISTING_ITEM' AND inv.source_id = l._row->>'inventoryItemId'
 WHERE placed IS NOT NULL;
