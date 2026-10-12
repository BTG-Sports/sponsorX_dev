"use client";

/* P1-ART-25 — the shell root. When the Vault is on (lib/vault-routes
   `vaultOn`: the money routes, or every route for a Finance-only viewer) the
   whole admin screen switches to Finance's look: `sx-vault` beside `sx-ops`,
   so the chrome keeps its structure and vault.css re-tints it. Client-side
   because a layout does not re-render between sibling routes.

   What is portaled to <body> (drawers, dialogs, the phone menu) sits outside
   this root, so <body> carries `sx-vault` too while the Vault is on — next
   to the `sx-ops` StagePortals puts there — and drops it on the way out. */
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { vaultOn, type VaultMode } from "@/lib/vault-routes";

export function StageRoot({ className, vault, children }: { className: string; /** When to switch to the Vault. */ vault: VaultMode; children: ReactNode }) {
  const path = usePathname() ?? "";
  const on = vaultOn(path, vault);

  useEffect(() => {
    if (!on) return;
    /* classList.add/dataset here touch <body> as a shared set, not a
       reference count — that's safe only because exactly one StageRoot is
       ever mounted at a time (one PortalShell per page), so there is never
       a second mount whose cleanup could step on this one's. */
    document.body.classList.add("sx-vault");
    document.body.dataset.vault = "";
    return () => {
      document.body.classList.remove("sx-vault");
      delete document.body.dataset.vault;
    };
  }, [on]);

  return (
    <div className={`${className}${on ? " sx-vault" : ""}`} data-vault={on ? "" : undefined}>
      {children}
    </div>
  );
}
