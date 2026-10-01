/* --------------------------------------------------------------------------
   Domain errors — P2-BE-04, Guide §04.

   Three distinct failures that are routinely collapsed into one, and must not
   be:

     - **Unauthenticated** — we do not know who you are. Sign in.
     - **Unprovisioned** — we know who you are, and you have no SponsorX
       account. Signing in again will not help; someone has to grant access.
     - **Forbidden** — we know who you are, you have an account, and this is
       not yours. Signing in as someone else is the only path, and saying so
       plainly is a security decision, not a UX one.

   Keeping them apart is what lets the UI tell a new sponsor "ask BTG to set
   you up" instead of bouncing them around a sign-in loop that can never
   succeed.

   Each carries a stable `code` (QA pass 6, P6-BE-05) — a client branches on
   that, never on the message.
   -------------------------------------------------------------------------- */

export class UnauthenticatedError extends Error {
  readonly status = 401;
  readonly code = "unauthenticated";
  constructor(message = "Not signed in.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class UnprovisionedError extends Error {
  readonly status = 403;
  readonly code = "unprovisioned";
  readonly email: string | null;
  constructor(email: string | null) {
    super("Signed in, but no SponsorX account exists for this identity.");
    this.name = "UnprovisionedError";
    this.email = email;
  }
}

/** 2S1-BE-17 — a login BTG switched off (Reject). Refused at sign-in, with the reason. */
export class AccountDisabledError extends Error {
  readonly status = 403;
  readonly code = "account_disabled";
  /** 2S1-BE-13 — `disabledReason` tells a self-closed account from one BTG
   *  switched off: the first can reactivate itself, the second asks BTG. */
  constructor(disabledReason?: string | null) {
    super(
      disabledReason?.startsWith("accountClosure:")
        ? "This SponsorX account is closed. It can be reactivated within 30 days of closing from the reactivation page (/reactivate)."
        : "This SponsorX account has been closed by BTG. Contact BTG support if you think this is a mistake.",
    );
    this.name = "AccountDisabledError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = "forbidden";
  /** Named so an audit entry can record exactly what was refused. */
  readonly resource: string;
  readonly action: string;
  constructor(resource: string, action: string) {
    super(`Not permitted to ${action} ${resource}.`);
    this.name = "ForbiddenError";
    this.resource = resource;
    this.action = action;
  }
}
