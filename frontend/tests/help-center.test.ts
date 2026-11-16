import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { HELP_PORTALS, articleFor, helpFor } from "@/lib/help";
import { normalise, searchHelp } from "@/lib/help/search";
import type { HelpArticle, ShotEntry } from "@/lib/help/types";

/* POL-FE-99 — the Help & FAQ center. Done when: every portal's help is
   searchable (question, keywords, summary, steps — in that order of weight),
   every article is whole (its topic exists, its related questions exist,
   every step names a screenshot) and the header "?" opens the portal's own
   help, not the public contact page. */

const A = (over: Partial<HelpArticle>): HelpArticle => ({
  slug: "x",
  category: "c",
  question: "Q",
  summary: "",
  keywords: [],
  steps: [{ title: "t", body: "b", route: "/", shot: "s" }],
  ...over,
});

describe("searchHelp", () => {
  const list = [
    A({ slug: "cash-out", question: "How do I cash out my earnings?", keywords: ["payout", "withdraw"] }),
    A({ slug: "buy", question: "How do I buy from the shop?", summary: "Pay at checkout", keywords: ["purchase"] }),
    A({ slug: "steps-only", question: "Something else", steps: [{ title: "Open", body: "press Cash out", route: "/", shot: "s" }] }),
  ];

  it("ranks a question match above a step-text match", () => {
    expect(searchHelp(list, "cash out").map((h) => h.article.slug)).toEqual(["cash-out", "steps-only"]);
  });

  it("matches keywords and word prefixes, ignoring case and accents", () => {
    expect(searchHelp(list, "WITHDR")[0].article.slug).toBe("cash-out");
    expect(normalise("Café")).toBe("cafe");
  });

  it("needs every word to match somewhere", () => {
    expect(searchHelp(list, "buy payout")).toEqual([]);
  });

  it("returns highlight segments inside the question", () => {
    const [hit] = searchHelp(list, "shop");
    expect(hit.question.some((p) => p.hit && p.text.toLowerCase() === "shop")).toBe(true);
    expect(hit.question.map((p) => p.text).join("")).toBe("How do I buy from the shop?");
  });

  it("an empty query returns nothing", () => {
    expect(searchHelp(list, "   ")).toEqual([]);
  });
});

describe("content integrity", () => {
  for (const portal of HELP_PORTALS) {
    it(`${portal}: slugs unique, topics and related questions exist, every step names its screenshot`, () => {
      const { categories, articles } = helpFor(portal);
      expect(articles.length).toBeGreaterThan(0);
      expect(new Set(articles.map((a) => a.slug)).size).toBe(articles.length);
      const cats = new Set(categories.map((c) => c.key));
      const slugs = new Set(articles.map((a) => a.slug));
      for (const c of categories) expect(articles.some((a) => a.category === c.key), `${portal} topic ${c.key} is empty`).toBe(true);
      for (const a of articles) {
        expect(a.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(cats.has(a.category), `${a.slug} topic ${a.category}`).toBe(true);
        for (const r of a.related ?? []) expect(slugs.has(r), `${a.slug} → ${r}`).toBe(true);
        expect(a.steps.length).toBeGreaterThan(0);
        a.steps.forEach((s, i) => expect(s.shot).toBe(`${portal}/${a.slug}-${i + 1}`));
      }
      expect(articleFor(portal, articles[0].slug)).toBe(articles[0]);
      expect(articleFor(portal, "no-such-question")).toBeNull();
    });
  }
});

describe("screenshots", () => {
  for (const portal of HELP_PORTALS) {
    it(`${portal}: every captured picture is on disk, and its ring sits inside it`, () => {
      const manifest = JSON.parse(readFileSync(`src/lib/help/shots/${portal}.json`, "utf8")) as Record<string, ShotEntry>;
      for (const [id, s] of Object.entries(manifest)) {
        expect(id.startsWith(`${portal}/`), id).toBe(true);
        expect(s.src.startsWith(`/help/${portal}/`), id).toBe(true);
        expect(existsSync(`public${s.src}`), `${id} → ${s.src}`).toBe(true);
        if (s.spot) {
          expect(s.spot.x + s.spot.w, id).toBeLessThanOrEqual(100.01);
          expect(s.spot.y + s.spot.h, id).toBeLessThanOrEqual(100.01);
        }
      }
    });
  }
});

describe("the header \"?\"", () => {
  it("opens the portal's own help center", () => {
    const shell = readFileSync("src/components/portal-shell.tsx", "utf8");
    expect(shell).toContain("href={`${rootHref}/help`}");
    expect(shell).toMatch(/aria-label="Help and FAQ"/);
  });
});
