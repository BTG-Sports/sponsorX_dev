import { Card, SectionHeading } from "@/components/ui";
import { StudentCodeCard } from "@/components/student-code-card";
import { SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { liveStudent, requestOrigin } from "../live";
import { LiveStudentCode, StudentUnlinked } from "../live-views";
import { student } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   My code (P1-FE-19, spec §5.1, §8). One code per student, forever — the
   /s/[code] resolver credits any sale that arrives through it. This page has
   exactly one job: make the code effortless to hand to a business owner, and
   make the promise behind it legible to a teenager (and their parent).
   -------------------------------------------------------------------------- */

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "Share it",
    body: "Say it, write it on a rate card, or let them scan — the link and the code do the same thing.",
  },
  {
    title: "They mention it",
    body: "When the business talks to SponsorX, your code ties the sale to you. No form for them to fill in.",
  },
  {
    title: "You're credited at close",
    body: "When the sponsor pays, SponsorX writes the sale to your ledger. That row is permanent.",
  },
];

export default async function StudentCodePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* P9-FE-01 — a signed-in student reads their own records; ?demo= and BTG
     previews keep the fixture screen below. */
  if (!demo) {
    const live = await liveStudent(["code"]);
    if (live?.kind === "unlinked") return <StudentUnlinked title="My code" />;
    if (live) return <LiveStudentCode live={live} origin={await requestOrigin()} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My code</h1>
        <p className="mt-1 text-xs text-muted">
          {student.displayName} · {student.school}
        </p>
      </div>

      <div className="sx-animate">
        <StudentCodeCard
          code={student.salesCode}
          link={`sponsorxnext.com/s/${student.salesCode}`}
        />
      </div>

      <section className="sx-animate sx-delay-1">
        <SectionHeading title="How attribution works" />
        <div className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <Card key={s.title} className="p-4">
              <span className="grid size-6 place-items-center rounded-full bg-next/15 text-[11px] font-semibold text-next">
                {i + 1}
              </span>
              <p className="mt-2.5 text-sm font-medium">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="sx-animate sx-delay-2">
        <Card className="border-next/25">
          <p className="text-sm font-medium">The promise behind the code</p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>
              · Attribution is written once and never edited — your sales
              record stays yours after graduation, even though portal access
              ends.
            </li>
            <li>
              · If SponsorX can&rsquo;t accept a sale (category rules, school
              exclusivities), you keep the credit for developing it.
            </li>
            <li>
              · The QR shown here is a stand-in; the live resolver link goes
              real when the portal is wired (Stage 9, P9-FE-04).
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
