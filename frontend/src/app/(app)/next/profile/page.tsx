import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, Card, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { SkeletonPage } from "@/components/states";
import { DisplayNameForm } from "@/components/student-display-name";
import { demoState } from "@/lib/demo";
import { student } from "@/lib/fixtures";
import {
  STUDENT_STATE_COPY,
  guardianStatusWords,
  studentStatusWords,
  type ApiStudentProfile,
} from "@/lib/students-live";
import { liveStudentProfile } from "../live";
import { StudentUnlinked } from "../live-views";

/* --------------------------------------------------------------------------
   Profile — POL-FE-101 (found in staging practice, 2026-11-17: a signed-in
   student had no page showing their own details; the NEXT spec never
   defined one).

   The student's own record from GET /students/me (POL-BE-101): legal and
   display name, graduation year, school, masthead roles, account state,
   sales code and — for a minor — whether a parent or guardian is linked and
   confirmed, as a status only. The display name is the one thing they
   change (PATCH /students/me). Everything else is the school's record, so
   every other row says to ask the faculty advisor, and the page lists the
   advisor's email when the school has one. No messaging here: the address
   is a mailto.

   BTG previewing the portal is not a student, so it sees the fixture
   student with the edit switched off.
   -------------------------------------------------------------------------- */

const ASK = "Wrong? Ask your faculty advisor to correct it.";

/** The fixture student, as the API would answer — for BTG's preview and ?demo=. */
const PREVIEW: ApiStudentProfile & { advisorName: string } = {
  id: "preview",
  legalName: student.displayName,
  displayName: student.displayName,
  gradYear: student.gradYear,
  school: { name: student.school },
  masthead: student.masthead,
  state: student.state,
  leftAt: null,
  code: student.salesCode,
  minor: true,
  guardian: { linked: true, verified: true },
  advisors: [],
  advisorName: student.advisor,
  editable: ["displayName"],
};

export default async function StudentProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  if (!demo) {
    const live = await liveStudentProfile();
    if (live?.kind === "unlinked") return <StudentUnlinked title="Profile" />;
    if (live) {
      const locked = live.profile.state === "INACTIVE" || live.profile.state === "REJECTED";
      return (
        <ProfileView
          p={live.profile}
          editDisabled={locked ? "You're no longer on the programme, so your profile can't be changed. Ask your faculty advisor." : undefined}
        />
      );
    }
  }

  return (
    <ProfileView
      p={PREVIEW}
      advisorName={PREVIEW.advisorName}
      editDisabled="Preview: only a signed-in student can change their display name."
    />
  );
}

function Row({ label, children, hint = ASK }: { label: string; children: ReactNode; hint?: string | null }) {
  return (
    <li className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="min-w-0">
        <div className="break-words text-sm">{children}</div>
        {hint && <p className="mt-0.5 text-[10px] text-faint">{hint}</p>}
      </div>
    </li>
  );
}

function ProfileView({ p, editDisabled, advisorName }: { p: ApiStudentProfile; editDisabled?: string; advisorName?: string }) {
  const status = studentStatusWords({ state: p.state, reviewerNotes: null });
  const guardian = guardianStatusWords(p.guardian);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="mt-1 text-xs text-muted">Your details on SponsorX NEXT · {p.school.name}</p>
      </div>

      <Card className="sx-animate border-next/25">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Display name</p>
        <p className="mt-1 break-words text-lg font-semibold tracking-tight">{p.displayName}</p>
        <p className="mt-1 text-xs text-muted">
          The name on your pages, on your advisor&rsquo;s list and on your code&rsquo;s link. You can change it.
        </p>
        <div className="mt-3">
          <DisplayNameForm current={p.displayName} disabledReason={editDisabled} />
        </div>
      </Card>

      <section className="sx-animate sx-delay-1">
        <SectionHeading title="Your details" hint="From your application. Your school corrects these, not you." />
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            <Row label="Legal name">{p.legalName}</Row>
            <Row label="Graduation year">{p.gradYear ? `Class of ${p.gradYear}` : <span className="text-muted">Not given</span>}</Row>
            <Row label="School">{p.school.name}</Row>
            <Row label="Roles">
              {p.masthead.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {p.masthead.map((m) => (
                    <Badge key={m} tone="primary">{m.toLowerCase()}</Badge>
                  ))}
                </span>
              ) : (
                <span className="text-muted">None yet</span>
              )}
            </Row>
            <Row label="Account">
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={p.state === "ACTIVE" ? "accent" : p.state === "REJECTED" || p.state === "INACTIVE" ? "neutral" : "warn"}>
                  {STUDENT_STATE_COPY[p.state]}
                </Badge>
                <span className="text-xs text-muted">{status.title}</span>
              </span>
            </Row>
            <Row label="Sales code">
              {p.code ? (
                <Link href="/next/code" className="font-semibold text-next hover:underline">{p.code}</Link>
              ) : (
                <span className="text-muted">{p.state === "ACTIVE" ? "Not issued yet" : "Issued once you're on the masthead"}</span>
              )}
            </Row>
            {guardian && (
              <Row label="Parent or guardian">
                <span className={guardian.tone === "success" ? "text-success" : "text-warn"}>{guardian.label}</span>
              </Row>
            )}
          </ul>
        </Card>
      </section>

      <section className="sx-animate sx-delay-2">
        <Card>
          <p className="text-sm font-medium">Something wrong above?</p>
          {p.advisors.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-muted">
                Ask your school&rsquo;s faculty advisor to correct it. Tell them which detail is wrong and what it should say.
              </p>
              <ul className="mt-2 space-y-1">
                {p.advisors.map((a) => (
                  <li key={a.email} className="text-xs">
                    <a href={`mailto:${a.email}`} className="font-medium text-next hover:underline">{a.email}</a>
                  </li>
                ))}
              </ul>
            </>
          ) : advisorName ? (
            <p className="mt-1 text-xs text-muted">
              Ask your school&rsquo;s faculty advisor, {advisorName}, to correct it.
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted">
              Ask your school&rsquo;s faculty advisor to correct it. Your school has no advisor on SponsorX yet, so
              if you can&rsquo;t reach them, <Link href="/next/help" className="text-next hover:underline">ask SponsorX through Help</Link>.
            </p>
          )}
        </Card>
      </section>

      <p className="flex items-center gap-1.5 text-[10px] text-faint">
        your own record <MiniChip kind="ver">SponsorX records</MiniChip>
      </p>
    </div>
  );
}
