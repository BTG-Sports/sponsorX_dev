"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { searchHelp, type Seg } from "@/lib/help/search";
import type { ArticleCard } from "./help-text";

/* --------------------------------------------------------------------------
   POL-FE-99 — the help command bar. Results filter on every keystroke (pure
   search, no request); ↑ ↓ move, Enter opens, Esc clears; Ctrl+K or "/"
   from anywhere on the page focuses it. The query rides in ?q= by
   replaceState, so a refresh or a shared link keeps it. While the bar is
   empty and idle, the portal's own questions type themselves out as the
   placeholder (aria-hidden: the real placeholder stays "Search help").
   -------------------------------------------------------------------------- */

function Marked({ segs }: { segs: Seg[] }) {
  return (
    <>
      {segs.map((s, i) => (s.hit ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>))}
    </>
  );
}

function useTypewriter(lines: string[], idle: boolean) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!idle || !lines.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      /* no typing: the first question, still */
      const t = setTimeout(() => setText(lines[0]), 0);
      return () => clearTimeout(t);
    }
    let line = 0;
    let at = 0;
    let dir = 1;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = lines[line];
      at += dir;
      setText(full.slice(0, at));
      let wait = dir > 0 ? 45 + Math.random() * 50 : 22;
      if (dir > 0 && at >= full.length) { dir = -1; wait = 1900; }
      else if (dir < 0 && at <= 0) { dir = 1; line = (line + 1) % lines.length; wait = 380; }
      timer = setTimeout(tick, wait);
    };
    timer = setTimeout(tick, 700);
    return () => clearTimeout(timer);
  }, [lines, idle]);
  return idle ? text : "";
}

export function HelpSearch({
  base,
  articles,
  topicTitles,
  samples,
  chips,
  initialQuery = "",
}: {
  /** The portal's help home, e.g. "/sponsor/help". */
  base: string;
  articles: ArticleCard[];
  topicTitles: Record<string, string>;
  /** Questions the placeholder types out. */
  samples: string[];
  /** Popular searches under the bar. */
  chips: string[];
  initialQuery?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchHelp(articles, q, 8), [articles, q]);
  const ghost = useTypewriter(samples, !q && !focused);
  const open = q.trim().length > 0;

  /* ?q= without a navigation (memory: replacestate-not-in-searchparams — nothing else here writes the URL). */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (q.trim()) url.searchParams.set("q", q);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
  }, [q]);

  const search = (v: string) => {
    setQ(v);
    setActive(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && hits.length) { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
    else if (e.key === "ArrowUp" && hits.length) { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
    else if (e.key === "Enter" && hits[active]) { e.preventDefault(); router.push(`${base}/${hits[active].article.slug}`); }
    else if (e.key === "Escape") { if (q) { e.preventDefault(); search(""); } else input.current?.blur(); }
  };

  return (
    <div className="hc-search" data-open={open || undefined}>
      <div className="hc-bar">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="hc-bar-icon">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => search(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          placeholder={ghost ? "" : "Search help"}
          aria-label="Search help"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        {ghost && (
          <span className="hc-ghost" aria-hidden="true">
            {ghost}
            <i className="hc-caret" />
          </span>
        )}
        <kbd className="hc-kbd" aria-hidden="true">Ctrl K</kbd>
      </div>

      {!open && chips.length > 0 && (
        <div className="hc-chips">
          <span>Popular:</span>
          {chips.map((c, i) => (
            <button key={c} type="button" style={{ "--i": i } as React.CSSProperties} onClick={() => { search(c); input.current?.focus(); }}>
              {c}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="hc-results" id={listId} role="listbox" aria-label="Answers">
          <p className="hc-results-head" aria-live="polite">
            {hits.length ? `${hits.length === 8 ? "Top 8" : hits.length} ${hits.length === 1 ? "answer" : "answers"} for “${q.trim()}”` : `Nothing matches “${q.trim()}” yet`}
          </p>
          {hits.length === 0 ? (
            <div className="hc-empty">
              <p>Try fewer words, or a word you see on the screen, like “order” or “payout”.</p>
              <a href={`/contact?back=${encodeURIComponent(base)}`}>Ask BTG instead →</a>
            </div>
          ) : (
            <ul>
              {hits.map((h, i) => (
                <li key={h.article.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active} style={{ "--i": i } as React.CSSProperties}>
                  <Link href={`${base}/${h.article.slug}`} onMouseEnter={() => setActive(i)} data-active={i === active || undefined}>
                    <span className="hc-hit-topic">{topicTitles[h.article.category] ?? ""}</span>
                    <span className="hc-hit-q"><Marked segs={h.question} /></span>
                    <span className="hc-hit-s">
                      {h.step ? (
                        <>
                          <b>Step {h.step.index + 1}:</b> <Marked segs={h.step.body} />
                        </>
                      ) : (
                        <Marked segs={h.summary} />
                      )}
                    </span>
                    <span className="hc-hit-go" aria-hidden="true">↵</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
