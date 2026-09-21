import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";

// Importing ./zod first is load-bearing: it applies the `.openapi()` extension
// that registry.register() depends on. See src/contracts/zod.ts.
import "./zod";
import { PageMeta, PageQuery, ProblemDetails, Provenance } from "./common";

/**
 * The contracts registry (P2-BE-07 — §38, Addendum A2, Guide §02).
 *
 * Schema-first, one direction only: Zod is the single source of truth, and
 * `openapi.json` is generated from it. The spec is never hand-written, because a
 * hand-written spec drifts from the code the moment anyone is in a hurry — and
 * §8's API Service Account consumes this on equal terms with our own portals,
 * so drift is someone else's outage.
 *
 * Registering a contract here is what puts it in the published spec. Domain
 * contracts arrive with the milestone that builds their endpoints (B1 onwards),
 * against the real Prisma models from P2-BE-02.
 */
export const registry = new OpenAPIRegistry();

// --- shared components -----------------------------------------------------

registry.register("ProblemDetails", ProblemDetails);
registry.register("PageQuery", PageQuery);
registry.register("PageMeta", PageMeta);
registry.register("Provenance", Provenance);

/**
 * Bearer auth for §8's API Service Account. Clerk issues the session for human
 * callers; the service account presents a token on the same endpoints.
 */
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// --- document --------------------------------------------------------------

/** OpenAPI version emitted. 3.1 because it aligns with JSON Schema. */
export const OPENAPI_VERSION = "3.1.0" as const;

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: OPENAPI_VERSION,
    info: {
      title: "SponsorX API",
      version: "1.0.0",
      description:
        "Phase 1 API for the BTG SponsorX athlete sponsorship platform. Generated from Zod contracts — never hand-written. Every protected resource is tenant-scoped (§26).",
    },
    servers: [{ url: "/api/v1", description: "Phase 1 API root" }],
  });
}
