import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

/**
 * The one Zod instance the contracts layer uses (P2-BE-07).
 *
 * `zod-to-openapi` works by patching `ZodType.prototype.openapi`, which the
 * registry calls internally — so the patch must be applied to the *same* module
 * instance that built the schema being registered, and before any schema is
 * registered.
 *
 * Applying it inline in registry.ts is not reliable: under the Next server build
 * the schema modules and the registry module did not share a patched prototype,
 * and `registry.register(...)` failed with "openapi is not a function" at build
 * time even though the identical code works under plain Node. Funnelling every
 * contract through this module removes the ordering question entirely.
 *
 * **Import `z` from here, never from "zod", anywhere under src/contracts.**
 */
extendZodWithOpenApi(z);

export { z };

/**
 * Postgres `integer` (int4) upper bound. Every contract field that lands in an
 * `Int` column caps at this — without it `z.int()` admits any safe integer,
 * and 2^31 reached the column as a 500 with the driver's message (QA-03,
 * pass 5) instead of a 400 naming the field.
 */
export const INT4_MAX = 2_147_483_647;
