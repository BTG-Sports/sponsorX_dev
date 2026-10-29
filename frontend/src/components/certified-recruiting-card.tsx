import { ArenaPanel, ArenaSection } from "@/components/arena-stage";
import { CERTIFIED_RECRUITING as CR, PARTNER_LINK } from "@/lib/certified-recruiting";

/* --------------------------------------------------------------------------
   5S1-FE-01 — the Certified Recruiting partner card, in two dresses:

     landing  on the home page's "For athletes" stop (#for-athletes), under
              the marketplace copy — the stop's glass style (cyan hairline,
              dark translucent ground, `on-media` ink, the same rounded-xl
              buttons as "Become a Sponsor");
     arena    on the athlete dashboard (/athlete), below the existing
              sections — an ArenaSection + ArenaPanel like its neighbours.

   Server component, fixed content (lib/certified-recruiting.ts), no API.
   The link opens certified-recruiting.com in a new tab with
   rel="noopener noreferrer"; an external partner is the one place a portal
   user is sent off the portal. Stacks at phone width, a row from sm.
   -------------------------------------------------------------------------- */

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-white p-1.5 ${className}`}>
      {/* The site's only logo file is a square JPEG on white, so it sits on a white plate. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- the partner's own logo on its own host; host-portable, no next/image optimizer */}
      <img src={CR.logoUrl} alt={CR.name} loading="lazy" decoding="async" className="size-full object-contain" />
    </span>
  );
}

function ExternalIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function CertifiedRecruitingCard({ variant, className = "" }: { variant: "landing" | "arena"; className?: string }) {
  if (variant === "landing") {
    return (
      <aside
        aria-label={`${CR.name}, a BTG partner`}
        className={`flex flex-col gap-3 rounded-2xl border border-[#9fdfff]/40 bg-[#0a1428]/55 p-4 text-on-media shadow-[0_0_18px_rgba(94,224,255,.18)] backdrop-blur-lg sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${className}`}
      >
        <Logo className="size-14 lg:size-16" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#5ee0ff]">{CR.eyebrow}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold leading-snug lg:text-[17px]">{CR.heading}</h3>
          <p className="mt-1 text-[13px] leading-[1.45] text-on-media/85">{CR.line}</p>
        </div>
        <a
          href={CR.url}
          {...PARTNER_LINK}
          className="sx-sheen relative inline-flex h-11 shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl border border-[#9fdfff]/50 bg-[#0a1428]/45 px-4 text-[14px] font-medium text-on-media transition-colors hover:border-[#5ee0ff] hover:bg-[#5ee0ff]/10 sm:px-5"
        >
          {CR.button}
          <ExternalIcon className="size-4 text-on-media/85" />
        </a>
      </aside>
    );
  }

  return (
    <section className={className}>
      <ArenaSection title="Recruiting support" hint={`${CR.name} is a BTG partner.`} delay={0.9} />
      <ArenaPanel delay={0.94} spot>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <Logo className="size-14" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold leading-snug">{CR.heading}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text/85">{CR.line}</p>
          </div>
          <a
            href={CR.url}
            {...PARTNER_LINK}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-athlete/40 px-4 text-[13px] font-semibold text-athlete transition-colors hover:bg-athlete/10"
          >
            {CR.button}
            <ExternalIcon />
          </a>
        </div>
      </ArenaPanel>
    </section>
  );
}
