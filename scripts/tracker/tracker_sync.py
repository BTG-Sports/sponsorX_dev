#!/usr/bin/env python3
"""
SponsorX tracker → Slack and the published Google Sheet.

The committed workbook (`Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`)
stays the working tracker. This script reads two versions of it and:

  notify   — on a push to main: post the phase progress table plus exactly the
             tasks that changed to Slack, and write those changes into the
             published Google Sheet (changed cells only, matched by task ID).
  digest   — weekday evening: post the progress table and the day's recap, and
             append that day's Stage Progress snapshot row to the Sheet.

It never writes to the repository. Phase 1's figure always INCLUDES the
SponsorX NEXT stage (user decision, 2026-09-25); Dropped tasks are excluded
from every total.

Dependencies: openpyxl (reading the workbook) and google-auth (only when the
Sheet sync runs). Slack and the Sheets API are called with the standard
library. Secrets come from the environment:
  SLACK_WEBHOOK_URL, GOOGLE_SA_JSON (the service-account key, as JSON text),
  TRACKER_SHEET_ID (defaults to the published Sheet).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field

TRACKER_PATH = "Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx"
PHASES = ("Phase 1", "Phase 2", "Phase 3", "Phase 4")
HEADER_ROW = 4
DEFAULT_SHEET_ID = "10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0"
MANILA = dt.timezone(dt.timedelta(hours=8))

# Columns (1-based, as in the workbook): what a change is made of.
COL = {"order": 1, "id": 2, "stage": 3, "task": 7, "status": 9, "weight": 10,
       "started": 11, "done": 12, "owner": 13, "notes": 18}
SYNCED = ("status", "started", "done", "owner", "notes")
LETTER = {k: "ABCDEFGHIJKLMNOPQR"[v - 1] for k, v in COL.items()}

ICON = {"Done": "✅", "Code review": "🔎", "In progress": "🔧", "Blocked": "⛔",
        "Ready": "🟢", "Dropped": "✕"}


@dataclass
class Task:
    phase: str
    id: str
    stage: object
    title: str
    status: str
    weight: float
    started: str
    done: str
    owner: str
    notes: str
    cells: list = field(default_factory=list)  # the whole row, A..R, for appends


def _s(v) -> str:
    if v is None:
        return ""
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def load_board(path: str) -> dict[str, dict[str, Task]]:
    import openpyxl  # imported here so the pure helpers test without it

    # read_only keeps the file handle open until close(); Windows then refuses
    # board_at's unlink of the temp file (WinError 32). Linux never noticed.
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        return _read_board(wb)
    finally:
        wb.close()


def _read_board(wb) -> dict[str, dict[str, Task]]:
    board: dict[str, dict[str, Task]] = {}
    for phase in PHASES:
        rows: dict[str, Task] = {}
        for r in wb[phase].iter_rows(min_row=HEADER_ROW + 1, values_only=True):
            if not r or not r[COL["id"] - 1]:
                continue
            g = lambda k: r[COL[k] - 1]  # noqa: E731
            t = Task(
                phase=phase, id=_s(g("id")), stage=g("stage"), title=_s(g("task")),
                status=_s(g("status")), weight=float(g("weight") or 0),
                started=_s(g("started")), done=_s(g("done")), owner=_s(g("owner")),
                notes=_s(g("notes")), cells=[_s(c) for c in r[:18]],
            )
            rows[t.id] = t
        board[phase] = rows
    return board


def board_at(ref: str, repo: str = ".") -> dict[str, dict[str, Task]] | None:
    """The tracker as it was at a git ref, or None if it did not exist there."""
    try:
        blob = subprocess.run(["git", "-C", repo, "show", f"{ref}:{TRACKER_PATH}"],
                              check=True, capture_output=True).stdout
    except subprocess.CalledProcessError:
        return None
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
        f.write(blob)
        path = f.name
    try:
        return load_board(path)
    finally:
        os.unlink(path)


# ── Progress ────────────────────────────────────────────────────────────────

@dataclass
class Progress:
    phase: str
    done: int
    total: int
    days_left: float

    @property
    def pct(self) -> int:
        return round(100 * self.done / self.total) if self.total else 0


def progress(board) -> list[Progress]:
    out = []
    for phase in PHASES:
        live = [t for t in board[phase].values() if t.status != "Dropped"]
        out.append(Progress(
            phase=phase,
            done=sum(t.status == "Done" for t in live),
            total=len(live),
            days_left=sum(t.weight for t in live if t.status != "Done"),
        ))
    return out


def bar(pct: int, width: int = 20) -> str:
    filled = round(width * pct / 100)
    return "▓" * filled + "░" * (width - filled)


def render_progress(board) -> str:
    lines = [f"{p.phase}  {bar(p.pct)}  {p.pct:>3}%  {p.done:>3}/{p.total:<3}" for p in progress(board)]
    return "*📊 SponsorX progress*\n```\n" + "\n".join(lines) + "\n```\n_Phase 1 includes SponsorX NEXT._"


# ── Changes ─────────────────────────────────────────────────────────────────

@dataclass
class Change:
    kind: str  # "status" | "new" | "owner" | "removed"
    task: Task
    before: str = ""
    after: str = ""


def diff(old, new) -> list[Change]:
    changes: list[Change] = []
    for phase in PHASES:
        o, n = (old or {}).get(phase, {}), new.get(phase, {})
        for tid, t in n.items():
            if tid not in o:
                changes.append(Change("new", t, after=t.status))
                continue
            prev = o[tid]
            if prev.status != t.status:
                changes.append(Change("status", t, prev.status, t.status))
            elif prev.owner != t.owner and t.owner:
                changes.append(Change("owner", t, prev.owner, t.owner))
        for tid, t in o.items():
            if tid not in n:
                changes.append(Change("removed", t, before=t.status))
    return changes


def render_changes(changes: list[Change], author: str = "") -> str:
    if not changes:
        return ""
    head = f"*What changed*{f' ({author})' if author else ''}"
    lines = []
    for c in changes:
        t = c.task
        title = (t.title[:48] + "…") if len(t.title) > 49 else t.title
        who = f" · {t.owner}" if t.owner else ""
        if c.kind == "status":
            lines.append(f"{ICON.get(c.after, '•')} `{t.id}` {title} — {c.before} → *{c.after}*{who}")
        elif c.kind == "new":
            lines.append(f"➕ `{t.id}` {title} — new task, {c.after} ({t.phase})")
        elif c.kind == "owner":
            lines.append(f"👤 `{t.id}` {title} — owner {c.before or '—'} → {c.after}")
        else:
            lines.append(f"➖ `{t.id}` {title} — removed from the board")
    return head + "\n" + "\n".join(lines)


def render_digest(now_board, day_ago_board, today: str) -> str:
    finished = [t for p in PHASES for t in now_board[p].values() if t.status == "Done" and t.done == today]
    review = [t for p in PHASES for t in now_board[p].values() if t.status == "Code review"]
    was = {t.id: t.status for p in PHASES for t in (day_ago_board or {}).get(p, {}).values()}
    newly_blocked = [t for p in PHASES for t in now_board[p].values()
                     if t.status == "Blocked" and was.get(t.id) not in (None, "Blocked")]
    p1 = progress(now_board)[0]

    def lst(ts, show_owner=True):
        return "\n".join(f"• `{t.id}` {t.title[:56]}" + (f" · {t.owner}" if show_owner and t.owner else "") for t in ts) or "• none"

    # Everything that moved since the last broadcast — the evening post is the
    # day's only Slack message, so it carries every change, not just the totals.
    if day_ago_board is None:
        changes = "*What changed*\n• no earlier tracker to compare with"
    else:
        changes = render_changes(diff(day_ago_board, now_board)) or "*What changed*\n• no task changes today"
    return "\n\n".join([
        render_progress(now_board),
        changes,
        f"*Finished today ({len(finished)})*\n{lst(finished)}",
        f"*Waiting in Code review ({len(review)})*\n{lst(review)}",
        f"*Newly blocked ({len(newly_blocked)})*\n{lst(newly_blocked, False)}",
        f"_Phase 1: {p1.days_left:g} estimated days of work left._",
    ])


SNAPSHOT_HEADER = ["Date", "S0", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "Done", "Days left"]


def stage_snapshot(board, today: str) -> list:
    """The Stage Progress snapshot row: Date, S0..S9 done, Done, Days left."""
    rows = list(board["Phase 1"].values())
    per = [sum(1 for t in rows if t.status == "Done" and str(t.stage) == str(s)) for s in range(10)]
    done = sum(per)
    left = sum(t.weight for t in rows if t.status != "Done")
    return [today, *per, done, left]


# ── Outputs ─────────────────────────────────────────────────────────────────

def post_slack(text: str, webhook: str | None, dry_run: bool) -> None:
    if dry_run or not webhook:
        print("---- Slack message (not sent) ----\n" + text + "\n---------------------------------")
        return
    req = urllib.request.Request(webhook, data=json.dumps({"text": text}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        if r.status >= 300:
            raise RuntimeError(f"Slack answered {r.status}")


class AppsScriptSheet:
    """The published Sheet through its own Apps Script endpoint
    (scripts/tracker/sheet-endpoint.gs) — no service-account key, which the
    organisation policy disables. Same three operations as `Sheet`."""

    def __init__(self, url: str, secret: str):
        self.url, self.secret = url, secret

    # Seconds to wait before each retry. Apps Script now and then answers with
    # an HTML error page instead of JSON — seen 2026-09-25, gone on rerun —
    # and a rerun re-posts the Slack message, so the job retries by itself.
    RETRY_DELAYS = (5, 20)

    def _post(self, payload: dict, retry: bool = True) -> dict:
        req = urllib.request.Request(self.url, data=json.dumps({"secret": self.secret, **payload}).encode(),
                                     headers={"Content-Type": "application/json"})
        delays = self.RETRY_DELAYS if retry else ()
        for attempt in range(len(delays) + 1):
            try:
                with urllib.request.urlopen(req, timeout=300) as r:  # Apps Script answers via a redirect
                    body = r.read()
                out = json.loads(body or b"{}")
                break
            except (json.JSONDecodeError, urllib.error.URLError, TimeoutError) as e:
                if attempt == len(delays):
                    raise RuntimeError(f"Sheet endpoint unavailable after {attempt + 1} attempt(s): {e}") from e
                print(f"Sheet endpoint hiccup ({e}); retrying in {delays[attempt]}s")
                time.sleep(delays[attempt])
        if "error" in out:
            raise RuntimeError(f"Sheet endpoint refused: {out['error']}")
        return out

    def column(self, tab: str, letter: str) -> list[str]:
        return self._post({"op": "column", "tab": tab, "letter": letter}).get("values", [])

    def batch_update(self, data: list[dict]) -> None:
        # Apps Script writes cell by cell; chunks keep each request well inside
        # its execution limit.
        for i in range(0, len(data), 250):
            self._post({"op": "update", "data": data[i:i + 250]})

    def append(self, tab: str, rows: list[list], header: list | None = None) -> None:
        if rows:
            # Not retried: an append whose reply was lost may already have
            # landed, and a retry would add the rows twice. Reads and cell
            # updates are safe to repeat.
            self._post({"op": "append", "tab": tab, "rows": rows, **({"header": header} if header else {})},
                       retry=False)


def open_sheet():
    """The Sheet writer this environment is configured for, or None."""
    url, secret = os.environ.get("SHEET_ENDPOINT_URL"), os.environ.get("SHEET_ENDPOINT_SECRET")
    if url and secret:
        return AppsScriptSheet(url, secret)
    sa = os.environ.get("GOOGLE_SA_JSON")
    if sa:
        return Sheet(sa, os.environ.get("TRACKER_SHEET_ID") or DEFAULT_SHEET_ID)
    return None


class Sheet:
    """The published Google Sheet, through the Sheets REST API."""

    def __init__(self, sa_json: str, sheet_id: str):
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request

        creds = service_account.Credentials.from_service_account_info(
            json.loads(sa_json), scopes=["https://www.googleapis.com/auth/spreadsheets"])
        creds.refresh(Request())
        self.token = creds.token
        self.base = f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}"

    def _call(self, method: str, path: str, body=None):
        req = urllib.request.Request(self.base + path, method=method,
                                     data=json.dumps(body).encode() if body is not None else None,
                                     headers={"Authorization": f"Bearer {self.token}",
                                              "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")

    def column(self, tab: str, letter: str) -> list[str]:
        rng = urllib.parse.quote(f"'{tab}'!{letter}:{letter}")
        values = self._call("GET", f"/values/{rng}").get("values", [])
        return [(v[0] if v else "") for v in values]

    def batch_update(self, data: list[dict]) -> None:
        if data:
            self._call("POST", "/values:batchUpdate", {"valueInputOption": "USER_ENTERED", "data": data})

    def append(self, tab: str, rows: list[list], header: list | None = None) -> None:
        if rows:
            rng = urllib.parse.quote(f"'{tab}'!A1")
            self._call("POST", f"/values/{rng}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
                       {"values": rows})


def sheet_updates(changes: list[Change], ids_by_tab: dict[str, list[str]]):
    """Plan the Sheet writes: changed cells for known IDs, appends for new ones."""
    updates, appends = [], {}
    for c in changes:
        t = c.task
        ids = ids_by_tab.get(t.phase, [])
        if t.id in ids:
            row = ids.index(t.id) + 1  # 1-based sheet row
            for k in SYNCED:
                updates.append({"range": f"'{t.phase}'!{LETTER[k]}{row}", "values": [[getattr(t, k)]]})
        elif c.kind != "removed":
            appends.setdefault(t.phase, []).append(t.cells)
    return updates, appends


def sync_sheet(changes: list[Change], dry_run: bool) -> None:
    # Every changed task gets its synced columns rewritten — a status move often
    # comes with a date and a note, and rewriting the five cells is idempotent.
    sheet = None if dry_run else open_sheet()
    if sheet is None:
        print(f"---- Sheet sync (not written): {len(changes)} task(s) would be updated ----")
        return
    ids = {p: sheet.column(p, LETTER["id"]) for p in {c.task.phase for c in changes}}
    updates, appends = sheet_updates(changes, ids)
    sheet.batch_update(updates)
    for tab, rows in appends.items():
        sheet.append(tab, rows)
    print(f"Sheet: {len(updates)} cell(s) updated, {sum(len(r) for r in appends.values())} row(s) added.")


# ── Commands ────────────────────────────────────────────────────────────────

def cmd_notify(a) -> int:
    new = board_at(a.after)
    if new is None:
        print("No tracker at", a.after)
        return 0
    # A manual run, or the very first push, has no usable "before": compare
    # with the previous commit rather than announcing every task as new.
    before = a.before if a.before and set(a.before) != {"0"} else f"{a.after}~1"
    old = board_at(before)
    changes = diff(old, new)
    if not changes:
        print("No task changes in this push — nothing to post.")
        return 0
    if a.no_slack:
        print(f"{len(changes)} task change(s) — Sheet only; Slack hears about them in the 8 pm digest.")
    else:
        text = render_progress(new) + "\n\n" + render_changes(changes, a.author)
        post_slack(text, os.environ.get("SLACK_WEBHOOK_URL"), a.dry_run)
    sync_sheet(changes, a.dry_run)
    return 0


def ref_before(ref: str, since: str) -> str:
    """The last commit on `ref` older than `since` ("24 hours ago"), or "" if none."""
    return subprocess.run(["git", "rev-list", "-1", f"--before={since}", ref],
                          capture_output=True, text=True).stdout.strip()


def cmd_digest(a) -> int:
    today = a.date or dt.datetime.now(MANILA).strftime("%Y-%m-%d")
    now = board_at(a.ref)
    since = ref_before(a.ref, a.since)
    day_ago = board_at(since) if since else None
    # Each merge to main that changes tasks is announced as it lands
    # (tracker-notify.yml). The 8 pm post is for the days with none: when
    # tasks changed in the window, Slack has already heard, so it stays quiet.
    # The Stage Progress row below is appended every day either way.
    if a.skip_if_announced and day_ago is not None and diff(day_ago, now):
        print("Task changes reached main in the window and were announced as they merged — no 8 pm Slack post.")
    else:
        post_slack(render_digest(now, day_ago, today), os.environ.get("SLACK_WEBHOOK_URL"), a.dry_run)
    row = stage_snapshot(now, today)
    sheet = None if a.dry_run else open_sheet()
    if sheet is None:
        print("---- Stage Progress row (not written) ----\n", row)
    else:
        try:
            dates = sheet.column("Stage Progress", "A")
        except RuntimeError:
            dates = []  # the tab does not exist yet; the append creates it
        if today in dates:
            print("Stage Progress already has a row for", today)
        else:
            sheet.append("Stage Progress", [row], header=SNAPSHOT_HEADER)
            print("Stage Progress row appended:", row)
    return 0


def cmd_sync_all(a) -> int:
    """One-off: bring the Sheet level with the tracker — every task's synced
    cells rewritten, missing tasks appended. Afterwards `notify` keeps it level."""
    board = board_at(a.ref)
    changes = [Change("status", t, t.status, t.status) for p in PHASES for t in board[p].values()]
    sync_sheet(changes, a.dry_run)
    return 0


def main(argv=None) -> int:
    # The messages carry emoji; a Windows console defaults to cp1252 and would
    # crash on the first print. UTF-8 is what CI already uses.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("notify", help="post the changes between two commits")
    n.add_argument("--before", default="")
    n.add_argument("--after", default="HEAD")
    n.add_argument("--author", default="")
    n.add_argument("--dry-run", action="store_true")
    n.add_argument("--no-slack", action="store_true", help="update the Sheet only; the 8 pm digest posts to Slack")
    d = sub.add_parser("digest", help="post the daily recap and append the snapshot row")
    d.add_argument("--ref", default="HEAD")
    d.add_argument("--since", default="24 hours ago")
    d.add_argument("--date", default="")
    d.add_argument("--dry-run", action="store_true")
    d.add_argument("--skip-if-announced", action="store_true",
                   help="skip the Slack post when tasks changed on main in the window (each merge was announced)")
    f = sub.add_parser("sync-all", help="one-off: bring the Sheet level with the tracker")
    f.add_argument("--ref", default="HEAD")
    f.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    return {"notify": cmd_notify, "digest": cmd_digest, "sync-all": cmd_sync_all}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
