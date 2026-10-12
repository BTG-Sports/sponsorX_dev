/* One payout's loading screen (P1-ART-25): the Vault's ghost — the summary
   tiles, then the orders / checks / audit trail and the decision panel. */
import { VaultGhost } from "@/components/vault-stage";

export default function Loading() {
  return <VaultGhost label="Loading the payout" tiles={5} rows={3} />;
}
