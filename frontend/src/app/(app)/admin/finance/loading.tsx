/* The Treasury's loading screen (P1-ART-25): the Vault's ghost — the title,
   five tiles and three panels — so the page unlocks into the same shape. */
import { VaultGhost } from "@/components/vault-stage";

export default function Loading() {
  return <VaultGhost label="Loading the Treasury" tiles={5} cols={5} rows={3} />;
}
