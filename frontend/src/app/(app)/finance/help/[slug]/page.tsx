import type { Metadata } from "next";

import { HelpArticlePage, helpArticleTitle } from "@/components/help/help-article";

/* POL-FE-99 — one finance help question, as a guided tour. */

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: helpArticleTitle("finance", slug) };
}

export default async function FinanceHelpArticlePage({ params }: Props) {
  const { slug } = await params;
  return <HelpArticlePage portal="finance" slug={slug} />;
}
