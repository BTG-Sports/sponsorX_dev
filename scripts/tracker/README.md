# Tracker notifications

`tracker_sync.py` reads the committed tracker
(`Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`) and:

| Command | When | What |
|---|---|---|
| `notify` | every push to `main` that changes the tracker | Slack: phase progress + the tasks that changed. Sheet: those changes written into the published Google Sheet (Status, dates, Owner, Notes — by task ID; new tasks appended). |
| `digest` | weekdays 9 pm Manila | Slack: phase progress, finished today, waiting in Code review, newly blocked. Sheet: that day's Stage Progress row. |

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
