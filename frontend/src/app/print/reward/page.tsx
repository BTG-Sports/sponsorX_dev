import Link from "next/link";
import { headers } from "next/headers";

import { PrintButton } from "@/components/print-button";
import type { ApiRewardDetail } from "@/lib/rewards-live";
import { QrArtwork as Artwork } from "@/components/qr-artwork";
import { FORMATS, fallbackAddress, formatOf, themeOf, type PrintFormat, type PrintTheme } from "@/lib/qr-print";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   /print/reward?reward=<id>&token=<tokenId>&format=poster|tent|sticker&theme=light|dark
   — P6-ART-01's printable QR formats, filled with a reward's REAL QR code.

   Outside the admin layout on purpose: nothing but the artwork prints. Access
   is the admin portal's (requirePortalAccess), and the QR image is the
   token's own signed private-bucket URL (GET /reward-tokens/:id/qr-url, which
   needs reward write — the same people who can issue the token).

   Sized in real inches with @page, so "print at 100%" gives the spec sizes.
   No sponsor logo is stored anywhere yet, so the sponsor's name is set as a
   wordmark in its place.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
export const metadata = { title: "Print QR · SponsorX" };

export default async function PrintRewardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("admin");
  const sp = await searchParams;
  const rewardId = typeof sp.reward === "string" ? sp.reward : "";
  const tokenId = typeof sp.token === "string" ? sp.token : "";
  const format = formatOf(sp.format);
  const theme = themeOf(sp.theme);

  const [rRes, qRes] = await Promise.all([
    apiFetch(`/rewards/${encodeURIComponent(rewardId)}`),
    apiFetch(`/reward-tokens/${encodeURIComponent(tokenId)}/qr-url`),
  ]);
  if (!rRes.ok || !qRes.ok) {
    return (
      <main className="mx-auto max-w-md p-8 text-sm">
        <h1 className="text-lg font-semibold">This QR can’t be printed</h1>
        <p className="mt-2 text-muted">
          {rRes.status === 403 || qRes.status === 403
            ? "Printing needs the same access as issuing the reward."
            : "The reward or its QR code isn’t ready — open the reward’s QR panel and try again once the code has generated."}
        </p>
        <Link href="/admin/rewards" className="mt-4 inline-block text-primary hover:underline">
          Back to rewards
        </Link>
      </main>
    );
  }
  const reward = (await rRes.json()) as ApiRewardDetail;
  const { url: qrSrc } = (await qRes.json()) as { url: string };
  const token = reward.tokens.find((t) => t.id === tokenId);
  const h = await headers();
  const host = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "sponsorx.net"}`;
  const fallback = token?.token ? fallbackAddress(host, token.token) : null;
  const spec = FORMATS[format];

  const link = (f: PrintFormat, t: PrintTheme) =>
    `/print/reward?reward=${encodeURIComponent(rewardId)}&token=${encodeURIComponent(tokenId)}&format=${f}&theme=${t}`;

  return (
    <>
      <style>{`@page { size: ${spec.w}in ${spec.h}in; margin: 0 } @media print { html, body { background: #fff !important } }`}</style>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3 text-xs print:hidden">
        <Link href="/admin/rewards" className="text-muted hover:text-text">
          ← Rewards
        </Link>
        <span className="mx-2 text-faint">|</span>
        {(Object.keys(FORMATS) as PrintFormat[]).map((f) => (
          <Link key={f} href={link(f, theme)} className={`rounded-lg border px-2.5 py-1.5 ${f === format ? "border-primary/60 text-primary" : "border-line text-muted"}`}>
            {FORMATS[f].label}
          </Link>
        ))}
        {(["light", "dark"] as PrintTheme[]).map((t) => (
          <Link key={t} href={link(format, t)} className={`rounded-lg border px-2.5 py-1.5 ${t === theme ? "border-primary/60 text-primary" : "border-line text-muted"}`}>
            {t === "light" ? "Light" : "Dark brand"}
          </Link>
        ))}
        <span className="ml-auto text-faint">Print at 100% (actual size). QR prints at {spec.qr} in.</span>
        <PrintButton />
      </div>
      <div className="grid place-items-center bg-surface-2 p-8 print:block print:bg-white print:p-0">
        <Artwork
          format={format}
          theme={theme}
          sponsor={reward.campaign.sponsorName}
          offer={reward.offerText}
          athlete={token?.athlete?.displayName ?? null}
          qrSrc={qrSrc}
          fallback={fallback}
        />
      </div>
    </>
  );
}
