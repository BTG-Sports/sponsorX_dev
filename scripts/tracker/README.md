# Tracker notifications

`tracker_sync.py` reads the committed tracker
(`Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`) and:

| Command | When | What |
|---|---|---|
| `notify --no-slack` | every push to `main` that changes the tracker, as often as that happens | Sheet only: the changes written into the published Google Sheet (Status, dates, Owner, Notes — by task ID; new tasks appended). Nothing is posted to Slack. |
| `digest` | every day, 8 pm Manila — **the day's only Slack post** | Slack: phase progress, every task change since the previous evening, finished today, waiting in Code review, newly blocked. Sheet: that day's Stage Progress row. |

Since 2026-10-01 Slack hears about the tracker once a day, from the digest; the
Sheet is still updated on every change. `notify` without `--no-slack` posts
the change straight away, as before.

Phase 1's figure always includes SponsorX NEXT; Dropped tasks are excluded.
It never writes to the repository.

**Secrets** (GitHub → Settings → Secrets → Actions): `SLACK_WEBHOOK_URL`,
`SHEET_ENDPOINT_URL` and `SHEET_ENDPOINT_SECRET` — the Sheet's own Apps Script
web app (`sheet-endpoint.gs`), used because the organisation policy disables
service-account keys.

**Workflows**: `.github/workflows/tracker-notify.yml` and `tracker-digest.yml`.

**Try it locally** (prints instead of sending):

```bash
python scripts/tracker/tracker_sync.py notify --before <old-sha> --after <new-sha> --dry-run
python scripts/tracker/tracker_sync.py digest --dry-run
python -m unittest discover scripts/tracker/tests
```

**Send it for real from your machine** (when Actions can't run — e.g. out of
minutes). Works on Windows too. Needs `pip install openpyxl==3.1.5` (in a
throwaway venv) and the three secrets exported. Use the push's real
`before`/`after` SHAs: a manual `Run workflow` compares against `after~1`, which
after a merge commit is often the same board and posts nothing.

```bash
export SLACK_WEBHOOK_URL=… SHEET_ENDPOINT_URL=… SHEET_ENDPOINT_SECRET=…
python scripts/tracker/tracker_sync.py notify --before <old-sha> --after <new-sha> --author "<you>"
python scripts/tracker/tracker_sync.py digest
```
