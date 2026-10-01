import { publicApi } from "@/app/(public)/onboarding/public-api";
import { SUPPORT_EMAIL } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   2S1-BE-16 — the BTG support address, read where it is configured.

   GET /public/support answers SUPPORT_EMAIL (backend env) and whether the
   mailbox is set up yet (SUPPORT_MAILBOX_READY, 2S1-OPS-01). Every page that
   shows the address — the contact page, the guardian request page, the
   reactivation page — reads it from here, so the address is set once.

   If the API can't be reached the page still shows the default address,
   marked as not live: a stuck person always has somewhere to write.
   -------------------------------------------------------------------------- */

export type SupportContact = {
  email: string;
  /** False until 2S1-OPS-01 has the mailbox receiving mail. */
  ready: boolean;
  topics: { key: "GUARDIANSHIP" | "ACCOUNT" | "PAYMENT" | "OTHER"; label: string }[];
};

const FALLBACK: SupportContact = {
  email: SUPPORT_EMAIL.address,
  ready: false,
  topics: [
    { key: "GUARDIANSHIP", label: "Guardianship" },
    { key: "ACCOUNT", label: "Account" },
    { key: "PAYMENT", label: "Payment" },
    { key: "OTHER", label: "Other" },
  ],
};

export async function supportContact(): Promise<SupportContact> {
  try {
    const res = await publicApi("/public/support");
    if (!res.ok) return FALLBACK;
    return (await res.json()) as SupportContact;
  } catch {
    return FALLBACK;
  }
}
