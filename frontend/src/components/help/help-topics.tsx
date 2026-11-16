"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ICONS } from "@/components/icons";
import type { HelpCategory } from "@/lib/help/types";
import type { ArticleCard } from "./help-text";

/* --------------------------------------------------------------------------
   POL-FE-99 — the topic cards and the question list under them.

   A card tilts toward the pointer with a light that follows it (CSS vars set
   straight on the element, one rAF per frame, no re-render). Choosing a card
   shows that topic's questions below — ?topic= by replaceState, so the
   choice survives a refresh — and choosing it again goes back to the top
   questions. Touch and reduced motion get no tilt.
   -------------------------------------------------------------------------- */

function tilt(e: React.PointerEvent<HTMLElement>) {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;
  cancelAnimationFrame(Number(el.dataset.raf ?? 0));
  el.dataset.raf = String(
    requestAnimationFrame(() => {
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      el.style.setProperty("--ry", `${((x - 0.5) * 10).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - y) * 10).toFixed(2)}deg`);
    }),
  );
}

function untilt(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  cancelAnimationFrame(Number(el.dataset.raf ?? 0));
  el.style.setProperty("--rx", "0deg");
  el.style.setProperty("--ry", "0deg");
}

export function HelpTopics({
  base,
  categories,
  articles,
  initialTopic = null,
}: {
  base: string;
  categories: HelpCategory[];
  articles: ArticleCard[];
  initialTopic?: string | null;
}) {
  const [topic, setTopic] = useState<string | null>(categories.some((c) => c.key === initialTopic) ? initialTopic : null);
  const listRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const url = new URL(window.location.href);
    if (topic) url.searchParams.set("topic", topic);
    else url.searchParams.delete("topic");
    window.history.replaceState(window.history.state, "", url);
    /* bring the list into view on a phone, where it sits under the cards */
    const top = listRef.current?.getBoundingClientRect().top ?? 0;
    if (topic && top > window.innerHeight * 0.75) listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [topic]);

  const chosen = categories.find((c) => c.key === topic) ?? null;
  const top = articles.filter((a) => a.top);
  const shown = chosen ? articles.filter((a) => a.category === chosen.key) : top.length ? top : articles.slice(0, 6);

  return (
    <>
      <section aria-labelledby="hc-topics-h" className="hc-topics">
        <div className="hc-section-head">
          <h2 id="hc-topics-h">Browse by topic</h2>
          <p>{articles.length} answers, every one with screenshots of each step.</p>
        </div>
        <div className="hc-cards">
          {categories.map((c, i) => {
            const n = articles.filter((a) => a.category === c.key).length;
            const on = c.key === topic;
            return (
              <button
                key={c.key}
                type="button"
                className="hc-card"
                data-on={on || undefined}
                aria-pressed={on}
                style={{ "--i": i } as React.CSSProperties}
                onPointerMove={tilt}
                onPointerLeave={untilt}
                onClick={() => setTopic(on ? null : c.key)}
              >
                <span className="hc-card-glow" aria-hidden="true" />
                <span className="hc-card-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d={ICONS[c.icon]} pathLength={1} />
                  </svg>
                </span>
                <span className="hc-card-title">{c.title}</span>
                <span className="hc-card-blurb">{c.blurb}</span>
                <span className="hc-card-foot">
                  <span>{n} {n === 1 ? "answer" : "answers"}</span>
                  <span className="hc-card-arrow" aria-hidden="true">{on ? "✓" : "→"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section ref={listRef} aria-labelledby="hc-list-h" className="hc-list">
        <div className="hc-section-head">
          <h2 id="hc-list-h">{chosen ? chosen.title : "Top questions"}</h2>
          {chosen ? (
            <button type="button" className="hc-link-btn" onClick={() => setTopic(null)}>
              ← All topics
            </button>
          ) : (
            <p>Where most people start.</p>
          )}
        </div>
        <ol key={topic ?? "top"}>
          {shown.map((a, i) => (
            <li key={a.slug} style={{ "--i": i } as React.CSSProperties}>
              <Link href={`${base}/${a.slug}`} className="hc-row">
                <span className="hc-row-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
                <span className="hc-row-text">
                  <span className="hc-row-q">
                    {a.question}
                    {a.audience === "guardian" && <span className="hc-tag">For guardians</span>}
                    {a.audience === "minor" && <span className="hc-tag">Under 18</span>}
                  </span>
                  <span className="hc-row-s">{a.summary}</span>
                </span>
                <span className="hc-row-meta">{a.steps.length} steps</span>
                <span className="hc-row-go" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
