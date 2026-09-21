# 2026-09-21 — tasks completed

## Board repair — seven of Jan's rows were lost in a binary conflict

The task board is a committed `.xlsx`, so git cannot merge it. On 2026-09-21 two
copies diverged and the conflict was resolved by discarding, which meant one
side's work vanished silently.

**The two versions were disjoint**, which is what made it dangerous:

| | `c4e614d` (HeckerCreatives) | `e1cd205` (rcfworks, HEAD) |
|---|---|---|
| Rows | 195 — `P1-FE-09` … `P1-FE-15` present | 188 — all seven missing |
| The 2026-09-18 backend work | absent — every row Blocked, no notes, 9 Done | intact — 42 Done, full notes |

Jan had been editing a stale copy, so their file never carried the Railway,
Prisma, outbox or audit updates; the discard then kept mine and dropped their
seven rows. Neither file was correct on its own.

**Resolved the way CLAUDE.md says to** — do not resolve by discarding theirs.
Took the richer HEAD board and grafted Jan's seven rows back in at their original
orders (33.9 – 33.996), owner `HeckerCreatives`, status `Code review` preserved.
195 rows, no duplicates, 77 formulas byte-identical, and the autofilter, Status
validation and three conditional-formatting ranges all extended 193 → 200.

**The lesson for a binary tracker:** a conflict on it is not a merge, it is a
choice between two files, and the losing side disappears without a diff to review.
Check the row count and the ID set on both sides before resolving — a version with
*fewer* rows is the tell.

**Still open:** `P1-FE-09` … `P1-FE-15` exist on the board but have no entries in
`documentation/SponsorX-Phase1-Managed-Marketplace.md`. The plan document owns
task definitions, so those seven need writing by whoever did the work.
