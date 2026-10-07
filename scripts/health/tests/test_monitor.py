"""Tests for the health monitor — run with: python -m unittest discover scripts/health/tests"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import monitor as m  # noqa: E402

BASE = "https://sponsorx.example"
RUN = "https://github.com/o/r/actions/runs/9"
HEALTHY_BODY = json.dumps({"status": "ok", "checks": {"db": True}})
STALE_BODY = json.dumps({"status": "degraded", "failed": ["backups"], "checks": {}})


def fetcher(web=200, health=(200, HEALTHY_BODY)):
    def fetch(url):
        return health if url.endswith(m.HEALTH_PATH) else (web, "<html>")
    return fetch


class Poster:
    """Records what would have gone to Slack; `works=False` simulates Slack being unreachable."""
    def __init__(self, works=True):
        self.sent, self.works = [], works

    def __call__(self, text):
        self.sent.append(text)
        return self.works


def gh_history(*runs):
    """A fake `gh`: runs are (id, status, {job name: conclusion}), newest first."""
    def gh(args):
        if args[:2] == ["run", "list"]:
            return json.dumps([{"databaseId": rid, "status": st, "conclusion": None} for rid, st, _ in runs])
        if args[:2] == ["run", "view"]:
            jobs = next(j for rid, _, j in runs if str(rid) == args[2])
            return json.dumps({"jobs": [{"name": n, "conclusion": c} for n, c in jobs.items()]})
        raise AssertionError(args)
    return gh


class Checks(unittest.TestCase):
    def test_both_pass(self):
        rs = m.check_environment(BASE + "/", fetcher())
        self.assertEqual([(r.check, r.ok) for r in rs], [("web", True), ("health", True)])
        self.assertEqual(rs[1].url, BASE + "/api/v1/public/health")

    def test_health_must_say_ok_not_just_200(self):
        rs = m.check_environment(BASE, fetcher(health=(200, json.dumps({"status": "degraded"}))))
        self.assertFalse(rs[1].ok)

    def test_degraded_names_what_failed(self):
        rs = m.check_environment(BASE, fetcher(health=(503, STALE_BODY)))
        self.assertEqual(rs[1].detail, "answered 503 degraded — failing: backups")

    def test_healthy_reports_queue_and_error_rate(self):
        body = json.dumps({"status": "ok", "checks": {"queue": {"ok": True, "depth": 3, "oldestWaitMinutes": 1, "failedLast24h": 7}},
                           "traffic": {"windowMinutes": 15, "requests": 120, "status5xx": 2, "rate": 0.0167}})
        rs = m.check_environment(BASE, fetcher(health=(200, body)))
        self.assertTrue(rs[1].ok)
        self.assertEqual(rs[1].detail, "200 ok — queue 3 waiting, oldest 1 min, 7 failed jobs in 24 h · API 5xx 2 of 120 in 15 min")

    def test_queue_failure_says_the_worker_is_not_draining(self):
        body = json.dumps({"status": "degraded", "failed": ["queue"],
                           "checks": {"queue": {"ok": False, "depth": 4, "oldestWaitMinutes": 22, "failedLast24h": 0}},
                           "traffic": {"windowMinutes": 15, "requests": 0, "status5xx": 0, "rate": None}})
        rs = m.check_environment(BASE, fetcher(health=(503, body)))
        self.assertFalse(rs[1].ok)
        self.assertEqual(rs[1].detail, "answered 503 degraded — failing: queue (worker not draining: oldest job waiting 22 min)"
                                       " — queue 4 waiting, oldest 22 min, 0 failed jobs in 24 h · API 5xx 0 of 0 in 15 min")

    def test_no_answer_and_non_json(self):
        rs = m.check_environment(BASE, fetcher(web=0, health=(502, "<html>Bad gateway</html>")))
        self.assertIn("no answer", rs[0].detail)
        self.assertEqual(rs[1].detail, "answered 502")


class Decide(unittest.TestCase):
    def test_transitions(self):
        self.assertEqual(m.decide(m.OK, False), m.ALERT)
        self.assertIsNone(m.decide(m.FAILING, False))
        self.assertEqual(m.decide(m.FAILING, True), m.RECOVER)
        self.assertIsNone(m.decide(m.OK, True))
        self.assertEqual(m.decide(m.UNKNOWN, False), m.ALERT)
        self.assertIsNone(m.decide(m.UNKNOWN, True))


class RunCheck(unittest.TestCase):
    def run_check(self, previous, fetch, post):
        results = m.check_environment(BASE, fetch)
        return m.run_check("production", BASE, previous, results, post, RUN)

    def test_ok_to_fail_posts_an_alert_and_fails_the_job(self):
        post = Poster()
        code = self.run_check(m.OK, fetcher(health=(503, STALE_BODY)), post)
        self.assertEqual(code, 1)
        self.assertEqual(len(post.sent), 1)
        msg = post.sent[0]
        self.assertIn("SponsorX health alert — production", msg)
        self.assertNotIn("[TEST]", msg)
        self.assertIn("failing: backups", msg)
        self.assertIn(RUN, msg)

    def test_fail_to_fail_stays_quiet_and_stays_failing(self):
        post = Poster()
        self.assertEqual(self.run_check(m.FAILING, fetcher(web=502), post), 1)
        self.assertEqual(post.sent, [])

    def test_fail_to_ok_posts_recovery_and_passes(self):
        post = Poster()
        self.assertEqual(self.run_check(m.FAILING, fetcher(), post), 0)
        self.assertEqual(len(post.sent), 1)
        self.assertIn("SponsorX recovered — production", post.sent[0])

    def test_ok_to_ok_is_quiet(self):
        post = Poster()
        self.assertEqual(self.run_check(m.OK, fetcher(), post), 0)
        self.assertEqual(post.sent, [])

    def test_undelivered_alert_leaves_state_ok_so_the_next_run_retries(self):
        self.assertEqual(self.run_check(m.OK, fetcher(web=0), Poster(works=False)), 0)

    def test_undelivered_recovery_leaves_state_failing_so_the_next_run_retries(self):
        self.assertEqual(self.run_check(m.FAILING, fetcher(), Poster(works=False)), 1)

    def test_missing_webhook_always_fails_the_job(self):
        self.assertEqual(self.run_check(m.OK, fetcher(), None), 1)


class PreviousState(unittest.TestCase):
    def test_reads_this_environments_job_in_the_last_earlier_run(self):
        gh = gh_history(
            (30, "in_progress", {}),  # this run
            (29, "completed", {"check (staging)": "failure", "check (production)": "success"}),
        )
        self.assertEqual(m.previous_state("staging", "main", "30", gh), m.FAILING)
        self.assertEqual(m.previous_state("production", "main", "30", gh), m.OK)

    def test_skipped_or_cancelled_says_nothing_and_an_older_run_is_used(self):
        gh = gh_history(
            (30, "in_progress", {}),
            (29, "completed", {"selftest": "failure", "check (production)": "skipped"}),
            (28, "completed", {"check (production)": "cancelled"}),
            (27, "completed", {"check (production)": "failure"}),
        )
        self.assertEqual(m.previous_state("production", "main", "30", gh), m.FAILING)

    def test_no_history_or_unreadable_history_is_unknown(self):
        self.assertEqual(m.previous_state("staging", "main", "1", gh_history((1, "in_progress", {}))), m.UNKNOWN)

        def broken(_args):
            raise RuntimeError("gh: not logged in")
        self.assertEqual(m.previous_state("staging", "main", "1", broken), m.UNKNOWN)


class TestMode(unittest.TestCase):
    def live(self, healthy=True):
        fetch = fetcher() if healthy else fetcher(health=(503, STALE_BODY))
        return {"staging": ("https://staging.example", m.check_environment("https://staging.example", fetch)),
                "production": (BASE, m.check_environment(BASE, fetcher()))}

    def test_posts_a_clearly_marked_test_message_with_the_live_status(self):
        post = Poster()
        self.assertEqual(m.run_test(self.live(healthy=False), post, RUN), 0)
        self.assertEqual(len(post.sent), 1)
        msg = post.sent[0]
        self.assertIn("[TEST] SponsorX health alert", msg)
        self.assertIn("nothing is actually down", msg)
        self.assertIn("staging (https://staging.example): FAILING", msg)
        self.assertIn(f"production ({BASE}): healthy", msg)

    def test_does_not_poison_the_state_for_the_next_scheduled_run(self):
        # A manual test run: its own job is "test alert"; the check jobs in the
        # same run reflect the REAL health. The next scheduled run reads only
        # its check job, so a test leaves "ok" as "ok"...
        gh = gh_history(
            (41, "in_progress", {}),
            (40, "completed", {"selftest": "success", "test alert": "success",
                               "check (staging)": "success", "check (production)": "success"}),
        )
        previous = m.previous_state("production", "main", "41", gh)
        self.assertEqual(previous, m.OK)
        post = Poster()
        self.assertEqual(m.run_check("production", BASE, previous, m.check_environment(BASE, fetcher()), post, RUN), 0)
        self.assertEqual(post.sent, [], "no spurious recovery message after a test")

    def test_a_failed_test_delivery_is_not_read_as_a_failing_environment(self):
        gh = gh_history(
            (41, "in_progress", {}),
            (40, "completed", {"test alert": "failure", "check (production)": "success"}),
        )
        self.assertEqual(m.previous_state("production", "main", "41", gh), m.OK)

    def test_missing_webhook_fails_the_test(self):
        self.assertEqual(m.run_test(self.live(), None, RUN), 1)


class JobNames(unittest.TestCase):
    def test_workflow_job_names_match_what_the_state_reader_looks_for(self):
        # The state reader finds jobs by name and the workflow by file name;
        # renaming either in the YAML alone would silently reset every state.
        path = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".github", "workflows", m.WORKFLOW)
        with open(path, encoding="utf-8") as f:
            text = f.read()
        self.assertIn("name: check (${{ matrix.env }})", text)
        self.assertEqual(m.job_name("staging"), "check (staging)")
        self.assertIn("name: test alert", text)


if __name__ == "__main__":
    unittest.main()
