import type { Metadata } from "next";

import { HelpArticlePage, helpArticleTitle } from "@/components/help/help-article";

/* POL-FE-99 — one next help question, as a guided tour. */

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: helpArticleTitle("next", slug) };
}

export default async function NextHelpArticlePage({ params }: Props) {
  const { slug } = await params;
  return <HelpArticlePage portal="next" slug={slug} />;
}
