"use client";

import { useEffect, useState } from "react";
import { Badge, Button } from "./ui";
import { initials } from "./hero";
import {
  SLOT_RACK_CENTS,
  money,
  type AdSlotKind,
  type EditionPage,
  type EditionSlot,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   The flatplan (P1-FE-21). Pages drawn as facing spreads, slots at their true
   positions — the editor's flatplan wall, live. State is shape + color, never
   color alone: sold = solid violet fill + sponsor monogram, reserved = dashed
   violet outline, open = quiet surface showing the rack price, editorial =
   muted stripes. The back cover renders apart, framed: a 1-of-1 is furniture,
   not a row.

   Tap a page → the house drawer with that page's slots. Every action that
   needs the backend ships disabled, titled with its wiring row (P9-FE-03).
   Drawer mechanics follow student-assignments/activity-explorer exactly.
   -------------------------------------------------------------------------- */

const KIND_LABEL: Record<AdSlotKind, string> = {
  FULL: "Full page",
  HALF: "Half page",
  QUARTER: "Quarter page",
  BACK_COVER: "Back cover",
};

const STATE_TONE = {
  SOLD: "primary",
  RESERVED: "warn",
  OPEN: "neutral",
} as const;

const WIRING_TITLE =
  "Wired by P9-FE-03 against the AdSlot ledger (Stage 9 — gated behind B8 and a sold edition)";

/** Fraction of a page a slot occupies — drives the drawn heights. */
const FRACTION: Record<AdSlotKind, number> = {
  FULL: 1,
  HALF: 0.5,
  QUARTER: 0.25,
  BACK_COVER: 1,
};

/* ------------------------------------------------ slot block on a page */
function SlotBlock({ slot }: { slot: EditionSlot }) {
  if (slot.state === "SOLD") {
    return (
      <span className="grid h-full w-full place-items-center rounded-[3px] bg-next text-[9px] font-bold text-cta-ink">
        {initials(slot.sponsor ?? "")}
      </span>
    );
  }
  if (slot.state === "RESERVED") {
    return (
      <span className="grid h-full w-full place-items-center rounded-[3px] border-[1.5px] border-dashed border-next/60 bg-next/10 text-[8px] font-semibold uppercase tracking-wide text-next">
        hold
      </span>
    );
  }
  return (
    <span className="grid h-full w-full place-items-center rounded-[3px] border border-line bg-surface-2/80 text-[8px] tabular-nums text-faint">
      {money(SLOT_RACK_CENTS[slot.kind])}
    </span>
  );
}

/* ------------------------------------------------------- one page card */
function PageCard({
  page,
  onOpen,
}: {
  page: EditionPage;
  onOpen: (page: EditionPage) => void;
}) {
  if (page.editorial) {
    return (
      <div className="flex aspect-[3/4] w-full flex-col rounded-md border border-line-soft bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,color-mix(in_srgb,var(--sx-line)_35%,transparent)_5px,color-mix(in_srgb,var(--sx-line)_35%,transparent)_6px)] p-1.5">
        <span className="text-[9px] font-semibold tabular-nums text-faint">
          {page.page}
        </span>
        <span className="m-auto max-w-full px-0.5 text-center text-[8px] leading-tight text-faint">
          {page.title}
        </span>
      </div>
    );
  }

  /* Slots stack top-to-bottom; quarters pair into a row; whatever fraction
     of the page is unsold inventory nor a hold is editorial filler, drawn
     as such — because that is literally what it is. */
  const rows: EditionSlot[][] = [];
  let quarters: EditionSlot[] = [];
  for (const s of page.slots) {
    if (s.kind === "QUARTER") {
      quarters.push(s);
      if (quarters.length === 2) {
        rows.push(quarters);
        quarters = [];
      }
    } else {
      rows.push([s]);
    }
  }
  if (quarters.length) rows.push(quarters);
  const used = page.slots.reduce((f, s) => f + FRACTION[s.kind], 0);

  return (
    <button
      type="button"
      onClick={() => onOpen(page)}
      aria-label={`Page ${page.page} — ${page.title}`}
      className="group flex aspect-[3/4] w-full flex-col gap-[3px] rounded-md border border-line bg-surface p-1.5 text-left outline-none transition-all hover:-translate-y-0.5 hover:border-next/50 hover:shadow-lg hover:shadow-black/30 focus-visible:ring-2 focus-visible:ring-next"
    >
      <span className="flex items-baseline justify-between">
        <span className="text-[9px] font-semibold tabular-nums text-muted">
          {page.page > 0 ? page.page : ""}
        </span>
        <span className="max-w-[70%] truncate text-[7px] text-faint">
          {page.title}
        </span>
      </span>
      {rows.map((row, i) => (
        <span
          key={i}
          className="flex w-full gap-[3px]"
          style={{
            flex: `0 0 ${Math.max(...row.map((s) => FRACTION[s.kind])) * 82}%`,
          }}
        >
          {row.map((s) => (
            <span key={s.code} className="min-w-0 flex-1">
              <SlotBlock slot={s} />
            </span>
          ))}
        </span>
      ))}
      {used < 1 && (
        <span className="min-h-0 flex-1 rounded-[3px] bg-[repeating-linear-gradient(135deg,transparent,transparent_5px,color-mix(in_srgb,var(--sx-line)_35%,transparent)_5px,color-mix(in_srgb,var(--sx-line)_35%,transparent)_6px)]" />
      )}
    </button>
  );
}

/* --------------------------------------------------------------- legend */
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-[2px] bg-next" /> Sold
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-[2px] border-[1.5px] border-dashed border-next/60 bg-next/10" />{" "}
        Reserved
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-[2px] border border-line bg-surface-2" />{" "}
        Open
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-3 rounded-[2px] bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,color-mix(in_srgb,var(--sx-line)_50%,transparent)_3px,color-mix(in_srgb,var(--sx-line)_50%,transparent)_4px)]" />{" "}
        Editorial
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ the plan */
export function EditionFlatplan({
  pages,
  backCover,
  closeDate,
  initialOpenPage,
}: {
  pages: EditionPage[];
  backCover: EditionSlot;
  closeDate: string;
  /** Deep-link (?open=N from the inventory ledger); 0 opens the back cover. */
  initialOpenPage?: number;
}) {
  const [open, setOpen] = useState<EditionPage | null>(() => {
    if (initialOpenPage === undefined) return null;
    if (initialOpenPage === 0)
      return { page: 0, title: "Back cover", slots: [backCover] };
    return pages.find((p) => p.page === initialOpenPage) ?? null;
  });
  const [closing, setClosing] = useState(false);

  /* Cover stands alone; the rest read as facing pairs, like the magazine. */
  const [cover, ...rest] = pages;
  const spreads: EditionPage[][] = [[cover]];
  for (let i = 0; i < rest.length; i += 2) spreads.push(rest.slice(i, i + 2));

  const show = (p: EditionPage) => {
    setClosing(false);
    setOpen(p);
  };
  const dismiss = () => setClosing(true);
  const closed = () => {
    setOpen(null);
    setClosing(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(closed, 400);
    return () => clearTimeout(t);
  }, [closing]);

  const backAsPage: EditionPage = {
    page: 0,
    title: "Back cover",
    slots: [backCover],
  };

  return (
    <div className="min-w-0">
      <Legend />

      {/* spreads — two page-cards shoulder to shoulder, wrapping */}
      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-4 min-[480px]:grid-cols-4 lg:grid-cols-6">
        {spreads.map((spread, i) => (
          <div
            key={i}
            className="sx-animate col-span-2 flex justify-center gap-[3px]"
            style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
          >
            {/* a lone page keeps its half of the spread: the cover is a
               recto (right of the spine), a trailing page a verso (left) */}
            {spread.length === 1 && i === 0 && (
              <div className="min-w-0 flex-1" aria-hidden="true" />
            )}
            {spread.map((p) => (
              <div key={p.page} className="min-w-0 flex-1">
                <PageCard page={p} onOpen={show} />
              </div>
            ))}
            {spread.length === 1 && i > 0 && (
              <div className="min-w-0 flex-1" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>

      {/* ------------------------------------------ the singleton, apart */}
      <div className="mt-6 flex flex-wrap items-center gap-5 rounded-xl border border-next/40 bg-surface p-4 shadow-[0_0_30px_-12px_var(--sx-next)]">
        <div className="w-24 shrink-0">
          <PageCard page={backAsPage} onOpen={show} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Back cover —{" "}
            <span className="text-next">1 of 1</span>
          </p>
          <p className="mt-1 text-xs text-muted">
            {money(SLOT_RACK_CENTS.BACK_COVER)} ·{" "}
            {backCover.state === "OPEN"
              ? "still open"
              : backCover.state.toLowerCase()}{" "}
            · unsellable after {closeDate}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-faint">
            The one position every advertiser asks about. When it goes, it is
            gone for the edition.
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------- drawer */}
      {open && (
        <div
          className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label={open.page === 0 ? "Back cover" : `Page ${open.page}`}
        >
          <div
            onClick={dismiss}
            className={[
              "absolute inset-0 bg-black/50",
              closing ? "sx-backdrop-out" : "sx-backdrop",
            ].join(" ")}
          />
          <aside
            onAnimationEnd={(e) => {
              if (closing && e.animationName === "sx-drawer-out") closed();
            }}
            className={[
              "absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl shadow-black/40",
              closing ? "sx-drawer-out" : "sx-drawer",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  {open.page === 0 ? "Back cover" : `Page ${open.page}`}
                </h2>
                <p className="mt-0.5 text-xs text-muted">{open.title}</p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-line/70 text-muted transition-colors hover:text-text"
              >
                ✕
              </button>
            </div>

            <ul className="mt-4 space-y-3">
              {open.slots.map((s) => (
                <li
                  key={s.code}
                  className="rounded-lg border border-line-soft bg-surface-2/50 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold tabular-nums">
                      {s.code}
                    </span>
                    <Badge tone={STATE_TONE[s.state]}>
                      {s.state.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted">
                    {KIND_LABEL[s.kind]} · rack{" "}
                    {money(SLOT_RACK_CENTS[s.kind])}
                  </p>
                  {s.state === "SOLD" && (
                    <p className="mt-1.5 text-xs">
                      <span className="font-medium">{s.sponsor}</span>{" "}
                      <span className="tabular-nums text-muted">
                        · closed at {money(s.soldCents ?? 0)}
                      </span>
                      {s.soldCents !== SLOT_RACK_CENTS[s.kind] && (
                        <span className="text-[10px] text-faint">
                          {" "}
                          (differs from rack — value frozen at close)
                        </span>
                      )}
                    </p>
                  )}
                  {s.state === "RESERVED" && (
                    <p className="mt-1.5 text-xs text-muted">
                      Held for <span className="text-text">{s.holdFor}</span>
                    </p>
                  )}
                </li>
              ))}
              {open.slots.length === 0 && (
                <li className="text-xs text-muted">
                  Editorial page — no sellable positions.
                </li>
              )}
            </ul>

            <div className="mt-auto space-y-2 pt-5">
              <Button full disabled title={WIRING_TITLE}>
                Reserve a position
              </Button>
              <Button variant="secondary" full disabled title={WIRING_TITLE}>
                Adjust rack price
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
