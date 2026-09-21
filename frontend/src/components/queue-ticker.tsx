import Link from "next/link";

/* --------------------------------------------------------------------------
   Admin ops-board queue chip (A2): live queue count + amber aging badge.
   Counts are row counts; aging derives from createdAt — both Postgres.
   -------------------------------------------------------------------------- */

export function QueueTicker({
  label,
  count,
  agingLabel,
  href,
}: {
  label: string;
  count: number;
  /** e.g. "2 > 48h" — empty string hides the badge. */
  agingLabel: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs transition-colors",
        agingLabel
          ? "border-warn/40 hover:border-warn/70"
          : "border-line/70 hover:border-line",
      ].join(" ")}
    >
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums">{count}</span>
        {agingLabel && (
          <span className="rounded-full bg-warn/12 px-2 py-0.5 text-[10px] font-medium text-warn">
            {agingLabel}
          </span>
        )}
      </span>
    </Link>
  );
}
