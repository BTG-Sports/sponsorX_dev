import { EmptyState } from "@/components/states";
import { CommissionEditor } from "@/components/commission-editor";
import { StadiumHint } from "@/components/stadium-hint";
import { VaultHead, VaultTile, VaultTiles, VaultUpdated } from "@/components/vault-stage";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { KINDS, commissionTiles, isCommissionAdmin, type ApiRule } from "@/lib/commission-live";
import { createRuleAction, previewAction, reviseRuleAction } from "./actions";

/* --------------------------------------------------------------------------
   Commission rules — 2S5-FE-01. "Rules can be created, versioned and
   previewed against a sample order."

   P1-ART-19 (2026-10-07): restructured as the commission desk — the split
   strip, one kind's rules as a table, the sample order beside it, add /
   revise in a dialog (components/commission-editor.tsx).

   P1-ART-25 (2026-10-12): on the Vault — two head tiles, Rules in force and
   Kinds covered, read from the rules list alone (lib/commission-live.ts
   commissionTiles; no new fetch). The editor below is unchanged.

   BTG ADMIN ONLY (programme owner, 2026-09-28). The admin workspace admits
   Finance, Sales and the other staff roles too, so this page checks the role
   itself, before anything is fetched; the API refuses them independently
   (RBAC matrix §21 — Finance reads rules, nobody but BTG admin writes).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "Commission";

export default async function CommissionPage() {
  const actor = await requirePortalAccess("admin");
  const readAt = new Date().toISOString();
  const admin = isCommissionAdmin(actor.roles);
  /* No data is read on the branch below, so there is nothing live to show
     the pill for — the Live pill appears only once the rules are actually
     fetched (P1-ART-25 review). */
  const head = (
    <VaultHead title={TITLE} pill={admin ? <>Live · <VaultUpdated iso={readAt} /></> : undefined} actions={<StadiumHint skin="vault" label="About this desk" text="How each marketplace sale is split. A change applies to orders approved from then on; approved orders keep the split they were approved with." />} />
  );

  if (!admin) {
    return (
      <div className="space-y-6">
        {head}
        <EmptyState mark="users" title="Commission rules are BTG admin's" hint="Ask a BTG admin to change how sales are split." />
      </div>
    );
  }

  const res = await apiFetch("/commission-rules");
  if (!res.ok) throw new Error(`Commission rules unavailable (${res.status}).`);
  const { rules } = (await res.json()) as { rules: ApiRule[] };
  const tiles = commissionTiles(rules);

  return (
    <div className="space-y-6">
      {head}
      <VaultTiles cols={2}>
        <VaultTile label="Rules in force" value={tiles.inForce} format="int" delay={0.08} />
        <VaultTile label="Kinds covered" value={tiles.kindsCovered} format="int" caption={`of ${KINDS.length}`} delay={0.12} />
      </VaultTiles>
      <CommissionEditor rules={rules} actions={{ create: createRuleAction, revise: reviseRuleAction, preview: previewAction }} />
    </div>
  );
}
