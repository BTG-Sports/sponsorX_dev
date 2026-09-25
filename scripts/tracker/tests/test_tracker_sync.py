"""Tests for tracker_sync — run with: python -m unittest discover scripts/tracker/tests"""
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import tracker_sync as ts  # noqa: E402


def task(tid, status="Ready", phase="Phase 1", stage=3, owner="", weight=3, done="", title=None):
    return ts.Task(phase=phase, id=tid, stage=stage, title=title or f"Task {tid}", status=status,
                   weight=weight, started="", done=done, owner=owner, notes="",
                   cells=[tid])


def board(*tasks):
    b = {p: {} for p in ts.PHASES}
    for t in tasks:
        b[t.phase][t.id] = t
    return b


class Progress(unittest.TestCase):
    def test_phase_one_includes_next_and_excludes_dropped(self):
        b = board(task("A", "Done"), task("B"), task("N", "Done", stage=9), task("X", "Dropped"))
        p1 = ts.progress(b)[0]
        self.assertEqual((p1.done, p1.total, p1.pct), (2, 3, 67))

    def test_empty_phase_is_zero_not_an_error(self):
        self.assertEqual(ts.progress(board())[1].pct, 0)

    def test_table_names_every_phase_and_the_next_rule(self):
        text = ts.render_progress(board(task("A", "Done")))
        for p in ts.PHASES:
            self.assertIn(p, text)
        self.assertIn("includes SponsorX NEXT", text)


class Diff(unittest.TestCase):
    def test_status_move_new_task_owner_change_and_removal(self):
        old = board(task("A", "Code review", owner="me"), task("B", owner=""), task("C"))
        new = board(task("A", "Done", owner="me"), task("B", owner="rcf"), task("D", phase="Phase 2"))
        kinds = {(c.kind, c.task.id) for c in ts.diff(old, new)}
        self.assertEqual(kinds, {("status", "A"), ("owner", "B"), ("removed", "C"), ("new", "D")})

    def test_no_change_means_nothing_to_post(self):
        b = board(task("A", "Done"))
        self.assertEqual(ts.diff(b, b), [])
        self.assertEqual(ts.render_changes([]), "")

    def test_first_ever_tracker_is_all_new(self):
        self.assertEqual([c.kind for c in ts.diff(None, board(task("A")))], ["new"])

    def test_message_line_reads_like_a_person_wrote_it(self):
        text = ts.render_changes(ts.diff(board(task("A", "Code review", owner="rcfworks")),
                                         board(task("A", "Done", owner="rcfworks"))), "rcfworks")
        self.assertIn("✅ `A` Task A — Code review → *Done* · rcfworks", text)


class Digest(unittest.TestCase):
    def test_finished_review_and_newly_blocked(self):
        before = board(task("A", "In progress"), task("B", "Ready"), task("C", "Blocked"))
        now = board(task("A", "Done", done="2026-09-25"), task("B", "Blocked"), task("C", "Blocked"),
                    task("R", "Code review", owner="HeckerCreatives"))
        text = ts.render_digest(now, before, "2026-09-25")
        self.assertIn("*Finished today (1)*\n• `A`", text)
        self.assertIn("*Waiting in Code review (1)*\n• `R` Task R · HeckerCreatives", text)
        self.assertIn("*Newly blocked (1)*\n• `B`", text)  # C was already blocked

    def test_stage_snapshot_counts_done_per_stage_including_nine(self):
        b = board(task("A", "Done", stage=0, weight=1), task("N", "Done", stage=9, weight=2), task("B", stage=3, weight=5))
        row = ts.stage_snapshot(b, "2026-09-25")
        self.assertEqual(row[0], "2026-09-25")
        self.assertEqual(row[1:11], [1, 0, 0, 0, 0, 0, 0, 0, 0, 1])
        self.assertEqual(row[11:], [2, 5])


class SheetPlan(unittest.TestCase):
    def test_known_ids_update_only_synced_cells_and_new_ids_append(self):
        changes = ts.diff(board(task("A", "Ready")), board(task("A", "Done", done="2026-09-25"), task("Z")))
        updates, appends = ts.sheet_updates(changes, {"Phase 1": ["Order", "ID", "", "", "A"]})
        ranges = sorted(u["range"] for u in updates)
        self.assertEqual(ranges, ["'Phase 1'!I5", "'Phase 1'!K5", "'Phase 1'!L5", "'Phase 1'!M5", "'Phase 1'!R5"])
        self.assertEqual(appends, {"Phase 1": [["Z"]]})

    def test_a_removed_task_is_never_appended(self):
        changes = ts.diff(board(task("A")), board())
        self.assertEqual(ts.sheet_updates(changes, {"Phase 1": []}), ([], {}))


class RealHistory(unittest.TestCase):
    """Against the real committed tracker: the push that closed 11 backend rows."""

    def setUp(self):
        ok = subprocess.run(["git", "cat-file", "-e", "444eb26^{commit}"], capture_output=True).returncode == 0
        if not ok:
            self.skipTest("history not fetched (shallow clone)")

    def test_the_eleven_backend_rows_moved_to_done(self):
        changes = ts.diff(ts.board_at("29ac533"), ts.board_at("444eb26"))
        moved = {c.task.id for c in changes if c.kind == "status" and c.after == "Done"}
        self.assertEqual(len(moved), 11)
        self.assertIn("P8-INT-07", moved)
        self.assertTrue(all(c.before == "Code review" for c in changes))


if __name__ == "__main__":
    unittest.main()
