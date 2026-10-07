import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "./ui";

/* --------------------------------------------------------------------------
   Branded state system (A2, spec 2026-09-11). Loading skeletons mirror real
   layouts and shimmer in token alphas (theme-safe); empty states carry a mark,
   a reason and the next action; error panels match, with a reference code.
   Server components — error.tsx boundaries pass their reset button in as
   `action`.
   -------------------------------------------------------------------------- */

export function SkeletonBlock({
  className = "",
  soft = false,
}: {
  className?: string;
  /** Softer alpha for secondary lines (captions, meta). */
  soft?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`sx-shimmer rounded-lg ${soft ? "bg-primary/8" : "bg-primary/12"} ${className}`}
    />
  );
}

export function SkeletonStatTile() {
  return (
    <Card className="p-4">
      <SkeletonBlock className="h-3 w-2/5" />
      <SkeletonBlock className="mt-3 h-7 w-3/5" />
      <SkeletonBlock soft className="mt-3 h-3 w-4/5" />
    </Card>
  );
}

export function SkeletonHero() {
  return (
    <div className="rounded-2xl border border-primary/15 bg-surface/40 p-5 sm:p-6">
      <SkeletonBlock className="h-3 w-48" />
      <div
        aria-hidden="true"
        className="sx-shimmer mt-3 h-10 w-72 rounded-lg bg-[linear-gradient(90deg,color-mix(in_srgb,var(--sx-primary)_20%,transparent),color-mix(in_srgb,var(--sx-accent)_20%,transparent))]"
      />
      <SkeletonBlock soft className="mt-3 h-3 w-56" />
      <SkeletonChart className="mt-5" />
    </div>
  );
}

export function SkeletonChart({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 80"
      aria-hidden="true"
      className={`sx-shimmer h-20 w-full ${className}`}
      preserveAspectRatio="none"
    >
      <path
        d="M0,60 Q60,20 120,44 T240,36 T400,24"
        fill="none"
        stroke="var(--sx-primary)"
        strokeOpacity="0.3"
        strokeWidth="2"
        strokeDasharray="6 6"
      />
      <line x1="0" y1="78" x2="400" y2="78" stroke="var(--sx-line)" strokeWidth="1" />
    </svg>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" className="sx-card space-y-3 rounded-xl border border-line bg-surface p-5">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBlock className="size-8 rounded-lg" />
          <SkeletonBlock className="h-3 flex-1" />
          <SkeletonBlock soft className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Standard page skeleton: hero ghost + stat row + list. Route loading.tsx
 *  files compose these primitives to mirror their real layout instead when
 *  the layout differs. */
export function SkeletonPage() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading…</span>
      <SkeletonHero />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
        <SkeletonStatTile />
      </div>
      <SkeletonRows rows={5} />
    </div>
  );
}

/* ------------------------------------------------------------ empty state */

const MARKS = {
  inbox: "M4 13h4l2 3h4l2-3h4M6 6h12l2 7v5H4v-5l2-7Z",
  chart: "M4 20V6m0 14h16M8 16v-5m4 5V8m4 8v-3",
  clock: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  users: "M16 19v-1a4 4 0 0 0-8 0v1m12 0v-1a4 4 0 0 0-3-3.87M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
} as const;

export function EmptyState({
  mark = "inbox",
  title,
  hint,
  action,
}: {
  mark?: keyof typeof MARKS;
  title: string;
  /** One line of *why this matters / what fills it* — not an apology. */
  hint: string;
  /** The next step that fills this screen. */
  action?: { label: string; href: string };
}) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--sx-primary)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
        aria-hidden="true"
      >
        <path d={MARKS[mark]} />
      </svg>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted">{hint}</p>
      {action && (
        <Link
          href={action.href}
          className="mt-1 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
        >
          {action.label} →
        </Link>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------ error panel */

export function ErrorPanel({
  title = "Something broke on our side",
  hint = "The rest of the portal still works. Try again, or come back to this screen in a minute.",
  refCode,
  action,
}: {
  title?: string;
  hint?: string;
  /** e.g. Next error boundary digest — support reference, not a stack trace. */
  refCode?: string;
  action?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-xl border border-danger/30 bg-surface p-5 py-10 text-center"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--sx-danger)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-8"
        aria-hidden="true"
      >
        <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      </svg>
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-xs text-xs text-muted">{hint}</p>
      {refCode && (
        <code className="rounded bg-surface-2 px-2 py-0.5 text-[10px] text-faint">
          ref: {refCode}
        </code>
      )}
      {action}
    </div>
  );
}
