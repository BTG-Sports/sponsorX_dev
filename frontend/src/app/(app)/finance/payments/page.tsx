import { PaymentSwitch } from "@/components/payment-switch";
import { StadiumHint } from "@/components/stadium-hint";
import { VaultChip, VaultHead, VaultPanel, VaultUpdated } from "@/components/vault-stage";
import { switchWords, type ApiPaymentSwitch } from "@/lib/payment-switch-live";
import { apiFetch } from "@/server/api";
import { Refused } from "../refused";

/* --------------------------------------------------------------------------
   Payments — POL-FE-36 (backend POL-BE-36). The Vault's copy of BTG's
   payments switch: Finance turns payments on or off at once, no deploy, with
   the reason the audit keeps. BTG admin's desk is /admin/payments; both
   render the one island (components/payment-switch.tsx) and share its write.

   Reads  GET /payments/switch   { on, open, provider, canTurnOn, changed, history }
   Writes PUT /payments/switch   { open, reason }

   The portal admits FINANCE only, so there is no role check here; a 403
   from the API is the backstop (../refused.tsx). Every link stays inside
   /finance.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "Payments";

export default async function PaymentsPage() {
  const res = await apiFetch("/payments/switch");
  if (res.status === 403) return <Refused title={TITLE} />;
  if (!res.ok) throw new Error(`Payments switch unavailable (${res.status}).`);
  const s = (await res.json()) as ApiPaymentSwitch;
  const readAt = new Date().toISOString();

  return (
    <div className="space-y-6">
      <VaultHead
        title={TITLE}
        pill={<>Live · <VaultUpdated iso={readAt} /></>}
        actions={
          <StadiumHint
            skin="vault"
            label="About this desk"
            text="Whether money moves on SponsorX right now. Payments are open only while Railway names a provider and this switch is on; every change is recorded with who and why."
          />
        }
      />

      <VaultPanel tone={s.open ? undefined : "late"} delay={0.12}>
        <PaymentSwitch state={s} chip={<VaultChip tone={switchWords(s).chip.tone === "accent" ? "good" : "late"}>{switchWords(s).chip.label}</VaultChip>} />
      </VaultPanel>
    </div>
  );
}
