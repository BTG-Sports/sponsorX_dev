/**
 * Categories a school programme of minors does not sell (P9-SEC-01). A
 * student can neither bring one in nor be redirected towards one. Decided
 * conservatively, pending the school terms' own list (P9-PMO-02 §4 lets a
 * school refuse more, never fewer).
 *
 * Pure, in its own file so the rules (student-auto-rules.ts) can read it
 * without a database client; student.ts re-exports it where it always was.
 */
export const NOT_FOR_STUDENTS_LIST: readonly string[] = [
  "ALCOHOL", "TOBACCO_VAPE", "GAMBLING", "CANNABIS", "FIREARMS", "ADULT",
  "POLITICAL", "RELIGIOUS", "PHARMA", "CRYPTO", "ENERGY_DRINK", "SUPPLEMENTS",
];

export const NOT_FOR_STUDENTS: ReadonlySet<string> = new Set(NOT_FOR_STUDENTS_LIST);
