# Key Decisions & Findings

## Decisions made so far
1. **Build scope:** marketing landing page + full Phase 1 app (Sponsor, Athlete, Admin dashboards) + real backend & database.
2. **Tech stack confirmed:** Next.js / Node+Express / PostgreSQL / Prisma / Redis / MinIO (see `02-confirmed-tech-stack.md`).
3. **Mockups = reference only**, not binding source of truth; we can create our own designs.
4. **No coding / no implementation plan yet** — planning and documentation phase.
5. **Architecture style:** multi-tenant, API-first, modular monolith, separate marketing site from app shell, one app shell for three role-aware portals.

## Analysis / findings (from reading the Documentation set)
- The document set is unusually complete: strategy doc, versioned dev blueprint (with DB schema, state machines, API surface), 12-screen UI mockups (2 themes), a 24-doc ops binder, and a scripted pilot campaign.
- **Positioning tension:** "My View" (founder doc) leads with BTG-owned media/audience; the v2.0 Master Blueprint deliberately pivots to a micro-NIL athlete network. Mockups still foreground BTG-owned inventory. Open question: is launch hero inventory BTG media or the athlete network? (Data model kept generic so it's a merchandising choice, not a schema change.)
- **Measurement-vs-mechanism gap:** dashboards show polished ROI, but Phase 1 metrics are largely self-reported/manually verified. Biggest credibility risk → mitigated by mandatory metric provenance labels.
- **Minors/compliance under-weighted:** youth/high-school athletes mean guardian consent, NIL eligibility by state, athletic-association rules, and fan-data privacy are core product surface, not just a legal gate.
- **QR reward PII surface:** every claim collects fan name/email/phone/ZIP → most legally sensitive flow; needs real consent design.
- **Zoho dual system-of-record:** risk of drift/duplicates → external IDs + queued retries + clear ownership per object.
- **The operating loop IS the product:** if the loop works for the first ~25 athletes and ~10 businesses, later phases are justified; if not, nothing else matters.

## Risks tracked (with mitigations)
| Risk | Mitigation |
|------|-----------|
| Manual metrics oversold as verified | Provenance labels; ROI report separates media value / leads / redemptions / attributed revenue |
| Minors & NIL/eligibility compliance | Guardian workflow, consent/version tracking, restriction checks as core surface + launch gates |
| Fan PII from QR claims | Consent-gated capture, purpose limitation, sponsors get only permitted fields, audited |
| Zoho ↔ SponsorX drift | External IDs, outbox + idempotency, clear system-of-record ownership |
| Positioning ambiguity (BTG media vs athlete network) | Generic inventory model → launch emphasis is configuration, not schema |
