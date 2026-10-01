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

export function standing(s: ApiSignupStatus): { title: string; line: string; tone: "success" | "warn" | "muted" } {
  if (s.approved) return { title: "You’re approved", line: `Sign in with ${s.email ?? "your email"} to reach your athlete portal.`, tone: "success" };
  if (s.closed) return { title: "This application is closed", line: "We emailed you about it. You can apply again, or contact BTG.", tone: "muted" };
  if (s.underReview) return { title: "With BTG", line: "Everything’s in. A person at BTG is checking it — usually within a day. We’ll email you either way.", tone: "warn" };
  return { title: "What’s still needed", line: s.missing.length ? `Still to do: ${s.missing.join("; ")}.` : "Nothing more — the checks are running.", tone: "warn" };
}

/** Does the applicant still need to name a guardian here? */
export function needsGuardian(s: ApiSignupStatus): boolean {
  return s.minor && !s.guardian && !s.closed && !s.approved;
}
