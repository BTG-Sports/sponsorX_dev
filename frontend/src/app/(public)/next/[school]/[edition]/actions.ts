"use server";

import { headers } from "next/headers";

import { edgeHeadersFrom } from "@/server/edge";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

/**
 * POL-FE-77 — a reader opened a piece in the digital edition: one LINK_CLICK
 * on the ARTICLE (POST /public/editions/:id/events, public and rate-limited
 * per reader through the edge headers). Fire and forget — a failed count
 * never gets in the reader's way.
 */
export async function recordArticleOpenAction(editionId: string, assetId: string): Promise<void> {
  if (typeof editionId !== "string" || !editionId || typeof assetId !== "string" || !assetId) return;
  try {
    await fetch(`${API_URL}/api/v1/public/editions/${encodeURIComponent(editionId)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", ...edgeHeadersFrom(await headers()) },
      body: JSON.stringify({ type: "LINK_CLICK", targetKind: "ARTICLE", targetRef: assetId }),
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* counting is best-effort */
  }
}
