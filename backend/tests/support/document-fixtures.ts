/**
 * Documents for the document-check tests (P8-BE-09, P8-BE-11): an ID card
 * drawn as a picture, and small PDFs written by hand — one with its own
 * words, one that is only a scanned picture, one locked with a password.
 * Nothing here is a real person's document.
 */
import { randomBytes } from "node:crypto";
import sharp from "sharp";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** An ID card, 1000 × 630 unless scaled: its lines of text on a pale card, on a mid-grey table. */
export async function idCard(lines: readonly string[], opts: { scale?: number } = {}): Promise<Buffer> {
  const w = 1000, h = 630;
  const text = lines.map((l, i) => `<text x="60" y="${120 + i * 70}" font-size="${i === 0 ? 46 : 38}" font-family="Arial, Helvetica, sans-serif" fill="#111">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#8a8f96"/>`
    + `<rect x="20" y="20" width="${w - 40}" height="${h - 40}" rx="28" fill="#f3efe4"/><rect x="${w - 260}" y="90" width="190" height="240" fill="#c9c2b2"/>${text}</svg>`;
  const scale = opts.scale ?? 1;
  return sharp(Buffer.from(svg)).resize(Math.round(w * scale), Math.round(h * scale)).png().toBuffer();
}

export const ID_LINES = ["STATE OF OHIO DRIVER LICENSE", "TOWNES, ARDINIA M", "DOB 03/14/2005", "EXP 03/14/2029", "4d DL 0012-345-678"];

/** The ways a photo goes wrong, from a good one. */
export const spoil = {
  dark: (png: Buffer) => sharp(png).linear(0.08, 2).png().toBuffer(),
  blurred: (png: Buffer) => sharp(png).blur(9).png().toBuffer(),
  washedOut: (png: Buffer) => sharp(png).linear(0.06, 243).png().toBuffer(),
  blank: () => sharp({ create: { width: 1000, height: 630, channels: 3, background: "#7f7f7f" } }).png().toBuffer(),
  tiny: (png: Buffer) => sharp(png).resize(320, 200).png().toBuffer(),
  /** A phone photo: slightly soft, a little noisy, JPEG — and still readable. */
  phone: async (png: Buffer) => {
    const soft = await sharp(png).blur(1.1).raw().toBuffer({ resolveWithObject: true });
    const noisy = Buffer.from(soft.data);
    for (let i = 0; i < noisy.length; i++) noisy[i] = Math.max(0, Math.min(255, noisy[i]! + ((i * 7919) % 13) - 6));
    return sharp(noisy, { raw: soft.info }).jpeg({ quality: 82 }).toBuffer();
  },
};

/** Join PDF objects into a file with a correct cross-reference table. */
function pdfFile(objects: (string | Buffer)[], trailerExtra = ""): Buffer {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let at = parts[0]!.length;
  objects.forEach((o, i) => {
    offsets.push(at);
    const body = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), typeof o === "string" ? Buffer.from(o, "latin1") : o, Buffer.from("\nendobj\n")]);
    parts.push(body);
    at += body.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailerExtra}>>\nstartxref\n${at}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

/** A one-page PDF with its own words, Helvetica, one line each. `locked` adds a user password nobody knows. */
export function textPdf(lines: readonly string[], opts: { locked?: boolean } = {}): Buffer {
  const ops = lines.map((l, i) => `BT /F1 16 Tf 60 ${740 - i * 26} Td (${l.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj ET`).join("\n");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`,
  ];
  if (!opts.locked) return pdfFile(objects);
  const hex = (n: number) => randomBytes(n).toString("hex");
  objects.push(`<< /Filter /Standard /V 1 /R 2 /O <${hex(32)}> /U <${hex(32)}> /P -44 >>`);
  return pdfFile(objects, `/Encrypt ${objects.length} 0 R /ID [<${hex(16)}> <${hex(16)}>] `);
}

/** A one-page PDF that is only a picture — what a scanner makes. */
export async function scannedPdf(picture: Buffer): Promise<Buffer> {
  const jpeg = await sharp(picture).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  const { width, height } = await sharp(jpeg).metadata();
  const pageW = 612, pageH = Math.round((612 * height!) / width!);
  const ops = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im1 Do Q`;
  return pdfFile([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, "latin1"),
      jpeg, Buffer.from("\nendstream", "latin1"),
    ]),
    `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`,
  ]);
}
