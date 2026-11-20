import { Badge } from "@/components/ui";
import { initials } from "@/components/hero";
import { EditionPiece } from "@/components/edition-piece";
import { PIECE_KIND_WORDS, coverUrl, issueLine, pieceMedia, readerSponsors, type PublicEdition } from "@/lib/edition-reader";
import { recordArticleOpenAction } from "./actions";

/* --------------------------------------------------------------------------
   P9-FE-07 — the free digital edition from GET /public/editions/:school/:id.
   Only a published edition reaches this component; the API answers 404 for
   every other state. What renders is what the API makes public: masthead,
   the rights-cleared contents with display-name bylines, and the sponsors
   who bought positions — never a price.

   POL-FE-77 — a written piece carries its approved text (the student's
   approved draft), which opens in place and is counted as a click on the
   article.

   P9-FE-14 (P9-BE-26, -27) — the pictures: the cover beside the masthead,
   each piece's photo or video with its article, and each sponsor's ad in its
   position. Each is the public copy the API returns only while its right
   still lets the reader show it, so any of them may be missing: a piece with
   no picture is drawn exactly as before, and a sponsor with no ad keeps its
   name card. Plain <img> and <video> from the storage CDN — no next/image,
   the page stays host-portable (CLAUDE.md). Shapes and order:
   lib/edition-reader.ts.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type { PublicEdition };

/** null = no published edition at that address (404 from the API). */
export async function fetchPublicEdition(school: string, edition: string): Promise<PublicEdition | null> {
  if (!/^[a-z0-9-]{1,80}$/i.test(school) || !/^[A-Za-z0-9_-]{1,80}$/.test(edition)) return null;
  const res = await fetch(`${API_URL}/api/v1/public/editions/${encodeURIComponent(school)}/${encodeURIComponent(edition)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Edition unavailable (${res.status}).`);
  return (await res.json()) as PublicEdition;
}

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function LiveReader({ e }: { e: PublicEdition }) {
  const where = e.school ? [e.school.name, [e.school.city, e.school.stateCode].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : "Regional edition";
  const sponsors = readerSponsors(e);
  const cover = coverUrl(e);
  const holds = issueLine(e);
  return (
    <main className="relative">
      <header className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-next opacity-[0.14] blur-[90px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-0 size-56 rounded-full bg-primary opacity-[0.10] blur-[80px]" />
        <div className="relative mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 pb-10 pt-14 sm:flex-row sm:items-end sm:gap-8">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element -- the cover's public copy on the storage CDN; host-portable, no next/image optimizer
            <img
              src={cover}
              alt={`The cover of ${e.publication}, ${e.label}`}
              decoding="async"
              className="w-40 shrink-0 rounded-lg border border-line bg-surface-2 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] sm:w-44"
            />
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-next">SponsorX NEXT · free digital edition</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-4xl">{e.publication}</h1>
            <p className="mt-2 text-sm text-muted">
              {e.label} · {where}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="primary">free to read</Badge>
              <Badge tone="neutral">published {day(e.publishTarget)}</Badge>
              {e.state !== "PUBLISHED_DIGITAL" && <Badge tone="accent">{e.state === "PRINTED" ? "in print" : "distributed"}</Badge>}
              <Badge tone="neutral">written, shot and sold by students</Badge>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <section aria-labelledby="contents">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="contents" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
              In this issue
            </h2>
            {holds && <p className="text-[11px] text-faint">{holds}</p>}
          </div>
          {e.contents.length === 0 ? (
            <p className="mt-3 text-sm text-muted">This issue&rsquo;s contents aren&rsquo;t online yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line-soft rounded-xl border border-line bg-surface">
              {e.contents.map((c, i) => {
                const media = pieceMedia(c);
                return (
                  <li key={c.id} className="px-4 py-4">
                    <div className="flex items-baseline gap-4">
                      <span className="w-6 shrink-0 text-[11px] font-semibold tabular-nums text-faint">{String(i + 1).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-next">{PIECE_KIND_WORDS[c.kind] ?? c.kind.toLowerCase()}</span>
                        <span className="mt-1 block text-base font-semibold leading-snug [overflow-wrap:anywhere]">{c.title}</span>
                        {c.byline && <span className="mt-1 block text-xs text-muted">By {c.byline}</span>}
                      </span>
                    </div>
                    {/* The picture takes the card's full width — on a phone the numbered indent would leave it a thumbnail. */}
                    {media && (
                      <figure className="mt-3 overflow-hidden rounded-lg border border-line-soft bg-surface-2">
                        {media.kind === "video" ? (
                          <video src={media.url} controls playsInline preload="metadata" aria-label={media.alt} className="block aspect-video w-full bg-black" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element -- the piece's public copy on the storage CDN; host-portable, no next/image optimizer
                          <img src={media.url} alt={media.alt} loading="lazy" decoding="async" className="block max-h-[36rem] w-full object-contain" />
                        )}
                      </figure>
                    )}
                    <div className="pl-10">
                      {c.text && <EditionPiece text={c.text} editionId={e.id} assetId={c.id} record={recordArticleOpenAction} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {sponsors.length > 0 && (
          <section aria-labelledby="sponsors" className="mt-10">
            <h2 id="sponsors" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
              Made possible by
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {sponsors.map((s) =>
                s.ad ? (
                  <li key={s.id} className={`min-w-0 overflow-hidden rounded-xl border border-line bg-surface ${s.wide ? "sm:col-span-2" : ""}`}>
                    <figure>
                      {/* eslint-disable-next-line @next/next/no-img-element -- the ad's public copy on the storage CDN; host-portable, no next/image optimizer */}
                      <img src={s.ad} alt={`Advertisement from ${s.sponsor}`} loading="lazy" decoding="async" className="block max-h-[40rem] w-full bg-surface-2 object-contain" />
                      <figcaption className="flex min-w-0 items-baseline justify-between gap-3 border-t border-line-soft px-4 py-2.5">
                        <span className="min-w-0 truncate text-sm font-medium">{s.sponsor}</span>
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-faint">Sponsored · {s.position}</span>
                      </figcaption>
                    </figure>
                  </li>
                ) : (
                  <li key={s.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface p-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-next/12 text-xs font-bold text-next">{initials(s.sponsor)}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.sponsor}</span>
                      <span className="text-[11px] text-muted">{s.position}</span>
                    </span>
                  </li>
                ),
              )}
            </ul>
          </section>
        )}

        <footer className="mt-12 border-t border-line pt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">Masthead</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {e.publication} is written, photographed, designed and sold by students{e.school ? ` at ${e.school.name}` : ""}. Published by SponsorX NEXT.
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Every piece and picture shown here carries a recorded right to publish digitally. Student pages use display names only.
          </p>
        </footer>
      </div>
    </main>
  );
}
