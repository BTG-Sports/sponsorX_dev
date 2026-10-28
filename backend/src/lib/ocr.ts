/**
 * Read the words on a picture — P8-BE-11.
 *
 * tesseract.js (WebAssembly) on our own server, with the English language
 * data shipped in node_modules (@tesseract.js-data/eng): nothing is
 * downloaded at run time and no picture leaves the server. One reader is
 * started on first use and kept; pictures queue for it one at a time.
 *
 * A picture read with low confidence is tried turned a quarter, three
 * quarters and half way round — a card photographed sideways reads as
 * confident-looking nonsense only rarely — and the most confident reading
 * is kept. A reading that takes too long gives up: the reader is
 * replaced and the caller gets no words, which counts as unread (a person
 * looks at it), never as clear.
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

import { MIN_READ_CHARACTERS, normalizeWords } from "../domain/document-check-rules";

const require = createRequire(import.meta.url);
const LANG_PATH = join(dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int");
const READ_TIMEOUT_MS = 20_000;
/** OCR reads best at about this many pixels along the longer side. */
const READ_SIDE = 2000;

let worker: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function reader(): Promise<Worker> {
  worker ??= createWorker("eng", 1, { langPath: LANG_PATH, cacheMethod: "none", gzip: true }).then(async (w) => {
    /* Pictures carry no trustworthy resolution; say it, rather than have tesseract warn on every one. */
    await w.setParameters({ user_defined_dpi: "300" });
    return w;
  });
  return worker;
}

async function dropReader() {
  const w = worker;
  worker = null;
  if (w) await w.then((x) => x.terminate()).catch(() => {});
}

const characters = (text: string) => normalizeWords(text).replace(/ /g, "").length;

type Reading = { text: string; confidence: number };
/** Tesseract's own confidence (0–100) above which a reading is taken as it is, without turning the picture. */
const CONFIDENT = 70;

async function readOnce(picture: Buffer, turn: 0 | 90 | 180 | 270): Promise<Reading> {
  const prepared = await sharp(picture, { limitInputPixels: 50_000_000 })
    .autoOrient()
    .rotate(turn)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize({ width: READ_SIDE, height: READ_SIDE, fit: "inside", withoutEnlargement: true })
    .normalize()
    .png()
    .toBuffer();
  const w = await reader();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
  });
  const result = await Promise.race([
    w.recognize(prepared).then((r): Reading => ({ text: r.data.text, confidence: r.data.confidence })),
    timeout,
  ]).finally(() => clearTimeout(timer));
  if (result === null) {
    await dropReader();
    return { text: "", confidence: 0 };
  }
  return result;
}

/** The words on one picture, upright or turned; "" when none could be read. */
async function readPicture(picture: Buffer): Promise<string> {
  const good = (r: Reading) => r.confidence >= CONFIDENT && characters(r.text) >= MIN_READ_CHARACTERS;
  let best = await readOnce(picture, 0);
  if (good(best)) return best.text;
  for (const turn of [90, 270, 180] as const) {
    const r = await readOnce(picture, turn);
    if (r.confidence > best.confidence) best = r;
    if (good(best)) break;
  }
  return best.text;
}

/** The words on each picture, in order, joined. Never throws: a failure reads as no words. */
export function readPictures(pictures: readonly Buffer[]): Promise<string> {
  const run = queue.then(async () => {
    const texts: string[] = [];
    for (const p of pictures) texts.push(await readPicture(p).catch(() => ""));
    return texts.join("\n");
  });
  queue = run.catch(() => {});
  return run;
}

/** For tests and shutdown: stop the reader so the process can exit. */
export async function stopReader(): Promise<void> {
  await dropReader();
}
