/* --------------------------------------------------------------------------
   2S1-FE-06 — the athlete's side of automatic approval, after /join:
   what is still needed, read from the API (2S1-BE-09 / -10):

     GET  /applications/intake/status?token=              this checklist
     POST /applications/intake/confirm-email {token}      the receipt's link
     POST /applications/intake/documents?token=           government ID (adult) or school ID (minor)
     POST /applications/intake/guardian?token=            a minor names their guardian

   An adult is approved once their email is confirmed and their government
   ID is in (with a date of birth, and not a likely duplicate). A minor
   uploads a school ID, and their guardian does their own steps on the page
   their email links to. Pure: shapes and the words the screens derive.
   -------------------------------------------------------------------------- */

export type ApiSignupStatus = {
  id: string;
  state: string;
  firstName: string;
  email: string | null;
  emailConfirmed: boolean;
  minor: boolean;
  majorityAge: number;
  idKind: "GOVERNMENT_ID" | "SCHOOL_ID";
  idUploaded: boolean;
  documents: { id: string; kind: string; filename: string; uploadedAt: string | null }[];
  guardian: {
    name: string; email: string; relationship: string; emailConfirmed: boolean; idUploaded: boolean; proofUploaded: boolean;
    agreementAccepted: boolean; approved: boolean;
  } | null;
  /** What is still the applicant's (or their guardian's) to do, in their words. */
  missing: string[];
  approved: boolean;
  /** Everything is in and a person at BTG is looking — never BTG's reasons. */
  underReview: boolean;
  closed: boolean;
};

export type CheckRow = { key: string; label: string; done: boolean; note?: string };

/** The checklist, in the order the applicant does it. */
export function checklist(s: ApiSignupStatus): CheckRow[] {
  const id = s.idKind === "SCHOOL_ID" ? "School ID" : "Government ID";
  const rows: CheckRow[] = [
    { key: "submitted", label: "Application sent", done: true },
    { key: "email", label: "Email confirmed", done: s.emailConfirmed, note: s.emailConfirmed ? undefined : `Open the link we emailed to ${s.email ?? "you"}.` },
    {
      key: "id", label: `${id} uploaded`, done: s.idUploaded,
      note: s.idUploaded ? undefined : s.idKind === "SCHOOL_ID" ? "Under 18 where you live? A school ID (or similar) proves who you are." : "A driver’s license, passport or state ID.",
    },
  ];
  if (s.minor) {
    const g = s.guardian;
    rows.push({ key: "guardian", label: g ? `Guardian named: ${g.name}` : "Name your guardian", done: Boolean(g), note: g ? undefined : `Under ${s.majorityAge} where you live, so a parent or guardian approves your agreements and payments.` });
    if (g) {
      rows.push(
        { key: "g-email", label: `${g.name.split(/\s+/)[0]} opened their link`, done: g.emailConfirmed, note: g.emailConfirmed ? undefined : `We emailed ${g.email}.` },
        { key: "g-docs", label: "Their ID and proof of guardianship", done: g.idUploaded && g.proofUploaded },
        { key: "g-agreement", label: "The guardian agreement", done: g.agreementAccepted },
      );
    }
  }
  rows.push({ key: "approved", label: "Approved", done: s.approved, note: s.approved ? undefined : s.underReview ? "A person at BTG is checking — we’ll email you." : undefined });
  return rows;
}

export const SIGN_IN_HREF = "/login";

export type Standing = {
  title: string;
  line: string;
  tone: "success" | "warn" | "muted";
  /** POL-FE-34 — "You're approved" carries the way in: the public site's sign-in. */
  cta: { label: string; href: string } | null;
};

export function standing(s: ApiSignupStatus): Standing {
  if (s.approved) {
    return { title: "You’re approved", line: `Sign in with ${s.email ?? "your email"} to reach your athlete portal.`, tone: "success", cta: { label: "Sign in", href: SIGN_IN_HREF } };
  }
  if (s.closed) return { title: "This application is closed", line: "We emailed you about it. You can apply again, or contact BTG.", tone: "muted", cta: null };
  if (s.underReview) return { title: "With BTG", line: "Everything’s in. A person at BTG is checking it — usually within a day. We’ll email you either way.", tone: "warn", cta: null };
  return { title: "What’s still needed", line: s.missing.length ? `Still to do: ${s.missing.join("; ")}.` : "Nothing more — the checks are running.", tone: "warn", cta: null };
}

/** Does the applicant still need to name a guardian here? */
export function needsGuardian(s: ApiSignupStatus): boolean {
  return s.minor && !s.guardian && !s.closed && !s.approved;
}

/** POL-FE-16 — can the applicant change the guardian's email here? The API
 *  (POST /applications/intake/guardian) re-names the guardian until BTG has
 *  approved them; after that it is BTG's to change. */
export function canChangeGuardian(s: ApiSignupStatus): boolean {
  return s.minor && Boolean(s.guardian) && !s.guardian!.approved && !s.closed && !s.approved;
}

export type GuardianDraft = { legalName: string; email: string; relationship: "PARENT" | "LEGAL_GUARDIAN" | "AUTHORIZED_REP" };

/** The change form starts from the guardian already named — same name and
 *  relationship, the email blank so the mistyped one is not resent. */
export function guardianChangeDraft(s: ApiSignupStatus): GuardianDraft {
  const g = s.guardian;
  const rel = g?.relationship;
  return {
    legalName: g?.name ?? "",
    email: "",
    relationship: rel === "LEGAL_GUARDIAN" || rel === "AUTHORIZED_REP" ? rel : "PARENT",
  };
}

/** The email the resend would go to, so the change control says what it fixes. */
export function guardianEmailLine(s: ApiSignupStatus): string | null {
  return s.guardian ? `We're emailing ${s.guardian.email}. Wrong address? Change it and we email the new one.` : null;
}
