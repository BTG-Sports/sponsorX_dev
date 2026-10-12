/* Commission's loading screen (P1-ART-25): the Vault's ghost — the title,
   two tiles and one panel-shaped row — so the page unlocks into the same
   shape. */
import { VaultGhost } from "@/components/vault-stage";

export default function Loading() {
  return <VaultGhost label="Loading commission rules" tiles={2} cols={2} rows={1} />;
}
