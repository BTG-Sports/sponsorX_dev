import { helpFor, helpHome } from "@/lib/help";
import type { HelpPortal } from "@/lib/help/types";
import type { SearchParams } from "@/lib/list-query";
import { HelpContact } from "./help-contact";
import { HelpSearch } from "./help-search";
import { PORTAL_WORD, toCard } from "./help-text";
import { HelpTopics } from "./help-topics";

import "./help.css";

/* --------------------------------------------------------------------------
   POL-FE-99 — a portal's Help & FAQ home: the "?" in the header lands here.

   Hero (the headline's letters rise in, the search bar's border turns, the
   portal's own questions type themselves out), then the topic cards, then
   the top questions or the chosen topic's, then the way to a person. Only
   this portal's help is ever shown: a sponsor never reads athlete answers.
   The colour is the portal's (data-portal → --hc-a / --hc-b in help.css), on
   whatever stage its layout already draws.
   -------------------------------------------------------------------------- */

const HEADLINE = "How can we help?";

function Kinetic({ text }: { text: string }) {
  let n = 0;
  return (
    <span aria-hidden="true" className="hc-kinetic">
      {text.split(" ").map((word, w) => (
        <span key={w} className="hc-word">
          {[...word].map((ch, c) => (
            <span key={c} className="hc-ch" style={{ "--i": n++ } as React.CSSProperties}>
              {ch}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export async function HelpHome({ portal, searchParams }: { portal: HelpPortal; searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const content = helpFor(portal);
  const base = helpHome(portal);
  const cards = content.articles.map(toCard);
  const topicTitles = Object.fromEntries(content.categories.map((c) => [c.key, c.title]));
  const tops = content.articles.filter((a) => a.top);
  const samples = (tops.length ? tops : content.articles).slice(0, 5).map((a) => a.question);
  const chips = [...new Set(content.articles.flatMap((a) => (a.top ? a.keywords.slice(0, 1) : [])))].slice(0, 4);

  return (
    <div className="hc" data-portal={portal}>
      <section className="hc-hero" aria-labelledby="hc-title">
        <div className="hc-hero-bg" aria-hidden="true">
          <span className="hc-aurora hc-aurora-a" />
          <span className="hc-aurora hc-aurora-b" />
          <span className="hc-floor" />
          <span className="hc-noise" />
        </div>
        <p className="hc-eyebrow">
          <span className="hc-pulse" aria-hidden="true" />
          Help & FAQ · {PORTAL_WORD[portal]}
        </p>
        <h1 id="hc-title" className="hc-title">
          <span className="sr-only">{HEADLINE}</span>
          <Kinetic text={HEADLINE} />
        </h1>
        <p className="hc-intro">{content.intro}</p>
        <HelpSearch base={base} articles={cards} topicTitles={topicTitles} samples={samples} chips={chips} initialQuery={one(sp.q)} />
      </section>

      <HelpTopics base={base} categories={content.categories} articles={cards} initialTopic={one(sp.topic) || null} />

      <HelpContact back={base} />
    </div>
  );
}
