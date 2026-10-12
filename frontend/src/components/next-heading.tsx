import Link from "next/link";
import type { ReactNode } from "react";

import type { ApiEdition } from "@/lib/editions-live";

/* --------------------------------------------------------------------------
   The SponsorX NEXT screens' heading and edition switcher (P9-FE-03..05).
   Moved here from app/(app)/admin/next/editions/live-editions.tsx in the
   P1-ART-25 restructure, because the Finance portal's Splits desk
   (/finance/splits) draws them too; admin's NEXT screens re-export them from
   there unchanged. `base` is the desk's own route, so a switcher link never
   leaves the portal it is drawn in.
   -------------------------------------------------------------------------- */

export function EditionSwitcher({ editions, current, base }: { editions: ApiEdition[]; current: ApiEdition; base: string }) {
  const many = new Set(editions.map((e) => e.publication.id)).size > 1;
  return (
    <nav aria-label="Editions" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1">
      {editions.map((e) => (
        <Link
          key={e.id}
          href={`${base}?edition=${encodeURIComponent(e.id)}`}
          aria-current={e.id === current.id ? "page" : undefined}
          className={[
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            e.id === current.id ? "bg-next/15 text-next" : "text-muted hover:text-text",
          ].join(" ")}
        >
          {e.label}
          {many && <span className="text-muted"> · {e.publication.name}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function NextHeading({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="sx-page-title">
          {title}{" "}
          <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-transparent">
            · SponsorX NEXT
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">{sub}</p>
      </div>
      {/* min-w-0 + max-w-full: the edition switcher scrolls inside this slot
          instead of widening the page past a phone (first-pass QA, 390px). */}
      {right && <div className="min-w-0 max-w-full">{right}</div>}
    </div>
  );
}
