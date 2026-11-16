import type { Metadata } from "next";

import { HelpHome } from "@/components/help/help-home";
import type { SearchParams } from "@/lib/list-query";

/* POL-FE-99 — the finance portal's Help & FAQ: the header "?" lands here. */

export const metadata: Metadata = { title: "Help & FAQ · SponsorX" };

export default function FinanceHelpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <HelpHome portal="finance" searchParams={searchParams} />;
}
