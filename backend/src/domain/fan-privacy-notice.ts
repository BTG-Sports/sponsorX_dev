/**
 * The fan privacy notice — P0-LEG-04, approved 2026-10-22 (fan consent
 * wording, document 3 §8). Linked from the public reward page, no login.
 *
 * Served from here, like the consent wording, so the page never keeps its
 * own copy. Every statement is one the product makes true:
 *
 *   - only the optional email (with its consent version and time) is fan PII;
 *   - the IP is used for rate limits and a city/region guess, never stored;
 *   - the sponsor gets the address only with the second box ticked;
 *   - the address is deleted FAN_EMAIL_RETENTION_DAYS after the claim
 *     (fan-data-retention.ts, P8-BE-05);
 *   - data stays in the United States (P0-PMO-02, US East).
 *
 * A wording change is a new dated version; the old one stays listed.
 */
import { env } from "../config/env";
import { FAN_EMAIL_RETENTION_DAYS } from "./fan-data-retention";

export const CURRENT_FAN_PRIVACY_VERSION = "2026-10-22" as const;

export type FanPrivacyNotice = {
  version: string;
  title: string;
  sections: { heading: string; text: string }[];
};

export function fanPrivacyNotice(): FanPrivacyNotice {
  const contact = env.SUPPORT_EMAIL;
  const address = env.BTG_POSTAL_ADDRESS;
  return {
    version: CURRENT_FAN_PRIVACY_VERSION,
    title: "SponsorX fan privacy notice",
    sections: [
      {
        heading: "Who we are",
        text: `SponsorX is run by BTG Sports Group LLC${address ? `, ${address}` : ""}. Contact: ${contact}.`,
      },
      {
        heading: "What we collect",
        text:
          "If you give it, your email address, and when and which version of the consent you agreed to. " +
          "When you scan or claim, we also record which reward, the time, and, for some links, the approximate " +
          "city and region worked out from your internet address. We do not keep your internet address. " +
          "We do not ask for your name, phone number or address.",
      },
      {
        heading: "Why",
        text:
          "To send you your reward code and help you use it; to stop abuse (for example, limiting how many claims " +
          "come from one connection); and to show the sponsor how many fans scanned, claimed and redeemed, as totals " +
          "with no personal details.",
      },
      {
        heading: "Who gets it",
        text:
          "BTG staff who run SponsorX. Our service providers (hosting, email delivery, our CRM) only to run the " +
          "service. The sponsor of the reward receives your email only if you ticked the second box.",
      },
      {
        heading: "How long we keep it",
        text: `We delete your email ${FAN_EMAIL_RETENTION_DAYS} days after you claim the reward.`,
      },
      {
        heading: "Your choices",
        text:
          "You can claim without an email. You can unsubscribe at any time with one tap. You can ask us to delete " +
          `your email at ${contact}. Depending on where you live (for example, California), you may have further ` +
          `rights over your data; write to us at ${contact} to use them.`,
      },
      {
        heading: "Where",
        text: "Your data is stored in the United States.",
      },
    ],
  };
}
