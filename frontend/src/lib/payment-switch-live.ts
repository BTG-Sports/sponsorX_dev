/* --------------------------------------------------------------------------
   POL-FE-36 — BTG's payments switch, pure logic (backend POL-BE-36).

   Stripe is connected in production with checkout closed, and until now the
   only way to open or close payment was the Railway setting (a deploy, by
   someone with Railway access). GET/PUT /payments/switch is the switch on
   BTG's own screens — the Payments desk in Mission Control (/admin/payments)
   and its twin in the Vault (/finance/payments). This file turns the API's
   answer into words and checks the one input (the reason) before it is sent;
   components/payment-switch.tsx renders it.

   Payment is OPEN only while BOTH hold: Railway names a provider (`provider`
   not "none" — the master off) AND the switch is on. Every figure and name
   here is the API's own (memory stats-must-be-retrievable): nothing is
   guessed about the provider or who changed it.
   -------------------------------------------------------------------------- */

/* ----------------------------------------------------------------- shapes */

/** One row of `history` — the audit rows of `paymentSwitch.change`, newest first. */
export type ApiPaymentSwitchChange = {
  at: string;
  /** What the switch was set to by this change. */
  on: boolean;
  reason: string;
  /** The changer's email, or null when the API could not name them. */
  by: string | null;
};

/** GET /payments/switch. */
export type ApiPaymentSwitch = {
  /** BTG's switch. */
  on: boolean;
  /** Whether payment is actually open: the switch AND a provider configured. */
  open: boolean;
  /** The Railway setting — "none", or the provider's name ("stripe"). */
  provider: string;
  /** Turning it on needs a provider configured. */
  canTurnOn: boolean;
  /** Null until someone first sets it (the default is shown in `on`). */
  changed: { at: string; by: string | null; reason: string } | null;
  history: ApiPaymentSwitchChange[];
};

/* ---------------------------------------------------------------- wording */

/** Everywhere money would move while payment is closed, the button says so. */
export const PAYMENTS_OPEN_SOON = "Payments open soon";
/** Why "Turn on" is disabled while Railway names no provider. */
export const PROVIDER_NOT_SET_UP = "Stripe isn't set up yet";
/** The reason's floor — the API's (PaymentSwitchInput: trimmed, 5 to 500). */
export const REASON_MIN = 5;
export const REASON_MAX = 500;

type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/** "Stripe" from "stripe"; "No provider" from "none". Never a name the API didn't send. */
export function providerLabel(provider: string): string {
  const p = provider.trim();
  if (!p || p.toLowerCase() === "none") return "Not set up";
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** ISO → "Oct 30, 2026, 14:05 UTC" (UTC, so server and test agree); "" for nothing. */
export function switchStamp(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

export type SwitchWords = {
  /** Which of the three states the desk is in. */
  state: "open" | "off" | "no-provider";
  /** The chip beside the title — open (accent) or off (warn), nothing else. */
  chip: { label: string; tone: Extract<Tone, "accent" | "warn"> };
  headline: string;
  /** What this state means for money, in one sentence. */
  text: string;
  /** "BTG's switch: on" / "off" — shown apart from `open`, since the two can differ. */
  switchLine: string;
  providerLine: string;
  /** "Turned off by x on …: reason", or null before anyone set it. */
  changedLine: string | null;
  /** The one button: what it would do next. */
  next: { open: boolean; label: "Turn on" | "Turn off"; disabled: boolean; disabledNote: string | null };
};

/** The API's answer in words. */
export function switchWords(s: ApiPaymentSwitch): SwitchWords {
  const noProvider = !s.canTurnOn;
  const state: SwitchWords["state"] = s.open ? "open" : noProvider ? "no-provider" : "off";
  const chip = s.open ? { label: "Open", tone: "accent" as const } : { label: "Off", tone: "warn" as const };
  const headline = s.open ? "Payments are open" : "Payments are off";
  const text = s.open
    ? "Sponsors pay by card from the order page, approved payouts are sent, and an approved order unpaid after its three days is cancelled."
    : noProvider
      ? `${PROVIDER_NOT_SET_UP}. Payments can't open until it is, even with the switch on.`
      : "No checkout, no payout sent or set up, and no order cancelled for non-payment — approved orders and payouts wait.";
  const changedLine = s.changed
    ? `${s.on ? "Turned on" : "Turned off"} by ${s.changed.by ?? "someone at BTG"} on ${switchStamp(s.changed.at)}: ${s.changed.reason}`
    : null;
  const turnOn = !s.on;
  return {
    state,
    chip,
    headline,
    text,
    switchLine: `BTG's switch: ${s.on ? "on" : "off"}`,
    providerLine: `Provider: ${providerLabel(s.provider)}`,
    changedLine,
    next: {
      open: turnOn,
      label: turnOn ? "Turn on" : "Turn off",
      disabled: turnOn && noProvider,
      disabledNote: turnOn && noProvider ? PROVIDER_NOT_SET_UP : null,
    },
  };
}

/** The confirm step: the question and what saying yes means, in one line each. */
export function confirmWords(open: boolean): { title: string; text: string; button: string } {
  return open
    ? {
        title: "Turn payments on?",
        text: "Checkout opens, and every approved payout that waited is queued to send now.",
        button: "Turn payments on",
      }
    : {
        title: "Turn payments off?",
        text: "No checkout, no payout sent or set up, and no order cancelled for non-payment — everything waits until it's on again.",
        button: "Turn payments off",
      };
}

/** Why a reason can't be sent, or null when it can — the API's own rule, checked here first. */
export function reasonProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < REASON_MIN) return `Say why, in at least ${REASON_MIN} characters — the reason is kept with the change.`;
  if (r.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  return null;
}

/** One history row as the desk lists it. */
export function historyLine(h: ApiPaymentSwitchChange): { when: string; what: "Turned on" | "Turned off"; who: string; reason: string } {
  return {
    when: switchStamp(h.at),
    what: h.on ? "Turned on" : "Turned off",
    who: h.by ?? "someone at BTG",
    reason: h.reason,
  };
}

const UNREACHABLE = "The API is unreachable — nothing changed. Try again in a minute.";

/**
 * What BTG reads when PUT /payments/switch is refused. A 409 is "on" without
 * a provider; a 422 the reason; a 403 the role rule — each in the API's own
 * words when it sent any, else these.
 */
export function switchRefusal(status: number, said?: unknown): string {
  const body = said as { error?: { message?: unknown; issues?: { message?: unknown }[] }; message?: unknown } | null | undefined;
  const issue = body?.error?.issues?.[0]?.message;
  const msg = typeof body?.error?.message === "string" ? body.error.message : typeof body?.message === "string" ? body.message : null;
  if (status === 0) return UNREACHABLE;
  if (status === 409) return msg ?? `${PROVIDER_NOT_SET_UP}. Nothing changed.`;
  /* A reason the API's schema refused (400, the issue named) or its own check did (422). */
  if (status === 422 || status === 400) return (typeof issue === "string" ? issue : null) ?? msg ?? reasonProblem("") ?? "Say why.";
  if (status === 403) return "Only a BTG admin or Finance can change the payments switch. Nothing changed.";
  if (status === 401) return "Your session ended — sign in again, then try once more. Nothing changed.";
  return msg ?? `The switch wasn't changed (${status}). Try again in a minute.`;
}
