/**
 * Which platform a published deliverable went out on — 3S0-BE-06 (warehouse
 * open item O1).
 *
 * Read from the published URL's host when the athlete marks the deliverable
 * published, so they enter nothing new. A host matches only itself or a
 * subdomain of it: `vm.tiktok.com` is TikTok, `instagram.com.evil.example`
 * is not Instagram. Anything else, including a URL that does not parse, is
 * OTHER. The migration `…_deliverable_platform` applies the same rule in SQL
 * to rows published before; change both together.
 */

export const DELIVERABLE_PLATFORMS = ["INSTAGRAM", "TIKTOK", "YOUTUBE", "X", "FACEBOOK", "OTHER"] as const;
export type DeliverablePlatform = (typeof DELIVERABLE_PLATFORMS)[number];

const HOSTS: ReadonlyArray<[DeliverablePlatform, readonly string[]]> = [
  ["INSTAGRAM", ["instagram.com"]],
  ["TIKTOK", ["tiktok.com"]],
  ["YOUTUBE", ["youtube.com", "youtu.be"]],
  ["X", ["x.com", "twitter.com"]],
  ["FACEBOOK", ["facebook.com", "fb.watch"]],
];

export function platformOf(url: string): DeliverablePlatform {
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return "OTHER";
  }
  for (const [platform, domains] of HOSTS) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return platform;
  }
  return "OTHER";
}
