import { FORMATS, quietPad, type PrintFormat, type PrintTheme } from "@/lib/qr-print";

/* P6-ART-01 — one printable QR template at real size (see lib/qr-print.ts
   for the specs). The tent's top face is printed upside down, so both faces
   read upright once folded on the centre line. */
export function QrArtwork(p: {
  format: PrintFormat;
  theme: PrintTheme;
  sponsor: string;
  offer: string;
  athlete: string | null;
  qrSrc: string;
  fallback: string | null;
}) {
  const spec = FORMATS[p.format];
  const dark = p.theme === "dark";
  const ink = dark ? "#f4f5f7" : "#0a0c10";
  const muted = dark ? "#b9c0cf" : "#4a5263";
  const ground = dark ? "#0a0c10" : "#ffffff";
  const pad = quietPad(spec.qr);
  const scale = p.format === "poster" ? 1 : p.format === "tent" ? 0.42 : 0.3;

  const face = (flip: boolean) => (
    <div
      style={{
        height: p.format === "tent" ? `${spec.h / 2}in` : "100%",
        transform: flip ? "rotate(180deg)" : undefined,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between",
        padding: `${0.5 * scale + 0.15}in`, boxSizing: "border-box", textAlign: "center",
      }}
    >
      <div style={{ fontSize: `${54 * scale}pt`, fontWeight: 700, letterSpacing: "-0.02em", color: ink, lineHeight: 1.05 }}>{p.sponsor}</div>
      <div style={{ fontSize: `${40 * scale}pt`, fontWeight: 600, color: ink, lineHeight: 1.15, maxWidth: "90%" }}>{p.offer}</div>
      <div style={{ fontSize: `${30 * scale}pt`, fontWeight: 700, color: "#f97a1f", textTransform: "uppercase", letterSpacing: "0.08em" }}>Scan to claim</div>
      <div style={{ background: "#ffffff", padding: `${pad}in`, borderRadius: `${0.08 * scale + 0.02}in` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a signed, short-lived bucket URL; next/image would proxy it */}
        <img src={p.qrSrc} alt="QR code to claim the reward" style={{ width: `${spec.qr}in`, height: `${spec.qr}in`, display: "block", imageRendering: "pixelated" }} />
      </div>
      {p.fallback && <div style={{ fontSize: `${18 * scale + 2}pt`, color: muted, fontFamily: "ui-monospace, monospace" }}>{p.fallback}</div>}
      <div style={{ fontSize: `${14 * scale + 2}pt`, color: muted }}>
        {p.athlete ? `With ${p.athlete} · ` : ""}Powered by BTG SponsorX
      </div>
    </div>
  );

  return (
    <div
      style={{
        width: `${spec.w}in`, height: `${spec.h}in`, background: ground, boxShadow: "0 1px 8px rgba(0,0,0,0.25)",
        fontFamily: "var(--font-poppins), system-ui, sans-serif", overflow: "hidden", position: "relative",
      }}
      className="print:!shadow-none"
    >
      {p.format === "tent" ? (
        <>
          {face(true)}
          <div aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, top: `${spec.h / 2}in`, borderTop: `1px dashed ${muted}` }} className="print:hidden" />
          {face(false)}
        </>
      ) : (
        face(false)
      )}
    </div>
  );
}
