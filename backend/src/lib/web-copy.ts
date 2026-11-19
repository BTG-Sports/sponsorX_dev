/**
 * P9-BE-26 — make the PUBLIC copy of a published edition's picture, video or
 * ad, with its location data removed (owner, 2026-11-19: photos and videos
 * from a phone record where they were taken, and most makers are minors).
 * Worker-side only.
 *
 *   - A photo is decoded and saved again by sharp, which writes no metadata
 *     unless asked (no EXIF, no GPS, no XMP). Its orientation is applied
 *     first, so it still stands the right way up.
 *   - A video is remuxed by ffmpeg — same picture and sound, no re-encode —
 *     keeping only the video and audio streams and no metadata at all
 *     (`-map_metadata -1`; a phone's location rides in metadata or a data
 *     stream, both dropped).
 *   - A PDF ad is drawn as a picture of its first page.
 *
 * Without ffmpeg a video gets NO copy (fail closed), with a problem the
 * sweep retries once the tool is there.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";

import { drawFirstPdfPage } from "./document-inspect";

/** How long a CDN may keep serving a copy after it's taken down: ten minutes, one sweep. */
export const WEB_CACHE_CONTROL = "public, max-age=600";

/** A photo bigger than this isn't decoded for the web (memory); a real magazine photo is far smaller. */
export const MAX_WEB_PHOTO_BYTES = 50 * 1024 * 1024;

/** The words a piece carries when the video tool is missing — the one problem the sweep retries. */
export const VIDEO_TOOL_MISSING = "Videos can't be published until the worker has its video tool (ffmpeg).";

export type WebCopy = { body: Buffer | { file: string; bytes: number }; type: string; ext: string; cleanup: () => Promise<void> };
export type WebCopyProblem = { problem: string };

const none = async () => {};

/** Videos a browser plays, and the container their copy is written in. */
export const PLAYABLE_VIDEO: Readonly<Record<string, { format: "mp4" | "webm"; type: string; ext: string }>> = {
  "video/mp4": { format: "mp4", type: "video/mp4", ext: "mp4" },
  "video/quicktime": { format: "mp4", type: "video/mp4", ext: "mp4" },
  "video/webm": { format: "webm", type: "video/webm", ext: "webm" },
};

/** A photo, saved again without metadata. JPEG, PNG and GIF keep their kind; anything else becomes WebP. */
export async function webCopyOfPhoto(bytes: Buffer): Promise<WebCopy | WebCopyProblem> {
  if (bytes.length > MAX_WEB_PHOTO_BYTES) return { problem: "This photo is over 50 MB, so it can't be shown on the web. Upload a smaller copy." };
  try {
    const meta = await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata();
    const animated = (meta.pages ?? 1) > 1;
    const img = sharp(bytes, { limitInputPixels: 50_000_000, animated }).rotate();
    const out =
      meta.format === "jpeg" ? { buf: await img.jpeg({ quality: 90 }).toBuffer(), type: "image/jpeg", ext: "jpg" }
      : meta.format === "png" ? { buf: await img.png().toBuffer(), type: "image/png", ext: "png" }
      : meta.format === "gif" ? { buf: await img.gif().toBuffer(), type: "image/gif", ext: "gif" }
      : { buf: await img.webp({ quality: 90 }).toBuffer(), type: "image/webp", ext: "webp" };
    return { body: out.buf, type: out.type, ext: out.ext, cleanup: none };
  } catch {
    return { problem: "This photo couldn't be opened, so it can't be shown. Upload it again as a JPG, PNG or WebP." };
  }
}

/** A PDF ad, as a picture of its first page. */
export async function webCopyOfPdfAd(bytes: Buffer): Promise<WebCopy | WebCopyProblem> {
  const png = await drawFirstPdfPage(bytes);
  if (!png) return { problem: "This PDF ad couldn't be drawn, so it can't be shown. Upload it again, or as a JPG or PNG." };
  return webCopyOfPhoto(png);
}

/** ffmpeg's arguments: copy video and audio as they are, drop every other stream and all metadata. */
export function videoToolArgs(input: string, output: string, format: "mp4" | "webm"): string[] {
  return [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", input,
    "-map", "0:v", "-map", "0:a?",
    "-map_metadata", "-1", "-map_chapters", "-1",
    "-c", "copy",
    ...(format === "mp4" ? ["-movflags", "+faststart"] : []),
    "-f", format, output,
  ];
}

export type VideoTool = (args: string[]) => Promise<void>;

/** Thrown by the video tool when ffmpeg isn't installed. */
export class VideoToolMissingError extends Error {}

/** Run ffmpeg (FFMPEG_PATH, else `ffmpeg` on PATH), up to 30 minutes. */
export const runVideoTool: VideoTool = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.env.FFMPEG_PATH || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-2000); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 30 * 60 * 1000);
    child.on("error", (e: NodeJS.ErrnoException) => { clearTimeout(timer); reject(e.code === "ENOENT" ? new VideoToolMissingError() : e); });
    child.on("close", (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`ffmpeg exited ${code}: ${err}`)); });
  });

/** Whether ffmpeg runs here — asked once a process, so a missing tool costs nothing per sweep. */
let toolReady: Promise<boolean> | null = null;
export function videoToolReady(): Promise<boolean> {
  toolReady ??= runVideoTool(["-hide_banner", "-loglevel", "error", "-version"]).then(() => true, () => false);
  return toolReady;
}

/** A video, remuxed without metadata into a temporary file, read from a signed link. */
export async function webCopyOfVideo(type: string, signedUrl: string, tool: VideoTool = runVideoTool): Promise<WebCopy | WebCopyProblem> {
  const target = PLAYABLE_VIDEO[type];
  if (!target) return { problem: "This video's format doesn't play in a browser, so it can't be shown. Upload it as MP4 or WebM." };
  const file = join(tmpdir(), `sx-web-${randomUUID()}.${target.ext}`);
  const cleanup = () => unlink(file).catch(() => {});
  try {
    await tool(videoToolArgs(signedUrl, file, target.format));
    const { size } = await stat(file);
    if (!size) throw new Error("empty output");
    return { body: { file, bytes: size }, type: target.type, ext: target.ext, cleanup };
  } catch (error) {
    await cleanup();
    if (error instanceof VideoToolMissingError) return { problem: VIDEO_TOOL_MISSING };
    return { problem: "This video couldn't be prepared for the web, so it can't be shown. Upload it again as MP4." };
  }
}
