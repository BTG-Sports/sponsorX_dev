import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { initials } from "@/components/hero";
import {
  SLOT_RACK_CENTS,
  editionBackCover,
  editionPages,
  editionReaderArticles,
  editionReaderSlugs,
  money,
  student,
  studentEdition,
  type EditionSlot,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   The free digital edition — P1-FE-27, spec principle 10: free digital is the
   V1 reader product, not a deferred nicety. (public)/next/[school]/[edition].

   Two hard rules from the acceptance:
   - No new type scale. Articles run on the house scale — prose is text-base /
     leading-relaxed inside a measure, headlines are the existing weights.
     Inventing a long-form editorial scale here is the named scope error.
   - No backend. One edition exists in fixtures; any other address is a 404,
     which is honest — an unpublished edition should be unreachable (the
     wired version enforces that against EditionState, P9-FE-07).

   The reader walks the flatplan in page order: editorial pages carry their
   articles, sold slots render as sponsor cards, open slots as the house ad
   that names the student sales model — the funnel, live from day one.
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "The Northside Current — Fall 2026 · SponsorX NEXT",
};

/* ------------------------------------------------- inline ad treatments */

function SponsorCard({ slot }: { slot: EditionSlot }) {
  return (
    <aside className="my-8 rounded-xl border border-line bg-surface p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-faint">
        Sponsored
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-next/12 text-xs font-bold text-next">
          {initials(slot.sponsor ?? "")}
        </span>
        <div>
          <p className="text-sm font-medium">{slot.sponsor}</p>
          <p className="text-[11px] text-muted">
            Supporting {student.school} student media
          </p>
        </div>
      </div>
    </aside>
  );
}

function OpenSlotCard({ slot }: { slot: EditionSlot }) {
  return (
    <aside className="my-8 rounded-xl border border-dashed border-next/40 bg-next/[0.04] p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-next">
        This space is open
      </p>
      <p className="mt-1.5 text-sm">
        A {slot.kind === "FULL" ? "full page" : slot.kind === "HALF" ? "half page" : "quarter page"}{" "}
        in the next print run — {money(SLOT_RACK_CENTS[slot.kind])}.
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        Every ad in this magazine was sold by a {student.school} student. Ask
        any of them for their sales code.
      </p>
    </aside>
  );
}

/* --------------------------------------------------------------- reader */

export default async function EditionReaderPage({
  params,
}: {
  params: Promise<{ school: string; edition: string }>;
}) {
  const { school, edition } = await params;
  if (
    school !== editionReaderSlugs.school ||
    edition !== editionReaderSlugs.edition
  ) {
    /* One edition exists on fixtures; everything else — including editions
       that are real but unpublished — is unreachable by design. */
    notFound();
  }

  const articleFor = (page: number) =>
    editionReaderArticles.find((a) => a.page === page);

  return (
    <main className="relative">
      {/* ------------------------------------------------------- cover */}
      <header className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-next opacity-[0.14] blur-[90px]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 bottom-0 size-56 rounded-full bg-primary opacity-[0.10] blur-[80px]"
        />
        <div className="mx-auto w-full max-w-2xl px-6 pb-10 pt-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-next">
            SponsorX NEXT · free digital edition
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            {student.publication}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {studentEdition.label} · Issue 03 · {student.school},{" "}
            {student.region}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="primary">free to read</Badge>
            <Badge tone="neutral">print edition {studentEdition.publishTarget}</Badge>
            <Badge tone="neutral">
              written, shot and sold by students
            </Badge>
          </div>

          {/* contents — anchors, no JS */}
          <nav aria-label="Contents" className="mt-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
              In this issue
            </p>
            <ul className="mt-2 space-y-1.5">
              {editionReaderArticles.map((a) => (
                <li key={a.page}>
                  <a
                    href={`#p${a.page}`}
                    className="group flex items-baseline justify-between gap-4 text-sm transition-colors hover:text-next"
                  >
                    <span className="min-w-0 truncate">
                      <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-next">
                        {a.section}
                      </span>
                      {a.headline}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-faint">
                      {a.minutes} min
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------ the flow */}
      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        {editionPages.map((page) => {
          const article = articleFor(page.page);
          return (
            <section key={page.page} id={`p${page.page}`}>
              {article && (
                <article className="py-8 first:pt-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-next">
                    {article.section}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold leading-snug tracking-tight">
                    {article.headline}
                  </h2>
                  <p className="mt-2 text-xs text-muted">
                    By{" "}
                    <span className="font-medium text-text">
                      {article.byline}
                    </span>
                    , Class of {article.bylineClass} · {article.minutes} min
                    read
                  </p>

                  {article.gallery && (
                    <>
                      {/* Twelve frames because the headline says twelve — and
                          each placeholder names itself, so "pending" reads as
                          intent rather than a broken image grid. */}
                      <div className="mt-5 grid grid-cols-3 gap-2" aria-hidden="true">
                        {Array.from({ length: 12 }, (_, i) => (
                          <div
                            key={i}
                            className="grid aspect-[4/3] place-items-center rounded-lg bg-[repeating-linear-gradient(135deg,var(--sx-surface-2),var(--sx-surface-2)_6px,color-mix(in_srgb,var(--sx-line)_50%,transparent)_6px,color-mix(in_srgb,var(--sx-line)_50%,transparent)_7px)]"
                          >
                            <span className="text-[10px] font-semibold tabular-nums text-faint">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] text-faint">
                        Photos arrive with the print files —{" "}
                        {studentEdition.publishTarget}.
                      </p>
                    </>
                  )}

                  <div className="mt-5 space-y-4 text-base leading-relaxed text-text/90">
                    {article.paras.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>

                  {article.pullQuote && (
                    <blockquote className="my-6 border-l-2 border-next pl-4 text-lg font-medium leading-snug">
                      “{article.pullQuote}”
                    </blockquote>
                  )}
                </article>
              )}

              {/* the page's inventory, in magazine order */}
              {page.slots.map((slot) =>
                slot.state === "SOLD" ? (
                  <SponsorCard key={slot.code} slot={slot} />
                ) : slot.state === "OPEN" ? (
                  <OpenSlotCard key={slot.code} slot={slot} />
                ) : null /* reserved slots are not public information */,
              )}
            </section>
          );
        })}

        {/* ------------------------------------------------ back cover */}
        {editionBackCover.state === "OPEN" && (
          <aside className="my-8 rounded-xl border border-next/40 bg-surface p-5 shadow-[0_0_30px_-14px_var(--sx-next)]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-next">
              The back cover — 1 of 1
            </p>
            <p className="mt-1.5 text-sm">
              The most-seen page of the print run is still open for{" "}
              {studentEdition.label} — {money(SLOT_RACK_CENTS.BACK_COVER)},
              until {studentEdition.closeDate}.
            </p>
          </aside>
        )}

        {/* -------------------------------------------------- masthead */}
        <footer className="mt-12 border-t border-line pt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
            Masthead
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {student.publication} is written, photographed, designed and sold
            by {student.school} students, advised by {student.advisor}.
            Published by SponsorX NEXT.
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Student and athlete pages are created with recorded consent and can
            be withdrawn at any time. Every statistic in this issue names its
            source.
          </p>
        </footer>
      </div>
    </main>
  );
}
