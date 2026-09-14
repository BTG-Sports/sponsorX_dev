import type { ReactNode } from "react";

/* --------------------------------------------------------------------------
   Primitives matching the mockup's UI Elements panel: primary button,
   secondary button, input field, checkbox, radio, stat tiles, pill badges.
   Server components — nothing here needs client JS.
   -------------------------------------------------------------------------- */

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------- surfaces */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-line bg-surface p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary/15 text-primary-soft",
  accent: "bg-accent/12 text-accent",
  danger: "bg-danger/12 text-danger",
  warn: "bg-warn/12 text-warn",
};

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * §22 requires every metric to declare where it came from. This renders that
 * label, so a self-reported follower count can never be mistaken for a
 * verified one.
 */
export function SourceLabel({
  source,
}: {
  source: "VERIFIED_API" | "VERIFIED_MANUAL" | "SELF_REPORTED" | "ESTIMATED" | "ATTRIBUTED";
}) {
  const copy: Record<typeof source, [string, Tone]> = {
    VERIFIED_API: ["verified", "accent"],
    VERIFIED_MANUAL: ["verified · manual", "accent"],
    SELF_REPORTED: ["self-reported", "warn"],
    ESTIMATED: ["estimated", "neutral"],
    ATTRIBUTED: ["attributed", "primary"],
  };
  const [label, tone] = copy[source];
  return <Badge tone={tone}>{label}</Badge>;
}

/* ----------------------------------------------------------------- buttons */

export function Button({
  children,
  variant = "primary",
  href,
  full,
  disabled,
  title,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  href?: string;
  full?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
  const styles = {
    primary: "bg-primary text-cta-ink hover:bg-primary-soft",
    secondary: "border border-line bg-transparent text-text hover:bg-surface-2",
    ghost: "text-muted hover:text-text",
  }[variant];
  const cls = cx(base, styles, full && "w-full", disabled && "cursor-not-allowed opacity-40");

  if (href && !disabled) {
    return (
      <a href={href} className={cls} title={title}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- stat tiles */

export function StatTile({
  label,
  value,
  delta,
  sub,
  source,
}: {
  label: string;
  value: string;
  delta?: { value: string; direction: "up" | "down" };
  sub?: string;
  source?: Parameters<typeof SourceLabel>[0]["source"];
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {value}
        </span>
        {delta && (
          <span
            className={cx(
              "text-xs font-medium tabular-nums",
              delta.direction === "up" ? "text-accent" : "text-danger",
            )}
          >
            {delta.direction === "up" ? "+" : ""}
            {delta.value}
          </span>
        )}
      </div>
      {(sub || source) && (
        <div className="mt-2 flex items-center gap-2">
          {sub && <span className="text-[11px] text-faint">{sub}</span>}
          {source && <SourceLabel source={source} />}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ meters */

export function Meter({
  value,
  tone = "primary",
}: {
  value: number;
  tone?: "primary" | "accent";
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className={cx(
          "h-full rounded-full",
          tone === "primary" ? "bg-primary" : "bg-accent",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------- tabs */

export function Tabs({
  items,
  active,
}: {
  items: string[];
  active: string;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
      {items.map((it) => (
        <span
          key={it}
          className={cx(
            "rounded-md px-3 py-1.5 text-xs font-medium",
            it === active
              ? "bg-primary/15 text-primary-soft"
              : "text-muted",
          )}
        >
          {it}
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------- blocked notice */

/**
 * Used where a screen is deliberately not wired up — e.g. Campaign Order
 * acceptance, which guide §08 blocks until counsel approves the template.
 */
export function BlockedNotice({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <p className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs leading-relaxed text-warn">
      {children}
    </p>
  );
}
