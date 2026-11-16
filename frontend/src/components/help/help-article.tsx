import Link from "next/link";
import { notFound } from "next/navigation";

import { articleFor, helpFor, helpHome, shotFor } from "@/lib/help";
import type { HelpPortal } from "@/lib/help/types";
import { HelpContact } from "./help-contact";
import { PORTAL_WORD, readingTime } from "./help-text";
import { HelpTour } from "./help-tour";

import "./help.css";

/* --------------------------------------------------------------------------
   POL-FE-99 — one question, answered as a guided tour: the short answer
   first, then every step with its screenshot (HelpTour), then what's good to
   know, related questions, and the way to a person.
   -------------------------------------------------------------------------- */

export function helpArticleTitle(portal: HelpPortal, slug: string): string {
  const a = articleFor(portal, slug);
  return a ? `${a.question} · Help` : "Help";
}

export function HelpArticlePage({ portal, slug }: { portal: HelpPortal; slug: string }) {
  const article = articleFor(portal, slug);
  if (!article) notFound();
  const content = helpFor(portal);
  const base = helpHome(portal);
  const topic = content.categories.find((c) => c.key === article.category);
  const related = (article.related ?? []).map((s) => articleFor(portal, s)).filter((a) => a !== null);
  const more = related.length
    ? related
    : content.articles.filter((a) => a.category === article.category && a.slug !== article.slug).slice(0, 3);
  const steps = article.steps.map((s) => ({ title: s.title, body: s.body, route: s.route, shot: shotFor(s.shot) }));

  return (
    <div className="hc hc-article" data-portal={portal}>
      <div className="hc-hero-bg hc-hero-bg-soft" aria-hidden="true">
        <span className="hc-aurora hc-aurora-a" />
        <span className="hc-aurora hc-aurora-b" />
      </div>

      <nav className="hc-crumbs" aria-label="Breadcrumb">
        <Link href={base} className="hc-back">
          <span aria-hidden="true">←</span> Help & FAQ
        </Link>
        {topic && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={`${base}?topic=${topic.key}`}>{topic.title}</Link>
          </>
        )}
      </nav>

      <header className="hc-art-head">
        <p className="hc-eyebrow">
          <span className="hc-pulse" aria-hidden="true" />
          {PORTAL_WORD[portal]} help · {steps.length} steps · {readingTime(article)}
          {article.audience === "guardian" && <span className="hc-tag">For guardians</span>}
          {article.audience === "minor" && <span className="hc-tag">Under 18</span>}
        </p>
        <h1 className="hc-art-title">
          {article.question.split(" ").map((w, i) => (
            <span key={i} className="hc-rise" style={{ "--i": i } as React.CSSProperties}>
              {w}{" "}
            </span>
          ))}
        </h1>
        <p className="hc-answer">
          <span className="hc-answer-k">Short answer</span>
          {article.summary}
        </p>
      </header>

      <HelpTour steps={steps} />

      {article.notes && article.notes.length > 0 && (
        <aside className="hc-notes" aria-labelledby="hc-notes-h">
          <h2 id="hc-notes-h">Good to know</h2>
          <ul>
            {article.notes.map((n, i) => (
              <li key={i} style={{ "--i": i } as React.CSSProperties}>
                {n}
              </li>
            ))}
          </ul>
        </aside>
      )}

      {more.length > 0 && (
        <section className="hc-related" aria-labelledby="hc-related-h">
          <h2 id="hc-related-h">{related.length ? "Related questions" : `More on ${topic?.title.toLowerCase() ?? "this"}`}</h2>
          <ul>
            {more.map((a, i) => (
              <li key={a.slug} style={{ "--i": i } as React.CSSProperties}>
                <Link href={`${base}/${a.slug}`}>
                  <span className="hc-related-q">{a.question}</span>
                  <span className="hc-related-s">{a.summary}</span>
                  <span className="hc-related-go" aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <HelpContact back={`${base}/${article.slug}`} />
    </div>
  );
}
