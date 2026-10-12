/* Payout approvals' loading screen (P1-ART-25): the Vault's ghost — the
   title, the five state tiles and the tab strip plus table. */
import { VaultGhost } from "@/components/vault-stage";

export default function Loading() {
  return <VaultGhost label="Loading payout approvals" tiles={5} rows={2} />;
}
