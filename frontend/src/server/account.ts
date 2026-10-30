import { redirect } from "next/navigation";

import type { CloseResult, WithdrawResult } from "@/components/account-close";
import { closePanel, GUARDIAN_MUST_ACT, type ApiClosureHeld, type ClosePanel } from "@/lib/account-closure-live";
import { refusalMessage } from "@/lib/onboarding-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-08 / 2S1-BE-13 — closing the signed-in account, shared by the
   athlete and property Settings actions.

   POST /me/close {confirm: true, account} closes the account this login is;
   the API finds it from the login, so nothing in the body can name someone
   else's. On success the login is already switched off, so the person goes
   to the public reactivation page, which says what happened and how to come
   back. A refusal comes back as words; nothing has changed.

   POL-FE-11 (POL-BE-11): before confirming, GET /me/close/preview says what
   closing would affect. With a live deal, money and no payout account, or a
   minor still in a guardian's care, POST /me/close answers 202 HELD instead
   of closing — the account stays open, BTG settles those first — and the
   owner can take it back with POST /me/close/withdraw. A minor's own login
   gets 403 guardian_must_act: their guardian closes it, acting for them.
   -------------------------------------------------------------------------- */

export type ClosingAccountKey = "athlete" | "guardian" | "property";

const SESSION_ENDED = "Your session ended — sign in again, then try once more. Nothing has changed.";
const UNREACHABLE = "Couldn’t reach SponsorX just now. Nothing has changed — try again.";

async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** GET /me/close/preview?account= — what closing would affect, as the close row shows it. */
export async function closurePreview(account: ClosingAccountKey, guardianName: string | null = null): Promise<ClosePanel> {
  try {
    const res = await apiFetch(`/me/close/preview?account=${account}`);
    return closePanel(res.status, await readBody(res), guardianName);
  } catch {
    return closePanel(0, null, guardianName);
  }
}

export async function closeOwnAccount(account: ClosingAccountKey): Promise<CloseResult> {
  let res: Response;
  try {
    res = await apiFetch("/me/close", { method: "POST", body: JSON.stringify({ confirm: true, account }) });
  } catch (e) {
    return { ok: false, message: (e as Error)?.message === "Not signed in." ? SESSION_ENDED : UNREACHABLE };
  }
  const body = await readBody(res);
  /* POL-BE-11 — 202: held for BTG. The login still works; the row says so. */
  if (res.status === 202 && (body as ApiClosureHeld | null)?.state === "HELD") return { ok: true, held: body as ApiClosureHeld };
  if (res.ok) redirect("/reactivate?closed=1");
  const said = refusalMessage(body);
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (res.status === 403 && code === GUARDIAN_MUST_ACT) return { ok: false, code: GUARDIAN_MUST_ACT, message: said ?? "Your guardian closes your account, from their own login." };
  if (res.status === 403) return { ok: false, message: said ?? "This login can’t close that account." };
  if (res.status === 409) return { ok: false, message: said ?? "This account is already closed, or its closing is already with BTG." };
  return { ok: false, message: `Couldn’t close the account (HTTP ${res.status}). Nothing has changed — try again.` };
}

/** POST /me/close/withdraw {account} — take back a closure still held for BTG. */
export async function withdrawClosure(account: ClosingAccountKey): Promise<WithdrawResult> {
  let res: Response;
  try {
    res = await apiFetch("/me/close/withdraw", { method: "POST", body: JSON.stringify({ account }) });
  } catch (e) {
    return { ok: false, message: (e as Error)?.message === "Not signed in." ? SESSION_ENDED : UNREACHABLE };
  }
  if (res.ok) return { ok: true };
  const said = refusalMessage(await readBody(res));
  if (res.status === 409) return { ok: false, message: said ?? "There’s no request waiting for BTG — it may already be decided." };
  return { ok: false, message: said ?? `Couldn’t withdraw it (HTTP ${res.status}). Try again.` };
}
