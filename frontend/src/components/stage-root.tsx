"use client";

/* P1-ART-25 — the shell root. On a Vault route (lib/vault-routes) the whole
   admin screen switches to Finance's look: `sx-vault` beside `sx-ops`, so
   the chrome keeps its structure and vault.css re-tints it. Client-side
   because a layout does not re-render between sibling routes.

   What is portaled to <body> (drawers, dialogs, the phone menu) sits outside
   this root, so <body> carries `sx-vault` too while a Vault route is open —
   next to the `sx-ops` StagePortals puts there — and drops it on the way out. */
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { isVaultPath } from "@/lib/vault-routes";

export function StageRoot({ className, vault, children }: { className: string; /** Switch to the Vault on money routes. */ vault: boolean; children: ReactNode }) {
  const path = usePathname() ?? "";
  const on = vault && isVaultPath(path);

  useEffect(() => {
    if (!on) return;
    document.body.classList.add("sx-vault");
    return () => document.body.classList.remove("sx-vault");
  }, [on]);

  return (
    <div className={`${className}${on ? " sx-vault" : ""}`} data-vault={on ? "" : undefined}>
      {children}
    </div>
  );
}
