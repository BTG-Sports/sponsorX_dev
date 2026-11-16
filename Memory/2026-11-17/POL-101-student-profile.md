# 2026-11-17 · POL-BE-101 / POL-FE-101 · NEXT student profile (infinex1, with Claude)

Branch `feat/POL-101-student-profile`. Raised as "POL-52", but polish.md #52 and the
tracker's `POL-FE-52` were already the whole-app review's (2026-11-15), and items run to
#100. So this is **#101**, and the three records-only items below are **#102–#104**.

- **Found in live staging practice:** a signed-in NEXT student (`/next`: Home,
  Assignments, My sales, My code, Points) had no page showing their own details. The NEXT
  spec never defined one; the API had no self-service student endpoint.
- **Backend (`POL-BE-101`):** `GET /students/me` and `PATCH /students/me`
  (`backend/src/domain/student-profile.ts`; contracts `StudentDisplayNameInput` (strict) and
  `StudentProfile`; routes registered before `/students/:id`; both rows in the registry).
  - The record is the login's own (`User.studentId` → `whereFor(student)` + id), tenant-scoped;
    only a STUDENT login (advisor, guardian, BTG, sponsor → 403).
  - Only the display name is editable: trimmed, inner spaces collapsed, 2–60 characters, a
    letter or number, no control / zero-width / bidi characters. Any other body key → 400.
    Audited `student.displayNameUpdate` (before/after); the same name writes nothing.
    INACTIVE / REJECTED → 409 `student_profile_locked`.
  - The response carries no DOB, age band, email, reviewer notes or guardian detail; a
    minor's guardian is `{ linked, verified }` only.
  - **Advisor contact:** the model links an advisor to a school only via their login (User,
    role ADVISOR, `propertyId`), which has an email and no name. The page shows the active
    advisors' emails (max 5, disabled logins excluded). A name needs #103.
  - Not done: no restricted-words check on the display name (the application's isn't checked
    either; the list's rule is route-to-review, never refuse).
- **Frontend (`POL-FE-101`):** `/next/profile` + "Profile" in the menu (not the phone tab
  bar: five tabs, full). Display name with a Change form (`DisplayNameForm`,
  `updateDisplayNameAction`, the same rule checked first by `displayNameProblem`); every
  other row says "Wrong? Ask your faculty advisor to correct it"; advisor emails as mailto;
  BTG preview = fixture student, edit off. Route map row added.
- **Tests:** `backend/tests/pol-be-101-student-profile.test.ts` (contract + HTTP over a real
  DB: own read/edit/audit, another student's record, cross-tenant, non-student roles,
  validation, locked states; skips without Postgres), `…profile.unit.test.ts` (same rules,
  Prisma stubbed, runs anywhere), `frontend/tests/student-profile.test.ts`.
- **Records only, not built (user, same day):**
  - **#102** sponsor company + own profile (company name/categories via BTG review; no sponsor
    page shows `/me/notification-preferences`; only athlete and property settings do).
  - **#103** school advisor profile (own details + school name, email domain, roster; the
    email-domain and roster tools already sit on the advisor home).
  - **#104** school team profile in the property portal: partial today (`/property/settings`,
    `/property/branding`); `/admin/profile-changes` is `AthleteProfileChange`-only, so it
    needs generalising or a sibling model.
- **Tracker:** Polish rows `POL-BE-101` / `POL-FE-101` (Code review, infinex1, started
  2026-11-17) and `POL-BE/FE-102…104` (Ready; the Status list has no "To do"). Group H. A2
  recounted from the sheet: 145 tasks across 104 flaws (it had said 126 / 90, stale).
  Autofilter, Status validation and conditional formats extended to row 149; the Dashboard's
  Polish formulas already reach row 200.
- **Local test noise (pre-existing, not this change):** with no Postgres and on Windows,
  backend `helpdesk-cases` (splits a CRLF doc on `\n`), `payments-pii` and
  `security-hardening` (backslash paths / no browser) and `sql-rules-in-migrations` (needs
  Postgres) fail; the DB suites skip.
