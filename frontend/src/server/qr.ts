import "server-only";

import QRCode from "qrcode";

/**
 * POL-FE-77 — a real, scannable QR code for a link, as SVG markup drawn on
 * the server. The code card used a decorative 9×9 pattern; a sponsor's phone
 * scanning it went nowhere. Medium error correction survives a cracked
 * screen; the quiet zone keeps scanners happy on a dark card.
 */
export async function qrSvg(link: string): Promise<string> {
  return QRCode.toString(link, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#ffffff" } });
}
