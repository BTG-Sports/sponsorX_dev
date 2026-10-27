/* --------------------------------------------------------------------------
   The network numbers on the public pages: the home page's "Real Impact"
   card, its closing "The numbers" panel, and the /login figures.

   They used to be fixture constants (148 athletes, 86 campaigns, "$2.3M
   attributed fan value"), shown on the live site as if they were real
   (staging dry run, 2026-10-26). Now each one is a row count from
   GET /public/network-stats (backend domain/public-network-stats.ts), which
   is what stats-must-be-retrievable asks.

   Two rules for showing them:
   - **A figure that is zero is left out.** "0 campaigns delivered" is true,
     but it reads as broken, and leaving it out claims nothing.
   - **No read, no figures.** When the API can't be reached, the panels show
     nothing rather than falling back to made-up numbers.

   Pure, so server pages and client islands can share it.
   -------------------------------------------------------------------------- */

export type PublicNetworkStats = {
  athletes: number;
  campaignsDelivered: number;
  postsVerified: number;
  rewardsRedeemed: number;
  readAt: string;
};

export type NetworkKey = "athletes" | "campaignsDelivered" | "postsVerified" | "rewardsRedeemed";

export type NetworkFigure = {
  key: NetworkKey;
  label: string;
  /** The label without its tail, for narrow screens ("Athletes"). */
  short: string;
  value: number;
  /** Where the count comes from, in plain words (the row's title). */
  source: string;
};

const FIGURES: Record<NetworkKey, Omit<NetworkFigure, "key" | "value">> = {
  athletes: { label: "Athletes in the network", short: "Athletes", source: "Athletes active on SponsorX now" },
  campaignsDelivered: { label: "Campaigns delivered", short: "Campaigns", source: "Campaigns completed on SponsorX" },
  postsVerified: { label: "Posts verified", short: "Posts", source: "Sponsored posts checked by the platform or BTG" },
  rewardsRedeemed: { label: "Fan rewards redeemed", short: "Rewards", source: "Fan offers used at events, counted by SponsorX" },
};

/** The figures for `keys`, in that order, leaving out zeros; [] with no read. */
export function networkFigures<K extends NetworkKey>(stats: PublicNetworkStats | null, keys: readonly K[]): (NetworkFigure & { key: K })[] {
  if (!stats) return [];
  return keys
    .map((key) => ({ key, ...FIGURES[key], value: stats[key] }))
    .filter((f) => Number.isFinite(f.value) && f.value > 0);
}
