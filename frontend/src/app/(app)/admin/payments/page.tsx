import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PaymentSwitch } from "@/components/payment-switch";
import { Badge, Card, StatTile } from "@/components/ui";
import { providerLabel, switchStamp, switchWords, type ApiPaymentSwitch } from "@/lib/payment-switch-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Payments — POL-FE-36 (backend POL-BE-36). BTG's payments switch, on BTG's
   own screen: on or off at once, no deploy. Mission Control's desk; Finance
   works the same switch from the Vault (/finance/payments).

   Reads  GET /payments/switch   { on, open, provider, canTurnOn, changed, history }
   Writes PUT /payments/switch   { open, reason }  (./actions.ts, from the island)

   A dashboard, not a hero (memory admin-desks-are-dashboards): the title,
   three tiles that are the read's own fields, then the switch. The desk's
   two sub-routes (events, disputes) keep their own access entries.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payments";
const TITLE = "Payments";

export default async function PaymentsPage() {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const res = await apiFetch("/payments/switch");
  if (res.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (!res.ok) throw new Error(`Payments switch unavailable (${res.status}).`);
  const s = (await res.json()) as ApiPaymentSwitch;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs text-muted">
          Whether money moves on SponsorX right now. Payments are open only while Railway names a provider and this switch is on; every change is recorded with who and why.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Payments" value={s.open ? "Open" : "Off"} sub={s.open ? "checkout and payouts moving" : "nothing moves until it's on"} />
        <StatTile label="Provider" value={providerLabel(s.provider)} sub={s.canTurnOn ? "set in Railway" : "the Railway setting is the master off"} />
        <StatTile label="Last changed" value={s.changed ? switchStamp(s.changed.at) : "Never"} sub={s.changed ? `by ${s.changed.by ?? "someone at BTG"}` : "the environment's default applies"} />
      </div>

      <Card>
        <PaymentSwitch state={s} chip={<Badge tone={switchWords(s).chip.tone}>{switchWords(s).chip.label}</Badge>} />
      </Card>

      <p className="text-[11px] text-muted">
        What the provider sent and what sponsors disputed stay on their own desks:{" "}
        <Link href={`${PATH}/events`} className="font-medium text-primary hover:underline">Payment events</Link>
        {" · "}
        <Link href={`${PATH}/disputes`} className="font-medium text-primary hover:underline">Disputes</Link>
      </p>
    </div>
  );
}
