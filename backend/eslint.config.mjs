import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

import { prismaSelectFor } from "../eslint.prisma-select.mjs";

/**
 * Lint for the API and the worker — P2-OPS-06.
 *
 * The backend had no linting at all until now, which mattered more than it
 * sounds: after Addendum B moved the API, the worker, Prisma and the whole
 * authorisation layer into this workspace, the entire body of code that talks
 * to the database was unlinted, while the rule meant to guard it sat in the
 * frontend.
 *
 * No Next presets here — this is a plain Node service, not a React app.
 */
export default defineConfig([
  globalIgnores([
    // Prisma 7's generated client: machine-written, and its own internals call
    // find*() without a select by definition. Linting it reports the library
    // rather than our code.
    "src/generated/**",
    "dist/**",
  ]),

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.ts", "worker/**/*.mts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      /* An unused variable in server code is usually a half-finished edit, not
         a style preference. Underscore-prefixed arguments stay allowed because
         Express handlers must accept parameters they do not use — `(err, _req,
         res, _next)` is the signature, not an oversight. */
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  /* The rule this task exists for. Applied to everything that can reach the
     database: the API, the worker, and the tests, which must not model a bad
     query for later code to copy. */
  prismaSelectFor(["src/**/*.ts", "worker/**/*.mts", "tests/**/*.ts"]),
]);
