import type { Metadata } from "next";

import { HelpArticlePage, helpArticleTitle } from "@/components/help/help-article";

/* POL-FE-99 — one sponsor help question, as a guided tour. */

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: helpArticleTitle("sponsor", slug) };
}

export default async function SponsorHelpArticlePage({ params }: Props) {
  const { slug } = await params;
  return <HelpArticlePage portal="sponsor" slug={slug} />;
}
