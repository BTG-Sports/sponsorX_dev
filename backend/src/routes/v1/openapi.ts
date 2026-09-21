/**
 * GET /api/v1/openapi.json — the published API contract (P2-BE-07, §38).
 *
 * Generated from the Zod registry on every request rather than committed as a
 * file, so the spec cannot drift from the code that serves it.
 *
 * It is served from here, by the API itself, and that is the whole point of
 * moving it: until 2026-09-21 this route lived in the Next app, so the
 * published description of the API was produced by a service that no longer
 * *is* the API. §8's API Service Account and INFINEX read this to learn how to
 * call us — a spec emitted by the wrong process is worse than no spec, because
 * it looks authoritative.
 *
 * No caching. A stale copy is exactly the drift this task exists to prevent.
 */
import { Router } from "express";

import { buildOpenApiDocument } from "../../contracts/registry";

export const openapiRouter = Router();

openapiRouter.get("/", (_req, res) => {
  res
    .type("application/json; charset=utf-8")
    .set("Cache-Control", "no-store")
    .json(buildOpenApiDocument());
});
