import type { CSSProperties } from "react";

/* --------------------------------------------------------------------------
   The wizards' shared pieces — the medal, its confetti and the glyphs —
   used by the confirmations wizard (POL-FE-79) and the profile wizard
   (POL-FE-80). Styled by `app/(app)/athlete/confirmations/confirmations.css`
   (`.sx-cw-*`), which both pages import. Presentational only: no state, so
   the server and the client draw the same.
   -------------------------------------------------------------------------- */

/** A staggered entrance delay for `.sx-cw-rise`. */
export const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/* Burst particles — fixed, so the server and client draw the same. */
const COLORS = ["var(--sx-athlete)", "var(--sx-accent)", "var(--sx-success)", "var(--sx-primary-soft)", "var(--sx-warn)"];
export function Burst({ n, reach }: { n: number; reach: number }) {
  return (
    <span aria-hidden="true" className="sx-cw-burst">
      {Array.from({ length: n }, (_, k) => (
        <i
          key={k}
          style={{
            "--a": `${Math.round((k * 360) / n + ((k * 37) % 17) - 8)}deg`,
            "--r": `${reach * (0.62 + ((k * 53) % 40) / 100)}px`,
            "--s": `${((k * 97) % 300) - 150}deg`,
            "--t": `${0.35 + ((k * 13) % 10) / 100}s`,
            "--c": COLORS[k % COLORS.length],
            width: k % 3 === 0 ? 6 : 8,
            height: k % 3 === 0 ? 6 : 13,
            borderRadius: k % 3 === 0 ? 9999 : 3,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}

export function Medal({ size, burst }: { size: "md" | "lg"; burst: number }) {
  return (
    <span className="sx-cw-medal" data-size={size}>
      {burst > 0 && <Burst n={burst} reach={size === "lg" ? 210 : 120} />}
      <span aria-hidden="true" className="sx-cw-orbit" />
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="sx-cw-disc" cx="50" cy="50" r="44" />
        <circle className="sx-cw-ring" cx="50" cy="50" r="44" pathLength={1} />
        <path className="sx-cw-tick" pathLength={1} d="M31 51.5l12.5 12.5L70 37.5" />
      </svg>
    </span>
  );
}

/* ------------------------------------------------------------------ glyphs */

export function Tick() {
  return <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
export function Arrow() {
  return <svg viewBox="0 0 24 24" className="sx-cw-arrow size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
export function Flag() {
  return <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V4m0 0h11l-2 4 2 4H5" /></svg>;
}
export function Shield() {
  return <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /></svg>;
}
export function Eye() {
  return <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}
export function Lock() {
  return <svg viewBox="0 0 24 24" className="size-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
}
