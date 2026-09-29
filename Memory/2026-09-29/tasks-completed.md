# 2026-09-29 — tasks completed

## `npm run deploy` — one command for staging and production (rcfworks)

No board task; tooling asked for by the programme owner.

- **What it does.** `scripts/deploy.mjs`, run as `npm run deploy` from the
  repo root. It deploys the latest commit on **GitHub `main`** (never the
  local working tree) to Railway `api` and `web` in **staging**, waits for
  both to succeed, then asks for a typed `yes` before deploying the **same
  commit** to **production**. Flags: `--staging` (staging only),
  `--dry-run` (show, change nothing).
- **How.** The Railway CLI's own login (`railway api`, GraphQL
  `serviceInstanceDeployV2` with `commitSha`), polling `deployment.status`.
  A production deploy held at `NEEDS_APPROVAL` is approved by the script,
  since the typed `yes` is that approval. No new dependency.
- **It does not wait for GitHub's checks** — they are refused while the
  Actions quota is exhausted (see 2026-09-28).
- **Verified.** Dry run resolved both environments; a real `--staging` run
  deployed `e73764a` to staging `api` + `web`, both SUCCESS. Production was
  not deployed by the test — it already ran the same code (`29bda05`; the
  only later change is this log folder's sibling, the 09-28 summary).

## Also noted

- Everything merged on 2026-09-28 was already live in both environments at
  `29bda05` (21:02 Manila).
- **Tracker Slack/Sheet broadcasts are down while GitHub Actions is out of
  minutes.** `Tracker notify` failed on the #111 push (13:02 UTC 09-28) and
  `Tracker digest` failed its 13:12 UTC run. Once billing is fixed or minutes
  reset (1 Oct), re-run both from the Actions tab (`Run workflow`).
