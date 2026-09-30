import Link from "next/link";

import { NextApplyWizard } from "@/components/next-apply-wizard";
import type { ApplySchool } from "@/lib/next-apply";

/* --------------------------------------------------------------------------
   /next/apply — "Become the Media", P1-FE-25 wired by P9-FE-06. Phone-first:
   a single column at 390px, with the step rail beside it on a desk. The
   school list is the live GET /public/next/schools (schools that have
   adopted NEXT); if it can't be read the wizard still opens and says so on
   the school step rather than inventing a list.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Become the Media · SponsorX NEXT" };

const API_URL = process.env.API_URL ?? "http://localhost:4000";

async function schools(): Promise<ApplySchool[]> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/next/schools`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    return ((await res.json()) as { schools: ApplySchool[] }).schools;
  } catch {
    return [];
  }
}

const RAIL = ["About you", "Your school", "Your roles", "Parent or guardian (under 18)", "Check it over"];

export default async function NextApplyPage() {
  const list = await schools();
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:py-14">
      <aside className="hidden lg:block">
        <Link href="/next/about" className="text-xs font-semibold tracking-[0.2em] text-accent">
          SPONSORX NEXT
        </Link>
        <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-faint">Student application</p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight">Become the Media.</h1>
        <p className="mt-3 text-sm text-muted">Five short steps. Your faculty advisor reviews it, and you hear back by email.</p>
        <ol className="mt-6 space-y-2 text-sm text-muted">
          {RAIL.map((r, i) => (
            <li key={r} className="flex items-center gap-3">
              <span className="grid size-6 place-items-center rounded-full border border-line text-[11px] tabular-nums">{i + 1}</span>
              {r}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-[11px] text-faint">We keep only what the programme needs. We never sell it. Nothing about grades or school records.</p>
      </aside>
      <section className="mx-auto w-full max-w-md lg:mx-0">
        <div className="mb-6 lg:hidden">
          <Link href="/next/about" className="text-xs font-semibold tracking-[0.2em] text-accent">
            SPONSORX NEXT
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Become the Media.</h1>
        </div>
        <NextApplyWizard schools={list} />
      </section>
    </main>
  );
}
