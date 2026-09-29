import { ShareActions } from "@/components/share-actions";
import { illustrate } from "@/lib/next-apply";

/* --------------------------------------------------------------------------
   /next/schools — the school adoption page, P1-FE-26. A programme proposal
   for principals: it has to read well when forwarded, and print cleanly
   (the site chrome and buttons drop out in print). Copy follows the NEXT
   programme terms (documentation/SponsorX-NEXT-School-Programme-Terms.md).
   "Schools on NEXT" is the live published-editions read.

   Contact: NEXT_CONTACT_EMAIL, SIMULATED default next@sponsorx.net until BTG
   names the real mailbox.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "SponsorX NEXT for schools · Programme proposal" };

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const CONTACT = process.env.NEXT_CONTACT_EMAIL ?? "next@sponsorx.net";

type Edition = { id: string; label: string; school: { name: string; city: string | null; stateCode: string | null } | null };

async function published(): Promise<Edition[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/next/editions`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return ((await res.json()) as { editions: Edition[] }).editions;
  } catch {
    return null;
  }
}

const TOC = ["What the school signs", "What your advisor approves", "What SponsorX carries", "Revenue per edition", "Your first edition", "Student safety and data", "Term", "Next step"];
const GLANCE = [
  { k: "Cost to the school", v: "None", s: "SponsorX carries production, printing and sales." },
  { k: "Agreement", v: "One", s: "Names one faculty advisor." },
  { k: "First edition", v: "Free, digital", s: "Print is optional." },
  { k: "Term", v: "One school year", s: "Exit with 30 days’ notice." },
];
const CARRIES = [
  { k: "Production", v: "Templates, editing tools and publishing." },
  { k: "Printing", v: "When the school chooses print." },
  { k: "Sales operations", v: "Ad contracts, invoicing and collection." },
  { k: "Rights", v: "Photo and content rights, handled properly." },
  { k: "Cost", v: "Everything above, at no cost to the school." },
];

function H({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 id={`s${n}`} className="flex scroll-mt-24 items-baseline gap-3 text-xl font-semibold tracking-tight">
      <span className="text-sm tabular-nums text-accent">{n}</span>
      {children}
    </h2>
  );
}

export default async function NextSchoolsPage() {
  const schools = await published();
  const split = illustrate(1000);
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:py-14 print:block print:py-0">
      <nav aria-label="On this page" className="hidden text-xs lg:block print:hidden">
        <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-faint">On this page</p>
        <ol className="sticky top-24 space-y-2">
          {TOC.map((label, i) => (
            <li key={label}>
              <a href={`#s${i + 1}`} className="text-muted hover:text-text">
                <span className="tabular-nums text-faint">{i + 1}</span> {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="max-w-3xl space-y-10 text-sm leading-relaxed">
        <header className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Programme proposal · for principals and school leaders</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            A student-run sports magazine for your school. SponsorX carries the cost and the work.
          </h1>
          <p className="text-muted">
            SponsorX NEXT gives your students a real media programme: they write, photograph, design and sell the advertising for a magazine about
            your school’s teams. SponsorX provides the platform, templates, training, production and publishing. Your school signs one agreement and
            names one faculty advisor.
          </p>
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <a href="#s8" className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-cta-ink">
              Talk to BTG about your school
            </a>
            <ShareActions />
          </div>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {GLANCE.map((g) => (
              <div key={g.k} className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-[11px] text-muted">{g.k}</dt>
                <dd className="mt-1 text-base font-semibold">{g.v}</dd>
                <dd className="mt-0.5 text-[11px] text-faint">{g.s}</dd>
              </div>
            ))}
          </dl>
        </header>

        <section className="space-y-2">
          <H n={1}>What the school signs</H>
          <p className="text-muted">One programme agreement. It names your faculty advisor, the person who speaks for the school on NEXT. There are no per-edition contracts and no purchase orders.</p>
        </section>

        <section className="space-y-2">
          <H n={2}>What your advisor approves</H>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li>All school-specific content before it is published, in print or online.</li>
            <li>Every student’s participation. No student joins the team without the advisor’s approval, and a guardian’s consent if under 18.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <H n={3}>What SponsorX carries</H>
          <dl className="divide-y divide-line-soft rounded-xl border border-line bg-surface">
            {CARRIES.map((c) => (
              <div key={c.k} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-2.5">
                <dt className="font-medium">{c.k}</dt>
                <dd className="text-muted">{c.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-3">
          <H n={4}>Where each edition’s advertising revenue goes</H>
          <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
            {split.map((s, i) => (
              <span key={s.who} className={["bg-primary", "bg-accent", "bg-warn", "bg-muted"][i]} style={{ width: `${s.pct}%` }} />
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wide text-faint">
                <tr>
                  <th className="py-2 pr-3">Share</th>
                  <th className="py-2 pr-3">Goes to</th>
                  <th className="py-2 text-right">Of $1,000 sold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {split.map((s) => (
                  <tr key={s.who}>
                    <td className="py-2.5 pr-3 font-semibold tabular-nums">{s.pct}%</td>
                    <td className="py-2.5 pr-3">
                      <span className="block font-medium">{s.who}</span>
                      <span className="block text-muted">{s.note}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{s.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-faint">Illustration only: how $1,000 of advertising sold in one edition would be divided. No student is paid; the student pool funds recognition points, which are not cash.</p>
        </section>

        <section className="space-y-2">
          <H n={5}>Your first edition</H>
          <p className="text-muted">The first edition is a free digital edition. Print is optional and can be added for any later edition. SponsorX covers printing costs when you choose it.</p>
        </section>

        <section className="space-y-2">
          <H n={6}>Student safety and data</H>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li><b className="text-text">Minimal data.</b> Name, display name, graduation year, date of birth, school, roles, and a guardian’s contact for under-18s. Nothing more.</li>
            <li><b className="text-text">Never sold.</b> Student data is not sold or shared for marketing.</li>
            <li><b className="text-text">Guardian consent</b> for every student under 18, before they join.</li>
            <li>No GPA and no school records appear on any public page. A student under 18 appears publicly only with a guardian’s consent.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <H n={7}>Term</H>
          <p className="text-muted">One school year. The school can leave at any time with <b className="text-text">30 days’ notice</b>.</p>
        </section>

        <section className="space-y-2 print:hidden">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-muted">Schools on NEXT</h2>
          {schools && schools.length > 0 ? (
            <ul className="space-y-1 text-muted">
              {schools.map((e) => (
                <li key={e.id}>
                  {e.school?.name ?? "Regional edition"}
                  {e.school ? ` · ${[e.school.city, e.school.stateCode].filter(Boolean).join(", ")}` : ""} · {e.label} digital edition
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No schools have published yet. Yours would be one of the first, and BTG supports founding schools closely through the first edition.</p>
          )}
        </section>

        <section className="space-y-3">
          <H n={8}>Next step</H>
          <p className="text-muted">A short call with BTG to walk through the agreement and choose your faculty advisor. No commitment until the agreement is signed.</p>
          <p className="rounded-xl border border-line bg-surface px-4 py-3">
            Email <span className="select-all font-semibold">{CONTACT}</span> with your school’s name, and BTG will set up the call.
          </p>
          <p className="hidden text-xs text-faint print:block">SponsorX NEXT is a programme of BTG Sports Group · sponsorx.net/next/schools</p>
        </section>
      </article>
    </main>
  );
}
