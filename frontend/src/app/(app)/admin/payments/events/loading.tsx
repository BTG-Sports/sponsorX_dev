/* Payment events' loading screen (P1-ART-25): the Vault's ghost — the title,
   five tiles and one panel-shaped row — so the page unlocks into the same
   shape. */
import { VaultGhost } from "@/components/vault-stage";

export default function Loading() {
  return <VaultGhost label="Loading payment events" tiles={5} rows={1} />;
}
