import type { ReactNode } from "react";
import type { Insight } from "@/lib/analytics-insights";
import { Reveal } from "@/components/reveal";

/* --------------------------------------------------------------------------
   InsightBanner — the guided story's "sentence first, chart as evidence"
   header. hero renders chapter 1's headline card; the default renders the
   inline sentence that tops every other chapter. No hooks — usable from
   server or client trees.
   -------------------------------------------------------------------------- */

const HOT_TONE: Record<Insight["tone"], string> = {
  success: "text-success",
  accent: "text-accent",
  primary: "text-primary-soft",
};

export function InsightBanner({
  insight,
  hero = false,
  footer,
}: {
  insight: Insight;
  hero?: boolean;
  footer?: ReactNode;
}) {
  const sentence = (
    <p
      className={
        hero
          ? "text-[15px] font-semibold leading-relaxed tracking-tight"
          : "text-[13px] font-semibold leading-relaxed"
      }
    >
      {insight.pre}
      <em className={`not-italic ${HOT_TONE[insight.tone]} sx-ins-hot`}>
        {insight.hot}
      </em>
      {insight.post}
    </p>
  );

  if (!hero) {
    return (
      <Reveal className="mb-3">
        {sentence}
        {footer}
      </Reveal>
    );
  }
  return (
    <Reveal>
      <div className="rounded-xl border border-line bg-gradient-to-br from-surface to-surface-2 p-5">
        {sentence}
        {footer}
      </div>
    </Reveal>
  );
}
