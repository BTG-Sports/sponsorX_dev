import Link from "next/link";

/* --------------------------------------------------------------------------
   /next/about — the public SponsorX NEXT programme landing, P1-FE-24.

   Two audiences on one page — students (14–18) and school administrators —
   each with its own next step. At /next/about because /next is the signed-in
   student portal (spec §8 listed both at /next; one URL can't serve two
   pages). The "Latest editions" block is the live GET /public/next/editions;
   everything else is static copy.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "SponsorX NEXT · Student-run high-school sports media" };

const API_URL = process.env.API_URL ?? "http://localhost:4000";

type Edition = {
  id: string;
  label: string;
  publication: string;
  school: { slug: string; name: string; city: string | null; stateCode: string | null } | null;
};

async function editions(): Promise<Edition[] | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/public/next/editions`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return ((await res.json()) as { editions: Edition[] }).editions;
  } catch {
    return null;
  }
}

const STEPS = [
  { n: "01", title: "Write", text: "Game recaps, athlete features, columns. Your byline on every piece." },
  { n: "02", title: "Shoot", text: "Photos and short video from the sideline, with rights handled properly." },
  { n: "03", title: "Design", text: "Lay out pages in SponsorX templates built for print and phone." },
  { n: "04", title: "Sell", text: "Pitch local businesses and sell the ads. Every sale is credited to you." },
  { n: "05", title: "Publish", text: "Your advisor signs off. We publish digital, and print when your school wants it." },
];

export default async function NextLandingPage() {
  const list = await editions();
  return (
    <main className="mx-auto w-full max-w-6xl space-y-16 px-4 py-10 sm:px-6 lg:py-16">
      <section className="space-y-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">SponsorX NEXT · student-run high-school sports media</p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          Your school’s sports story. <span className="bg-gradient-to-r from-accent to-primary-soft bg-clip-text text-transparent">Told by you.</span>
        </h1>
        <p className="max-w-2xl text-base text-muted">
          NEXT is a sports magazine for your high school, made by students. You write it, shoot it, design it, and sell the ads that pay for it.
          SponsorX brings the platform, templates, training and publishing.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/15 via-surface to-surface p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-accent">For students · ages 14–18</p>
          <h2 className="text-2xl font-semibold tracking-tight">Become the media.</h2>
          <p className="text-sm text-muted">
            Join your school’s NEXT team as a writer, photographer, videographer, designer, editor or on the sales desk. No experience needed.
            Training is part of it.
          </p>
          <Link href="/next/apply" className="mt-auto inline-block self-start rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-cta-ink">
            Apply to join your school’s team →
          </Link>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-surface to-surface p-6">
          <p className="text-[11px] uppercase tracking-[0.2em] text-primary-soft">For schools &amp; administrators</p>
          <h2 className="text-2xl font-semibold tracking-tight">A student media programme, fully carried.</h2>
          <p className="text-sm text-muted">
            One programme agreement and one faculty advisor. SponsorX carries production, printing, sales operations, rights and cost. The first
            edition is digital and free.
          </p>
          <Link href="/next/schools" className="mt-auto inline-block self-start rounded-lg border border-primary/50 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10">
            Bring NEXT to your school →
          </Link>
        </div>
      </section>

      <section id="how" className="space-y-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">How it works</p>
        <h2 className="text-3xl font-semibold tracking-tight">Five jobs. One magazine.</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-xs font-semibold tabular-nums text-accent">{s.n}</p>
              <p className="mt-1 text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-xs text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-faint">Every athlete feature carries a QR code. Readers scan it to open that athlete’s SponsorX profile.</p>
      </section>

      <section id="students" className="space-y-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">What you get out of it</p>
        <h2 className="text-3xl font-semibold tracking-tight">Work that follows you.</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold">Portfolio credit</p>
            <p className="mt-1 text-xs text-muted">Every byline, photo credit and page you design lands in a portfolio with your name on it. Use it for college, internships, anything.</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold">Sales credit that stays yours</p>
            <p className="mt-1 text-xs text-muted">Sell an ad and the sale is credited to you on the record. It stays yours after you graduate.</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="flex items-center gap-2 text-sm font-semibold">
              Recognition points <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-medium text-muted">Not cash</span>
            </p>
            <p className="mt-1 text-xs text-muted">Points recognise what you contribute to the team. They aren’t money, can’t be cashed out, and are never pay.</p>
          </div>
        </div>
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs text-muted">
          <b className="text-text">Under 18?</b> A parent or guardian consents before you join. No GPA, no school records on anything public. Ever. Your faculty advisor approves what gets published.
        </p>
      </section>

      <section id="editions" className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Latest editions</p>
        {list === null ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-sm text-muted">The editions list didn’t load. Try again in a moment — you can still apply or read about the programme for schools.</p>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface p-6">
            <p className="text-sm font-semibold">No editions published yet</p>
            <p className="mt-1 text-xs text-muted">The first NEXT editions publish this school year. Yours could be one of them.</p>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/next/${encodeURIComponent(e.school?.slug ?? "regional")}/${encodeURIComponent(e.id)}`}
                  className="block rounded-xl border border-line bg-surface p-5 transition-colors hover:border-primary/40"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-accent">Digital edition</p>
                  <p className="mt-1 text-sm font-semibold">
                    {e.publication} · {e.label}
                  </p>
                  {e.school && (
                    <p className="mt-0.5 text-xs text-muted">
                      {e.school.name} · {[e.school.city, e.school.stateCode].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <p className="mt-3 text-xs font-semibold text-primary">Read the edition →</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
