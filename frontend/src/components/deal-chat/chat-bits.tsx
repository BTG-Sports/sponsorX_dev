import type { CSSProperties, ReactNode } from "react";

import { dealHue, dealInitials, type DealStage } from "@/lib/deal-chat";

/* --------------------------------------------------------------------------
   Deal Chat — the small pieces every chat surface shares: the round picture,
   the stage pill, the glyphs. No "use client": plain markup, so a server
   page (the order's Deal chat card) can draw them too.
   -------------------------------------------------------------------------- */

/** The round picture: two letters on a colour that stays with the name. */
export function ChatAvatar({ name, size = 40, dot = false }: { name: string; size?: number; /** The small lit dot: something here waits for you. */ dot?: boolean }) {
  const style = { "--dc-hue": dealHue(name), "--dc-size": `${size}px` } as CSSProperties;
  return (
    <span className="sx-dc-avatar" style={style} aria-hidden>
      {dealInitials(name)}
      {dot && <i className="sx-dc-avatar-dot" />}
    </span>
  );
}

export function StagePill({ stage }: { stage: Pick<DealStage, "label" | "tone"> }) {
  return <span className="sx-dc-pill" data-tone={stage.tone}>{stage.label}</span>;
}

const PATHS = {
  chat: "M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.6 3.7a.6.6 0 0 1-1-.47V16A2.5 2.5 0 0 1 4 13.5z",
  send: "M4.2 4.3 20 12 4.2 19.7 6.6 12zM6.6 12H13",
  tag: "M3.5 11.6V5a1.5 1.5 0 0 1 1.5-1.5h6.6a1.5 1.5 0 0 1 1.06.44l7.4 7.4a1.5 1.5 0 0 1 0 2.12l-6.6 6.6a1.5 1.5 0 0 1-2.12 0l-7.4-7.4a1.5 1.5 0 0 1-.44-1.06zM8 8h.01",
  check: "M5 12.5 10 17.5 19.5 7",
  x: "M6 6l12 12M18 6 6 18",
  chevron: "M8 10l4 4 4-4",
  back: "M14.5 5.5 8 12l6.5 6.5",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.6v.2",
  file: "M7 3h7l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19.5v-15A1.5 1.5 0 0 1 7.5 3zM14 3v5h5M9 13h6M9 17h4",
  download: "M12 4v11M7.5 11 12 15.5 16.5 11M5 19.5h14",
  flag: "M6 21V4M6 4.5h10.5l-1.8 3.6 1.8 3.6H6",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.9-3.9",
  expand: "M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7",
  minus: "M5 12h14",
  pin: "M9 4h6l-.8 5 3.3 3.5H6.5L9.8 9zM12 12.5V20",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  shield: "M12 3 5 5.8v5.4c0 4.4 2.9 8.1 7 9.8 4.1-1.7 7-5.4 7-9.8V5.8zM9 12l2.2 2.2L15.2 10",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2",
  dollar: "M12 3v18M16 7.5c-.6-1.3-2-2-4-2-2.4 0-4 1.2-4 3s1.5 2.6 4 3.2 4 1.3 4 3.3-1.6 3-4 3c-2.2 0-3.7-.8-4.3-2.3",
  card: "M3.5 7A1.5 1.5 0 0 1 5 5.5h14A1.5 1.5 0 0 1 20.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17zM3.5 10h17",
  reply: "M10 6 4.5 11.5 10 17M4.5 11.5H14a5.5 5.5 0 0 1 5.5 5.5v1",
  order: "M6 3.5h12v17l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
} as const;

export type ChatGlyph = keyof typeof PATHS;

/** A stroked 24px glyph, the house style (components/icons.ts). */
export function Glyph({ name, size = 18, className }: { name: ChatGlyph; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

/** A round icon button with a spoken name. */
export function IconButton({ label, name, onClick, active, href, size = 18, disabled }: {
  label: string; name: ChatGlyph; onClick?: () => void; active?: boolean; href?: string; size?: number; disabled?: boolean;
}) {
  if (href) {
    return <a className="sx-dc-icon" href={href} aria-label={label} title={label}><Glyph name={name} size={size} /></a>;
  }
  return (
    <button type="button" className="sx-dc-icon" aria-label={label} title={label} aria-pressed={active === undefined ? undefined : active} data-active={active ? "" : undefined} onClick={onClick} disabled={disabled}>
      <Glyph name={name} size={size} />
    </button>
  );
}

/** A collapsible block of the deal panel ("Chat info" keeps its groups this way). */
export function PanelSection({ title, note, children, defaultOpen = true }: { title: string; note?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="sx-dc-sec" open={defaultOpen}>
      <summary>
        <span className="sx-dc-sec-title">{title}</span>
        {note && <span className="sx-dc-sec-note">{note}</span>}
        <Glyph name="chevron" size={16} className="sx-dc-sec-chev" />
      </summary>
      <div className="sx-dc-sec-body">{children}</div>
    </details>
  );
}
