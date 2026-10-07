#!/usr/bin/env python3
"""SponsorX uptime and backup monitor — 2S8-OPS-01.

Run by .github/workflows/health-monitor.yml every 15 minutes, once per
environment. Each run checks one environment's web server:

  GET /                       must answer 200   (the site is up)
  GET /api/v1/public/health   must answer 200 with {"status": "ok"}
                              (web -> API -> Postgres, Redis, storage, and the
                              database's backups no older than 60 minutes)

and posts to Slack only when the state CHANGES:

  previous   now        Slack
  ok         failing    alert, naming what failed and where, with the run link
  failing    failing    nothing (already announced)
  failing    ok         recovery message
  ok         ok         nothing
  unknown    failing    alert (no earlier run to trust: better twice than never)

State is the conclusion of this environment's own job in the most recent
earlier run ("check (staging)" / "check (production)"): success = ok,
failure = failing. A job that was skipped or cancelled says nothing and the
next older run is consulted. Per-environment, so a staging outage left open
for days can never silence a new production one.

Exit status records the state Slack was last TOLD, which is the real state
whenever Slack is reachable. If an alert cannot be delivered, the job exits 0
(state stays "ok") so the next run tries the alert again; if a recovery cannot
be delivered, it exits 1 so the next run tries the recovery again. Either way
an ::error:: annotation says so. A missing SLACK_WEBHOOK_URL is a setup error
and always fails the job, so it shows red rather than silently green.

Test mode (`test-alert`) posts one message headed "[TEST] SponsorX health
alert" so delivery can be proven on demand. It runs in its own job, which the
state reader never looks at, and it reads the real checks only to report them;
so a test can neither create a "failing" state for the next scheduled run nor
hide a real change, which the same run's check jobs still announce as usual.

Standard library only (urllib for Slack); the HTTP checks shell out to curl
for its timeouts and retries; the previous run is read with the `gh` CLI.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Sequence, Tuple

WORKFLOW = "health-monitor.yml"
HEALTH_PATH = "/api/v1/public/health"
TEST_HEADER = "[TEST] SponsorX health alert"
ALERT_HEADER = "SponsorX health alert"

OK, FAILING, UNKNOWN = "ok", "failing", "unknown"
ALERT, RECOVER = "alert", "recover"

# curl: 10 s to connect, 20 s per attempt, 2 retries 5 s apart. --retry covers
# timeouts and the transient HTTP answers (408, 429, 5xx); --retry-all-errors
# adds connection failures such as a refused or reset connection.
CURL = ["curl", "-sS", "--connect-timeout", "10", "--max-time", "20",
        "--retry", "2", "--retry-delay", "5", "--retry-all-errors"]

# (status code, body) — status 0 means no HTTP answer at all.
Fetch = Callable[[str], Tuple[int, str]]
Gh = Callable[[List[str]], str]
Post = Callable[[str], bool]


@dataclass
class Result:
    check: str      # "web" or "health"
    url: str
    ok: bool
    detail: str     # what was seen, for the alert and the job summary


# ── Checks ───────────────────────────────────────────────────────────────────

def curl_fetch(url: str) -> Tuple[int, str]:
    with tempfile.NamedTemporaryFile() as body:
        try:
            p = subprocess.run([*CURL, "-o", body.name, "-w", "%{http_code}", url],
                               capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            return 0, ""
        code = int(p.stdout.strip() or 0) if p.stdout.strip().isdigit() else 0
        with open(body.name, "r", encoding="utf-8", errors="replace") as f:
            return code, f.read(4096)


def describe_health(code: int, body: str) -> Tuple[bool, str]:
    if code == 0:
        return False, "no answer (timeout or connection error, after 2 retries)"
    try:
        doc = json.loads(body)
    except ValueError:
        doc = None
    status = doc.get("status") if isinstance(doc, dict) else None
    if code == 200 and status == "ok":
        return True, "200 ok"
    seen = f"answered {code}" + (f" {status}" if isinstance(status, str) else "")
    failed = doc.get("failed") if isinstance(doc, dict) else None
    if isinstance(failed, list) and failed:
        return False, seen + " — failing: " + ", ".join(str(x) for x in failed)
    return False, seen


def check_environment(base: str, fetch: Fetch) -> List[Result]:
    base = base.rstrip("/")
    results = []

    code, _ = fetch(base + "/")
    if code == 200:
        results.append(Result("web", base + "/", True, "200"))
    else:
        detail = "no answer (timeout or connection error, after 2 retries)" if code == 0 else f"answered {code}"
        results.append(Result("web", base + "/", False, detail))

    code, body = fetch(base + HEALTH_PATH)
    ok, detail = describe_health(code, body)
    results.append(Result("health", base + HEALTH_PATH, ok, detail))
    return results


# ── State ────────────────────────────────────────────────────────────────────

def job_name(env: str) -> str:
    """The workflow's matrix job name for one environment (kept in step with the YAML)."""
    return f"check ({env})"


def previous_state(env: str, branch: str, current_run_id: str, gh: Gh, look_back: int = 10) -> str:
    """This environment's state as the most recent earlier run left it."""
    try:
        runs = json.loads(gh(["run", "list", "--workflow", WORKFLOW, "--branch", branch,
                              "--limit", str(look_back), "--json", "databaseId,status,conclusion"]))
    except Exception as e:  # noqa: BLE001 — any failure to read history means "unknown"
        print(f"::warning::could not list earlier runs ({e}); treating the previous state as unknown")
        return UNKNOWN
    for run in runs:
        rid = str(run.get("databaseId"))
        if rid == str(current_run_id) or run.get("status") != "completed":
            continue
        try:
            jobs = json.loads(gh(["run", "view", rid, "--json", "jobs"])).get("jobs", [])
        except Exception as e:  # noqa: BLE001
            print(f"::warning::could not read run {rid} ({e}); trying an older one")
            continue
        for job in jobs:
            if job.get("name") == job_name(env):
                if job.get("conclusion") == "success":
                    return OK
                if job.get("conclusion") == "failure":
                    return FAILING
                break  # skipped / cancelled: says nothing — look further back
    return UNKNOWN


def decide(previous: str, healthy: bool) -> Optional[str]:
    """Alert only on a change of state."""
    if not healthy:
        return None if previous == FAILING else ALERT
    return RECOVER if previous == FAILING else None


# ── Messages ─────────────────────────────────────────────────────────────────

def alert_text(env: str, base: str, results: Sequence[Result], run_url: str, header: str = ALERT_HEADER) -> str:
    lines = [f":rotating_light: *{header} — {env}* ({base})"]
    lines += [f"• {r.check} `{r.url}`: {r.detail}" for r in results if not r.ok]
    lines.append(f"<{run_url}|Monitor run> · alerts again only after it recovers.")
    return "\n".join(lines)


def recovery_text(env: str, base: str, run_url: str) -> str:
    return (f":white_check_mark: *SponsorX recovered — {env}* ({base}): the site and the "
            f"full health check (API, database, Redis, storage, backups) pass again. <{run_url}|Monitor run>")


def test_text(live: Dict[str, Tuple[str, List[Result]]], run_url: str) -> str:
    simulated = [Result("health", "(simulated)", False, "simulated failure — nothing is actually down")]
    lines = [alert_text("TEST", "no environment", simulated, run_url, header=TEST_HEADER),
             "This is a test of the alert path, sent by hand (simulate_failure=true). Live status right now:"]
    for env, (base, results) in live.items():
        state = "healthy" if all(r.ok for r in results) else "FAILING — " + "; ".join(
            f"{r.check}: {r.detail}" for r in results if not r.ok)
        lines.append(f"• {env} ({base}): {state}")
    return "\n".join(lines)


def slack_poster(webhook: str, attempts: int = 3, pause: float = 5.0) -> Post:
    def post(text: str) -> bool:
        for attempt in range(1, attempts + 1):
            try:
                req = urllib.request.Request(webhook, data=json.dumps({"text": text}).encode(),
                                             headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=20) as r:
                    if r.status < 300:
                        return True
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                print(f"Slack post attempt {attempt} failed: {e.__class__.__name__}")
            if attempt < attempts:
                time.sleep(pause)
        return False
    return post


# ── Commands ─────────────────────────────────────────────────────────────────

def summarise(env: str, results: Sequence[Result]) -> str:
    rows = "\n".join(f"| {env} | {r.check} | `{r.url}` | {'ok' if r.ok else 'FAILING'} | {r.detail} |" for r in results)
    return "| Environment | Check | URL | Result | Detail |\n|---|---|---|---|---|\n" + rows + "\n"


def run_check(env: str, base: str, previous: str, results: List[Result], post: Optional[Post], run_url: str) -> int:
    """Announce a change of state; return the exit status that records the state Slack knows."""
    healthy = all(r.ok for r in results)
    action = decide(previous, healthy)
    print(f"{env}: previous={previous} now={'ok' if healthy else 'failing'} action={action or 'none'}")
    for r in results:
        print(f"  {r.check:<7} {'ok' if r.ok else 'FAILING':<8} {r.url} — {r.detail}")

    if post is None:
        print("::error::SLACK_WEBHOOK_URL is not set — no alert can be sent. Add the repository secret.")
        return 1

    if action == ALERT:
        if post(alert_text(env, base, results, run_url)):
            return 1
        print(f"::error::{env} is FAILING but the Slack alert could not be delivered; "
              "leaving the state 'ok' so the next run sends it again.")
        return 0
    if action == RECOVER:
        if post(recovery_text(env, base, run_url)):
            return 0
        print(f"::error::{env} has recovered but the Slack message could not be delivered; "
              "leaving the state 'failing' so the next run sends it again.")
        return 1
    return 0 if healthy else 1


def run_test(live: Dict[str, Tuple[str, List[Result]]], post: Optional[Post], run_url: str) -> int:
    if post is None:
        print("::error::SLACK_WEBHOOK_URL is not set — the test alert cannot be sent.")
        return 1
    if post(test_text(live, run_url)):
        print("Test alert delivered to Slack.")
        return 0
    print("::error::the test alert could not be delivered to Slack.")
    return 1


def gh_cli(args: List[str]) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True, timeout=60).stdout


def run_url_from_env() -> str:
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    repo = os.environ.get("GITHUB_REPOSITORY", "BTG-Sports/sponsorX_dev")
    return f"{server}/{repo}/actions/runs/{os.environ.get('GITHUB_RUN_ID', '0')}"


def write_summary(text: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(text)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check", help="check one environment and alert on a change of state")
    c.add_argument("--env", required=True)
    c.add_argument("--base", required=True, help="the environment's web origin")
    c.add_argument("--branch", default=os.environ.get("GITHUB_REF_NAME", "main"))
    c.add_argument("--dry-run", action="store_true", help="print the message instead of posting")
    t = sub.add_parser("test-alert", help="post a [TEST] alert with the live status")
    t.add_argument("--target", action="append", required=True, metavar="ENV=URL")
    t.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)

    def show(text: str) -> bool:
        print("---- Slack message (not sent) ----\n" + text)
        return True

    webhook = os.environ.get("SLACK_WEBHOOK_URL") or None
    post: Optional[Post] = show if a.dry_run else (slack_poster(webhook) if webhook else None)

    if a.cmd == "check":
        results = check_environment(a.base, curl_fetch)
        write_summary(summarise(a.env, results))
        previous = previous_state(a.env, a.branch, os.environ.get("GITHUB_RUN_ID", ""), gh_cli)
        return run_check(a.env, a.base.rstrip("/"), previous, results, post, run_url_from_env())

    live = {}
    for target in a.target:
        env, _, base = target.partition("=")
        live[env] = (base.rstrip("/"), check_environment(base, curl_fetch))
    return run_test(live, post, run_url_from_env())


if __name__ == "__main__":
    sys.exit(main())
