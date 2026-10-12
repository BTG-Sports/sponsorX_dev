/* Disputes' loading screen (P1-ART-25): the Vault's ghost — the title, four
   tiles and one panel-shaped row — so the page unlocks into the same shape. */
import { VaultGhost } from "@/components/vault-stage";

export default function Loading() {
  return <VaultGhost label="Loading disputes" tiles={4} cols={4} rows={1} />;
}
