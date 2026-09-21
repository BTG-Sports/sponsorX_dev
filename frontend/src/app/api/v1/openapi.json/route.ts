import { buildOpenApiDocument } from "@/contracts/registry";

/**
 * GET /api/v1/openapi.json — the published API contract (P2-BE-07, §38).
 *
 * Generated from the Zod registry on every request rather than committed as a
 * file, so the spec cannot drift from the code that serves it.
 *
 * Deliberately not statically prerendered: §8's API Service Account and our own
 * portals read this at runtime, and a stale build-time copy is exactly the drift
 * this task exists to prevent.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(buildOpenApiDocument(), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
