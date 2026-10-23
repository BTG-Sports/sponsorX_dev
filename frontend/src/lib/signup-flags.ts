/* --------------------------------------------------------------------------
   The three switches on BTG's sign-up settings (PUT /signup-rules/settings):
   staff confirmation of minors (2S1-BE-12), the rules confirmation
   (P8-BE-02) and the collab-agreement acceptance (P8-BE-04). Kept out of
   the "use server" actions file, which may only export async functions.
   -------------------------------------------------------------------------- */

export const SIGNUP_FLAGS = ["staffConfirmMinors", "requireRulesAttestation", "requireCollabAcceptance"] as const;
export type SignupFlag = (typeof SIGNUP_FLAGS)[number];

export function isSignupFlag(v: unknown): v is SignupFlag {
  return typeof v === "string" && (SIGNUP_FLAGS as readonly string[]).includes(v);
}
