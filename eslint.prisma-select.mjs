/**
 * P2-OPS-06 — fail on any Prisma read that does not name the fields it wants.
 *
 * Guide §04: row scoping is the easy half of authorisation. The leak is a query
 * that returns a field the caller must never see — `AthleteRate.amount` on a
 * sponsor-facing screen, `Campaign.budget` on an athlete one. A bare
 * `findMany()` returns every scalar column on the model, so today's safe query
 * silently starts leaking the moment a sensitive column is added to the schema.
 *
 * Requiring an explicit `select` makes that impossible by construction: adding a
 * column can never widen an existing query's result.
 *
 * This is a syntactic check, so it is deliberately blunt — it looks for a
 * `select` anywhere in the call's arguments. That accepts a nested `select`
 * inside an `include`, which is the correct call to make: the alternative is
 * type-aware linting, far slower, and not worth it for a guard whose job is to
 * stop the obviously-wrong case.
 *
 * SHARED BETWEEN BOTH WORKSPACES, and that is the point. This rule was written
 * in `frontend/eslint.config.mjs` before the repo split. Authorisation and every
 * Prisma query then moved to `backend/` (Addendum B), which left the rule
 * guarding the workspace that no longer queries the database and absent from the
 * one that does. Keeping one definition here means the next move cannot
 * silently drop it, and the two copies cannot drift apart.
 *
 * "The build fails" in the task's acceptance means the CI lint step fails
 * (P2-OPS-07) — Next no longer runs ESLint during `next build`.
 */

const PRISMA_READS = "/^find(Many|First|FirstOrThrow|Unique|UniqueOrThrow)$/";

export const prismaSelectRule = {
  "no-restricted-syntax": [
    "error",
    {
      selector: `CallExpression[callee.property.name=${PRISMA_READS}]:not(:has(Property[key.name="select"]))`,
      message:
        "Prisma reads must name their fields: pass an explicit `select`. A bare find*() returns every column, so it starts leaking the day a sensitive one is added to the model (Guide §04, P2-OPS-06).",
    },
  ],
};

/** Paths where the rule applies, per workspace. The generated Prisma client is
 *  excluded by each config's ignore list, not here — its own internals call
 *  find*() without a select by definition. */
export const prismaSelectFor = (files) => ({ files, rules: prismaSelectRule });
