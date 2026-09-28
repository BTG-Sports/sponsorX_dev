import { Badge } from "@/components/ui";
import { initials } from "@/components/hero";

/* --------------------------------------------------------------------------
   P9-FE-07 — the free digital edition from GET /public/editions/:school/:id.
   Only a published edition reaches this component; the API answers 404 for
   every other state. What renders is what the API makes public: masthead,
   the rights-cleared contents with display-name bylines, and the sponsors
   who bought positions — never a price.

   The ledger stores each piece's title and its file (R2), not article prose,
   so the reader lists the issue's contents rather than inventing body text.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type PublicEdition = {
  id: string;
  label: string;
  state: "PUBLISHED_DIGITAL" | "PRINTED" | "DISTRIBUTED";
  publishTarget: string;
  printDate: string | null;
  publication: string;
  school: { slug: string; name: string; city: string | null; stateCode: string | null } | null;
  contents: Array<{ id: string; kind: string; title: string; byline: string | null }>;
  sponsors: Array<{ id: string; slotCode: string; kind: string; sponsor: string }>;
};

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

const KIND: Record<string, string> = {
  ARTICLE: "Article",
  PHOTO: "Photo",
  PHOTO_PACKAGE: "Photo package",
  INTERVIEW: "Interview",
  VIDEO: "Video",
};

const POSITION: Record<string, string> = {
  BACK_COVER: "Back cover",
  PRESENTING: "Presenting sponsor",
  FULL: "Full page",
  HALF: "Half page",
  QUARTER: "Quarter page",
};

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function LiveReader({ e }: { e: PublicEdition }) {
  const where = e.school ? [e.school.name, [e.school.city, e.school.stateCode].filter(Boolean).join(", ")].filter(Boolean).join(" · ") : "Regional edition";
  /* presenting and back cover first — the positions readers see most */
  const order = ["PRESENTING", "BACK_COVER", "FULL", "HALF", "QUARTER"];
  const sponsors = [...e.sponsors].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return (
    <main className="relative">
      <header className="relative overflow-hidden border-b border-line">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-next opacity-[0.14] blur-[90px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-0 size-56 rounded-full bg-primary opacity-[0.10] blur-[80px]" />
        <div className="mx-auto w-full max-w-2xl px-6 pb-10 pt-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-next">SponsorX NEXT · free digital edition</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{e.publication}</h1>
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
      </header>

      <div className="mx-auto w-full max-w-2xl px-6 py-10">
        <section aria-labelledby="contents">
          <h2 id="contents" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
            In this issue
          </h2>
          {e.contents.length === 0 ? (
            <p className="mt-3 text-sm text-muted">This issue&rsquo;s contents aren&rsquo;t online yet.</p>
          ) : (
            <ol className="mt-3 divide-y divide-line-soft rounded-xl border border-line bg-surface">
              {e.contents.map((c, i) => (
                <li key={c.id} className="flex items-baseline gap-4 px-4 py-4">
                  <span className="w-6 shrink-0 text-[11px] font-semibold tabular-nums text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-next">{KIND[c.kind] ?? c.kind.toLowerCase()}</span>
                    <span className="mt-1 block text-base font-semibold leading-snug">{c.title}</span>
                    {c.byline && <span className="mt-1 block text-xs text-muted">By {c.byline}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {sponsors.length > 0 && (
          <section aria-labelledby="sponsors" className="mt-10">
            <h2 id="sponsors" className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">
              Made possible by
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {sponsors.map((s) => (
                <li key={s.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-next/12 text-xs font-bold text-next">{initials(s.sponsor)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{s.sponsor}</span>
                    <span className="text-[11px] text-muted">{POSITION[s.kind] ?? s.kind.toLowerCase()}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 border-t border-line pt-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">Masthead</p>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {e.publication} is written, photographed, designed and sold by students{e.school ? ` at ${e.school.name}` : ""}. Published by SponsorX NEXT.
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-faint">
            Every piece listed here carries a recorded right to publish digitally. Student pages use display names only.
          </p>
        </footer>
      </div>
    </main>
  );
}
