/**
 * The upload step's one external dependency — P5-QA-01.
 *
 * A deliverable upload is presign (API) → PUT straight from the browser to
 * the object store → record (API) → submit (API). Locally the PUT lands in
 * MinIO for real. CI's e2e job has no object store, and the backend never
 * reads the bytes back (no HEAD on record; presigning is local signing), so
 * when the store is unreachable the browser's signed PUT — and only that — is
 * answered by the test, with the CORS headers a real bucket sends. Every API
 * step around it still runs for real.
 */
import type { Page } from "@playwright/test";

const ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:9000";

export async function objectStoreReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${ENDPOINT}/minio/health/live`, { signal: AbortSignal.timeout(2_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Returns true when the PUT is stubbed, so a spec can annotate the run. */
export async function useObjectStore(page: Page): Promise<boolean> {
  /* E2E_STUB_OBJECT_STORE=1 forces the CI path on a machine that has MinIO. */
  if (!process.env.E2E_STUB_OBJECT_STORE && (await objectStoreReachable())) return false;
  await page.route(
    (url) => url.searchParams.has("X-Amz-Signature"),
    async (route) => {
      const method = route.request().method();
      if (method !== "PUT" && method !== "OPTIONS") return route.continue();
      await route.fulfill({
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "PUT",
          "Access-Control-Allow-Headers": "Content-Type",
          ETag: '"e2e"',
        },
        body: "",
      });
    },
  );
  return true;
}
