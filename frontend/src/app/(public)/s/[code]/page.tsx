import Link from "next/link";
import { notFound } from "next/navigation";

import { Card } from "@/components/ui";

/* --------------------------------------------------------------------------
   /s/[code] — PUBLIC (P9-FE-01, over P9-BE-07's resolver). What a business
   owner sees after a student hands them a code: who sent them and from which
   school — the display name and the school, never anything else about a
   (usually minor) student (P9-SEC-01). An unknown code, or one whose student
   is no longer active, is a 404.

   The code is shown back so the owner can quote it when they talk to
   SponsorX. Carrying it into a brief automatically is not built yet — the
   brief form has no code field on the page (flagged), so the words on this
   page say to mention it.
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
          Mention this code when you talk to SponsorX so the sale is credited to {r.studentName}.
        </p>
      </Card>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/packages"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-cta-ink hover:bg-primary-soft"
        >
          See advertising packages
        </Link>
      </div>
    </main>
  );
}
