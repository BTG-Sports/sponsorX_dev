import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui";
import { KeepStudentCode } from "@/components/keep-student-code";

/* --------------------------------------------------------------------------
   /s/[code] — PUBLIC (P9-FE-01, over P9-BE-07's resolver). What a business
   owner sees after a student hands them a code: who sent them and from which
   school — the display name and the school, never anything else about a
   (usually minor) student (P9-SEC-01). An unknown code, or one whose student
   is no longer active, is a 404.

   POL-FE-58 (app review B7): the code now travels into the sponsor's
   request form — the button opens it with ?code=, and this browser keeps
   the code (30 days) so it's filled in even after signing up first. The
   request carries it, and the sale is credited to the student.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type Resolved = { code: string; studentName: string; school: string };

async function resolve(code: string): Promise<Resolved | null> {
  const res = await fetch(`${API_URL}/api/v1/public/s/${encodeURIComponent(code)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Code lookup unavailable (${res.status}).`);
  return (await res.json()) as Resolved;
}

export default async function StudentCodeLanding({ params }: PageProps<"/s/[code]">) {
  const { code } = await params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(code)) notFound();
  const r = await resolve(code);
  if (!r) notFound();

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:py-16">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">SponsorX NEXT · student media</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {r.studentName} from {r.school} sent you
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Students at {r.school} write, shoot and sell their school&rsquo;s edition. Advertising in it supports the
        programme — and {r.studentName} gets the credit for bringing you in.
      </p>
      <Card className="mt-6 border-next/30">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Their code</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wider text-next">{r.code}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          It goes with your request automatically, so the sale is credited to {r.studentName}. If you talk to BTG instead, mention it.
        </p>
      </Card>
      <KeepStudentCode code={r.code} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/sponsor/marketplace?code=${encodeURIComponent(r.code)}`}
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-cta-ink hover:bg-primary-soft"
        >
          Request advertising — code included
        </Link>
        <Link
          href="/packages"
          className="inline-flex items-center justify-center rounded-lg border border-line px-4 py-2 text-sm font-medium text-text hover:bg-surface-2"
        >
          See advertising packages
        </Link>
      </div>
    </main>
  );
}
