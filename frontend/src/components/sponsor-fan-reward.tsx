import { apiFetch } from "@/server/api";
import type { ApiReward, ApiRewardDetail } from "@/lib/rewards-live";
import { QrLinkButton } from "./qr-link-button";

/* --------------------------------------------------------------------------
   POL-FE-67 (app review §2) — the sponsor's fan reward and leads, on their
   campaign page. The API let a sponsor read their own campaign's rewards,
   tokens and staff code, and the fans who said the sponsor may contact
   them (GET /rewards?campaignId, /rewards/:id, /campaigns/:id/leads), but
   no sponsor screen called them. A read the sponsor's role isn't given
   simply draws nothing — never sample data.
   -------------------------------------------------------------------------- */

async function read<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";

export async function SponsorFanReward({ campaignId }: { campaignId: string }) {
  const list = await read<{ rewards: ApiReward[] }>(`/rewards?campaignId=${encodeURIComponent(campaignId)}`);
  const leads = await read<{ leads: { email: string; consentedAt: string | null; consentVersion: string | null }[] }>(`/campaigns/${encodeURIComponent(campaignId)}/leads`);
  const rewards = list?.rewards ?? [];
  if (!rewards.length && !leads?.leads.length) return null;
  const details = (await Promise.all(rewards.map((r) => read<ApiRewardDetail>(`/rewards/${encodeURIComponent(r.id)}`)))).filter((d): d is ApiRewardDetail => Boolean(d));
  return (
    <section aria-label="Fan reward" className="min-w-0 space-y-3">
      <h2 className="text-sm font-semibold tracking-tight">Fan reward</h2>
      {details.map((r) => (
        <div key={r.id} className="rounded-xl border border-line-soft p-4 text-xs">
          <p className="text-sm font-medium">{r.offerText}</p>
          <p className="mt-1 text-muted">{r.state.toLowerCase().replace(/_/g, " ")} · ends {day(r.expiresAt)}{r.followsCampaign ? ` · ${r.followsCampaign}` : ""}</p>
          {r.staffCode && (
            <p className="mt-2">Staff code for the booth: <span className="font-mono text-sm font-semibold tracking-widest">{r.staffCode}</span></p>
          )}
          {r.tokens.length > 0 && (
            <ul className="mt-3 space-y-1.5" aria-label="QR codes">
              {r.tokens.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t.athlete?.displayName ?? "Campaign code"}</span>
                  {t.qrReady ? <QrLinkButton tokenId={t.id} /> : <span className="text-faint">QR not ready</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {leads && (
        <div className="rounded-xl border border-line-soft p-4 text-xs">
          <p className="text-sm font-medium">Fans who said you may contact them · {leads.leads.length}</p>
          {leads.leads.length === 0 ? (
            <p className="mt-1 text-muted">None yet — fans tick this when they claim the reward.</p>
          ) : (
            <ul className="mt-2 space-y-1" aria-label="Leads">
              {leads.leads.map((l) => (
                <li key={l.email} className="flex flex-wrap justify-between gap-2"><span className="break-all">{l.email}</span><span className="text-faint">agreed {day(l.consentedAt)}</span></li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
