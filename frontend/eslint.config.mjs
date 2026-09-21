import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * P2-OPS-06 — fail on any Prisma read that does not name the fields it wants.
 *
 * Guide §04: row scoping is the easy half of authorisation. The leak is a query
 * that returns a field the caller must never see — `AthleteRate.amount` on a
 * sponsor-facing screen, `Campaign.budget` on an athlete one. A bare
 * `findMany()` returns every scalar column on the model, so today's safe query
 * silently starts leaking the moment P2-BE-02 adds a sensitive column.
 *
 * Requiring an explicit `select` makes that impossible by construction: adding a
 * column to the schema can never widen an existing query's result.
 *
 * This is a syntactic check, so it is deliberately blunt — it looks for a
 * `select` anywhere in the call's arguments. That accepts a nested `select`
 * inside an `include`, which is the correct call to make: the alternative is
 * type-aware linting, which is far slower and not worth it for a guard whose job
 * is to stop the obviously-wrong case.
 *
 * CI enforcement is P2-OPS-07 — Next no longer runs ESLint during `next build`,
 * so "the build fails" means the lint step in CI fails.
 */
const PRISMA_READS = "/^find(Many|First|FirstOrThrow|Unique|UniqueOrThrow)$/";

const prismaSelectRule = {
  files: ["src/**/*.{ts,tsx}", "worker/**/*.ts", "tests/**/*.ts"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: `CallExpression[callee.property.name=${PRISMA_READS}]:not(:has(Property[key.name="select"]))`,
        message:
          "Prisma reads must name their fields: pass an explicit `select`. A bare find*() returns every column, so it starts leaking the day a sensitive one is added to the model (Guide §04, P2-OPS-06).",
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prismaSelectRule,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma 7 generated client — machine-written, and its own internals call
    // find*() without a select by definition.
    "src/generated/**",
  ]),
]);

export default eslintConfig;
