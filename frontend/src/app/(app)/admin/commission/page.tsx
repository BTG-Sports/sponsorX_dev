import { EmptyState } from "@/components/states";
import { CommissionEditor } from "@/components/commission-editor";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { isCommissionAdmin, type ApiRule } from "@/lib/commission-live";
import { createRuleAction, previewAction, reviseRuleAction } from "./actions";

/* --------------------------------------------------------------------------
   Commission rules — 2S5-FE-01. "Rules can be created, versioned and
   previewed against a sample order."

   P1-ART-19 (2026-10-07): restructured as the commission desk — the split
   strip, one kind's rules as a table, the sample order beside it, add /
   revise in a dialog (components/commission-editor.tsx).

   BTG ADMIN ONLY (programme owner, 2026-09-28). The admin workspace admits
   Finance, Sales and the other staff roles too, so this page checks the role
   itself, before anything is fetched; the API refuses them independently
   (RBAC matrix §21 — Finance reads rules, nobody but BTG admin writes).
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function CommissionPage() {
  const actor = await requirePortalAccess("admin");
  const heading = (
    <div>
      <h1 className="sx-page-title">Commission rules</h1>
      <p className="mt-1 text-xs text-muted">
        How each marketplace sale is split. A change applies to orders approved from then on; approved orders keep the split they were approved with.
      </p>
    </div>
  );

  if (!isCommissionAdmin(actor.roles)) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="users" title="Commission rules are BTG admin's" hint="Ask a BTG admin to change how sales are split." />
      </div>
    );
  }

  const res = await apiFetch("/commission-rules");
  if (!res.ok) throw new Error(`Commission rules unavailable (${res.status}).`);
  const { rules } = (await res.json()) as { rules: ApiRule[] };

  return (
    <div className="space-y-6">
      {heading}
      <CommissionEditor rules={rules} actions={{ create: createRuleAction, revise: reviseRuleAction, preview: previewAction }} />
    </div>
  );
}
