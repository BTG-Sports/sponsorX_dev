"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { Pagination } from "@/components/pagination";

/* --------------------------------------------------------------------------
   Attention queue — the athlete dashboard's "Needs your attention" list
   (spec 2026-09-15, pagination added 2026-09-16).

   Two sections share the card, and each pages independently: the actionable
   rows (invites → due deliverables → profile gaps, priority order) and the
   quiet in-review list below them. Each pager sits directly under its own
   list — the actionable pager (?attn=) between the rows and the in-review
   section, the in-review pager (?rev=) below the card — so neither reads as
   controlling the other.
   Pagers are always visible (‹ 1 › with disabled arrows at one page) so the
   queue's capacity is legible before it ever fills.

   Same island conventions as sponsor-campaigns-list: the server page builds
   serializable rows and seeds initial pages from the URL, this island owns
   page state, syncs it back via replaceState (shareable, survives reload)
   and clamps out-of-range seeds.
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

export type ReviewRow = {
  id: string;
  due: string;
  title: string;
  sub: string;
  badge: { label: string; tone: "neutral" | "primary" | "accent" | "warn" };
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

/** Shared per-section page state: raw intent clamped to range + slice. */
function usePaged<T>(rows: T[], initial?: string) {
  const [page, setPage] = useState(() => {
    const n = Number(initial);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, rows.length);
  return { safePage, setPage, totalPages, paged, rangeStart, rangeEnd };
}

export function AttentionQueue({
  rows,
  reviewRows = [],
  initialPage,
  initialReviewPage,
}: {
  rows: QueueRow[];
  /** Waiting-on-others deliverables — the quiet second section. */
  reviewRows?: ReviewRow[];
  /** Raw ?attn= value from the server page — seeds the first render. */
  initialPage?: string;
  /** Raw ?rev= value — seeds the in-review section's page. */
  initialReviewPage?: string;
}) {
  const attn = usePaged(rows, initialPage);
  const rev = usePaged(reviewRows, initialReviewPage);

  /* Pages live in the URL (no navigation) so a view is shareable and
     survives reload. Only attn/rev are touched — demo/other params pass
     through. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (attn.safePage > 1) p.set("attn", String(attn.safePage));
    else p.delete("attn");
    if (rev.safePage > 1) p.set("rev", String(rev.safePage));
    else p.delete("rev");
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [attn.safePage, rev.safePage]);

  return (
    <div>
      <Card className="p-0">
        <ul className="divide-y divide-line-soft">
          {attn.paged.map((row) => (
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

        {/* ------- section 1 pager — closes the actionable rows, above the
                   in-review section so each pager sits with its own list --- */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5">
          <p className="text-[11px] tabular-nums text-faint">
            {attn.rangeStart}–{attn.rangeEnd} of {rows.length}
          </p>
          <Pagination
            page={attn.safePage}
            count={attn.totalPages}
            onChange={attn.setPage}
            tone="athlete"
            alwaysShow
          />
        </div>

        {/* ----------------------- section 2: waiting on others, paged --- */}
        {reviewRows.length > 0 && (
          <>
            <div className="border-t border-dashed border-line-soft px-4 py-2.5 text-[11px] text-faint">
              In review, nothing to do:{" "}
              <span className="font-medium text-muted">
                {reviewRows.length}{" "}
                {reviewRows.length === 1 ? "deliverable" : "deliverables"}
              </span>{" "}
              with BTG / sponsor
            </div>
            <ul
              id="in-review"
              className="divide-y divide-line-soft border-t border-line-soft bg-surface-2/30"
            >
              {rev.paged.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                >
                  <span className="w-12 shrink-0 text-[11px] text-faint">
                    {d.due}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-muted">{d.title}</p>
                    <p className="truncate text-[10px] text-faint">{d.sub}</p>
                  </div>
                  <Badge tone={d.badge.tone}>{d.badge.label}</Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {/* ------------------------------- section 2 pager: in-review rows */}
      {reviewRows.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] tabular-nums text-faint">
            in review {rev.rangeStart}–{rev.rangeEnd} of {reviewRows.length}
          </p>
          <Pagination
            page={rev.safePage}
            count={rev.totalPages}
            onChange={rev.setPage}
            tone="athlete"
            alwaysShow
          />
        </div>
      )}
    </div>
  );
}
