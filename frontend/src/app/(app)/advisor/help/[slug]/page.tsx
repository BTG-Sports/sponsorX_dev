import type { Metadata } from "next";

import { HelpArticlePage, helpArticleTitle } from "@/components/help/help-article";

/* POL-FE-99 — one advisor help question, as a guided tour. */

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: helpArticleTitle("advisor", slug) };
}

export default async function AdvisorHelpArticlePage({ params }: Props) {
  const { slug } = await params;
  return <HelpArticlePage portal="advisor" slug={slug} />;
}
