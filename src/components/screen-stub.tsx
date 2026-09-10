import Link from "next/link";

type Props = {
  /** Screen name as the blueprint or mockup calls it. */
  title: string;
  /** Blueprint section / screen reference, e.g. "§9 screen 3". */
  blueprintRef?: string;
  /** Which surface this belongs to. */
  surface?: string;
  /** What this screen has to do, in one line. */
  purpose?: string;
  /** Requirements not yet built. */
  todo?: string[];
  /** Where the mockup disagrees with blueprint v2.0. */
  note?: string;
};

export function ScreenStub({
  title,
  blueprintRef,
  surface,
  purpose,
  todo,
  note,
}: Props) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/map"
        className="text-xs font-medium text-accent hover:underline"
      >
        ← route map
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {blueprintRef && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
            {blueprintRef}
          </span>
        )}
        {surface && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary-soft">
            {surface}
          </span>
        )}
      </div>

      {purpose && <p className="mt-3 text-sm text-muted">{purpose}</p>}

      {note && (
        <p className="mt-4 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs leading-relaxed text-warn">
          {note}
        </p>
      )}

      {todo && todo.length > 0 && (
        <>
          <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Not built yet
          </h2>
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            {todo.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-faint" aria-hidden="true">
                  ▢
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-10 border-t border-line pt-4 text-[11px] leading-relaxed text-faint">
        Skeleton route. Build order per guide §12: Zod contract → Prisma model →
        scope function + authz matrix row → domain function → route handler → UI
        → E2E test.
      </p>
    </main>
  );
}
