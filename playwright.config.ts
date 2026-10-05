import { defineConfig, devices } from "@playwright/test";

/**
 * E2E harness — P2-QA-01, Guide §09.
 *
 * Vitest owns unit and the authorisation matrix; this owns everything that
 * only fails in a browser. The split matters: the matrix is 305 assertions
 * that must run in a second on every commit, and a Playwright run that takes
 * a minute would either stop being required or stop being fast.
 *
 * IT STARTS THE APP ITSELF. `webServer` builds and serves the web app, so
 * `npm run e2e` works from a clean checkout with nothing already running —
 * which is the difference between a harness the team uses and one only its
 * author can start. CI reuses nothing; locally an already-running dev server
 * is reused so the loop stays fast.
 *
 * ON THE DATABASE. The acceptance says "against a seeded database". The specs
 * below run against fixtures, because Block A's screens are fixture-backed by
 * design and that is what exists to test today. The wiring for a seeded run
 * is here and not hypothetical: set E2E_BASE_URL at an environment whose
 * worker has seeded, and the same specs run against real data. The loop tests
 * that need it — application → approval → ACTIVE — are P3-QA-01's, and they
 * attach to this harness rather than standing up a second one.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
/* The API beside it. E2E_API_PORT moves it off 4000 when that is taken
   (another checkout running its own stack); the specs follow through
   e2e/support/auth.ts. */
const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);
const API_URL = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  /* A failing E2E is usually a real failure, but a flaky one is worse than
     no test: it teaches people to re-run rather than look. One retry in CI
     surfaces genuine flakiness in the report without hiding it. */
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    /* The student portal and the fan pages are phone-first surfaces (NEXT
       spec §9.4, §16). Testing them only at desktop width would miss the
       breakpoint they were designed at. */
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  /* Skipped entirely when E2E_BASE_URL points somewhere already running. */
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: [
          /* An in-memory object store where there is no MinIO (CI's e2e
             job sets E2E_OBJECT_STORE_STANDIN and points S3_ENDPOINT at it).
             The upload steps PUT from the browser and the API then HEADs
             the object, so a stubbed PUT alone cannot pass them. */
          ...(process.env.E2E_OBJECT_STORE_STANDIN
            ? [{
                command: "node e2e/support/object-store-standin.mjs",
                url: `${process.env.S3_ENDPOINT ?? "http://127.0.0.1:9100"}/minio/health/live`,
                reuseExistingServer: !process.env.CI,
                timeout: 30_000,
                stdout: "pipe" as const,
                stderr: "pipe" as const,
              }]
            : []),
          /* The API, when there is a database for it (CI's e2e job, or a
             local run with DATABASE_URL set). The fan-flow specs drive the
             real stack — web → API → Postgres — and skip without it. */
          ...(process.env.DATABASE_URL
            ? [{
                command: "npm run start:api -w @sponsorx/backend",
                url: `${API_URL}/health`,
                reuseExistingServer: !process.env.CI,
                timeout: 120_000,
                stdout: "pipe" as const,
                stderr: "pipe" as const,
                /* APP_URL: where the API sends a browser back to — the
                   stand-in payment provider's pages, email links. Here that
                   is this harness's web app, not the default localhost:3000. */
                env: { PORT: String(API_PORT), APP_URL: process.env.APP_URL ?? BASE_URL },
              }]
            : []),
          {
          /* `next dev`, not `next start`.
             The web app builds with output: 'standalone', and Next says
             plainly that `next start` does not serve that — it wants
             `node .next/standalone/server.js`, which also needs the static
             assets copied beside it. Serving the standalone bundle correctly
             is a packaging concern that the deploy itself exercises; what
             these specs are for is the app's behaviour in a browser.
             Running dev keeps the harness startable from a clean checkout
             with one command, which is the property the acceptance asks for.
             A spec that must see a production build should set E2E_BASE_URL
             at a deployed environment instead. */
          command: `npm run dev -w @sponsorx/frontend -- --port ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: "pipe",
          stderr: "pipe",
          env: { API_URL },
          },
        ],
      }),
});
