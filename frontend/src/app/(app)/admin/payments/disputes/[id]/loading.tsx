/* One dispute's loading screen (P1-ART-25): the Vault's ghost — the title,
   a four-fact strip (read as the tile row) and two panel-shaped rows. */
import { VaultGhost } from "@/components/vault-stage";

export default function Loading() {
  return <VaultGhost label="Loading the dispute" tiles={4} rows={2} />;
}
