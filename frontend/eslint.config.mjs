import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

import { prismaSelectFor } from "../eslint.prisma-select.mjs";

/* The Prisma `select` rule lives in one file shared by both workspaces —
   ../eslint.prisma-select.mjs — because it was defined here before the repo
   split and then guarded the wrong half of the repo once Prisma moved to
   backend/. One definition cannot drift from itself. */

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prismaSelectFor(["src/**/*.{ts,tsx}", "tests/**/*.ts"]),
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
