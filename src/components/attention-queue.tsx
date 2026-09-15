"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { Pagination } from "@/components/pagination";

/* --------------------------------------------------------------------------
   Attention queue — the athlete dashboard's "Needs your attention" list
   (spec 2026-09-15, pagination added same day).

   The queue merges three row kinds (invites → due deliverables → profile
   gaps) in priority order; with a real roster any of those sections can run
   past a screenful, so the list pages at five rows. Same island conventions
   as sponsor-campaigns-list: the server page builds the rows and seeds the
   initial page from ?attn=, this island owns page state, syncs it back via
   replaceState (shareable, survives reload), and clamps out-of-range seeds.
   Pager controls render above and below the list (house pagination pattern)
   and disappear entirely at one page. The waiting-on-others footer and
   in-review list arrive server-rendered as `children` so they stay out of
   the client bundle.
   -------------------------------------------------------------------------- */

const PAGE_SIZE = 5;

export type QueueRow = {
  id: string;
  kind: "invite" | "deliverable" | "profile";
  title: string;
  /** Money figure rendered tabular after the title (invite rows). */
  money?: string;
  sub: string;
  badges: { label: string; tone: "neutral" | "primary" | "warn" }[];
  action: {
    label: string;
    href?: string;
    variant?: "secondary" | "ghost";
    disabled?: boolean;
    title?: string;
  };
};

function QueueIcon({ kind }: { kind: QueueRow["kind"] }) {
  const paths = {
    invite: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />,
    deliverable: (
      <>
        <path d="m22 8-6 4 6 4V8Z" />
        <rect x="2" y="6" width="14" height="12" rx="2" />
      </>
    ),
    profile: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />,
  } as const;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-athlete/10 text-athlete">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        {paths[kind]}
      </svg>
    </span>
  );
}

export function AttentionQueue({
  rows,
  initialPage,
  children,
}: {
  rows: QueueRow[];
  /** Raw ?attn= value from the server page — seeds the first render. */
  initialPage?: string;
  /** Server-rendered waiting-on-others footer + in-review list. */
  children?: ReactNode;
}) {
  const [page, setPage] = useState(() => {
    const n = Number(initialPage);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  /* `page` is raw intent; `safePage` is the effective, in-range value used
     for slicing, the pager and the URL — a seeded ?attn= past the end just
     clamps here. */
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  /* Page lives in the URL (no navigation) so a view is shareable and
     survives reload. Only `attn` is touched — demo/other params pass through. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (safePage > 1) p.set("attn", String(safePage));
    else p.delete("attn");
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [safePage]);

  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, rows.length);
  const paging = rows.length > PAGE_SIZE;

  return (
    <div>
      {paging && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] tabular-nums text-faint">
            {rangeStart}–{rangeEnd} of {rows.length}
          </p>
          <Pagination
            page={safePage}
            count={totalPages}
            onChange={setPage}
            tone="athlete"
          />
        </div>
      )}

      <Card className="p-0">
        <ul className="divide-y divide-line-soft">
          {paged.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <QueueIcon kind={row.kind} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold tracking-tight">
                  {row.title}
                  {row.money && (
                    <>
                      {" "}
                      · <span className="tabular-nums">{row.money}</span>
                    </>
                  )}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-faint">
                  {row.sub}
                </p>
              </div>
              {row.badges.map((b) => (
                <Badge key={b.label} tone={b.tone}>
                  {b.label}
                </Badge>
              ))}
              <Button
                variant={row.action.variant ?? "secondary"}
                href={row.action.href}
                disabled={row.action.disabled}
                title={row.action.title}
              >
                {row.action.label}
              </Button>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-faint">
              Nothing needs your attention right now.
            </li>
          )}
        </ul>
        {children}
      </Card>

      {paging && (
        <div className="mt-2 flex justify-end">
          <Pagination
            page={safePage}
            count={totalPages}
            onChange={setPage}
            tone="athlete"
          />
        </div>
      )}
    </div>
  );
}
