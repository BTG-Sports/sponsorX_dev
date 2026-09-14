"use client";

import { useEffect, useRef, useState } from "react";

/* --------------------------------------------------------------------------
   Shared toolbar primitives for client-island explorers (2026-09-14).
   Extracted from activity-explorer so the admin workspaces can reuse the
   same designed controls without duplicating them: search input, listbox
   dropdown, dismissible filter chips, outside-click plumbing and the small
   icons they share. Everything is tone-aware — the athlete portal tints
   active controls with the athlete color, admin pages with the admin color —
   via static class maps so Tailwind sees every utility.
   -------------------------------------------------------------------------- */

export type FilterTone = "athlete" | "admin";

const TONE = {
  athlete: {
    chip: "border-athlete/30 bg-athlete/10",
    trigger: "border-athlete/40",
    search: "focus:border-athlete/50 focus-visible:ring-athlete/30",
  },
  admin: {
    chip: "border-admin/30 bg-admin/10",
    trigger: "border-admin/40",
    search: "focus:border-admin/50 focus-visible:ring-admin/30",
  },
} satisfies Record<FilterTone, { chip: string; trigger: string; search: string }>;

/* ------------------------------------------------------------------ icons */

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3.5" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        "size-3 shrink-0 text-faint transition-transform",
        open ? "rotate-180" : "",
      ].join(" ")}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={[
        "size-3 shrink-0 text-accent",
        visible ? "" : "invisible",
      ].join(" ")}
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 shrink-0" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

export function CloseIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/* -------------------------------------------------------------- FilterChip */

/** One active filter, dismissible on its own — the row reads as a sentence
    of what's applied, and the ✕ removes just that clause. */
export function FilterChip({
  label,
  icon,
  children,
  onClear,
  tone = "athlete",
}: {
  /** Accessible name for the remove button, e.g. "Remove date filter". */
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClear: () => void;
  tone?: FilterTone;
}) {
  return (
    <span
      className={[
        "flex items-center gap-1.5 rounded-full border py-1 pl-2.5 pr-1 text-[11px] font-medium text-text",
        TONE[tone].chip,
      ].join(" ")}
    >
      {icon}
      {children}
      <button
        type="button"
        aria-label={label}
        onClick={onClear}
        className="grid size-4 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-2.5" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </span>
  );
}

/* ------------------------------------------------------- popover plumbing */

export function useOutsideClose(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  open: boolean,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
        /* Swallow the click that follows this pointerdown — dismissing a
           popover must not also activate whatever sat underneath (e.g. a
           list row opening a drawer). */
        document.addEventListener(
          "click",
          (ce) => {
            ce.stopPropagation();
            ce.preventDefault();
          },
          { capture: true, once: true },
        );
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [ref, onClose, open]);
}

/** Shared trigger shell — quiet by default, portal-tinted when active. */
export const triggerCls = (
  active: boolean,
  open: boolean,
  tone: FilterTone = "athlete",
) =>
  [
    "flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs transition-colors",
    active || open
      ? `${TONE[tone].trigger} text-text`
      : "border-line text-muted hover:text-text",
  ].join(" ");

export const PANEL_CLS =
  "sx-pop absolute right-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-line bg-surface shadow-xl";

/* ------------------------------------------------------------- SearchInput */

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  tone = "athlete",
  className = "min-w-44 flex-1 basis-56",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** aria-label of the input, e.g. "Search applications". */
  label: string;
  tone?: FilterTone;
  /** Wrapper sizing — defaults to the toolbar's flexible slot. */
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-faint">
        <SearchIcon />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className={[
          "w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-xs text-text placeholder:text-faint outline-none transition-colors focus-visible:ring-2",
          TONE[tone].search,
        ].join(" ")}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Dropdown */

export function Dropdown({
  label,
  allLabel,
  value,
  options,
  onChange,
  tone = "athlete",
}: {
  /** aria-label of the control, e.g. "Filter by status". */
  label: string;
  /** The "no filter" row, e.g. "All statuses". */
  allLabel: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  tone?: FilterTone;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false), open);

  const current = options.find((o) => o.value === value);
  const rows = [{ value: "", label: allLabel }, ...options];

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerCls(Boolean(value), open, tone)}
      >
        {current?.label ?? allLabel}
        <ChevronDown open={open} />
      </button>

      {open && (
        <div className={`${PANEL_CLS} min-w-full w-max py-1`} role="listbox" aria-label={label}>
          {rows.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value || "__all"}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-2",
                  selected ? "font-medium text-text" : "text-muted",
                ].join(" ")}
              >
                <CheckIcon visible={selected} />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
