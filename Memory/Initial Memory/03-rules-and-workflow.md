# Rules & Working Workflow

## Memory-backup rule (the one that created this folder)
> After completing **any task** on SponsorX, update memory and back it up into this `Memory/` folder, under a subfolder named for the **date the task was done** (`YYYY-MM-DD`). If that dated subfolder doesn't exist, create it first. Keep `Memory/Initial Memory/` as the baseline snapshot of all project knowledge and rules.

This rule is also stored in Claude's persistent memory as `memory-backup-workflow`.

## Always-use-graphify rule
> This repo carries a persistent knowledge graph in `graphify-out/`. **Always use
> graphify first** for any question about the codebase, its architecture, file
> relationships, or project content — treat the request as a graphify query
> before grep/read/manual exploration. Invoke the `graphify` skill (`/graphify`)
> at the start of such tasks; fall back to direct file tools only when graphify
> can't answer. Re-run graphify ingestion after material changes.

This rule is also recorded in the project `CLAUDE.md` ("Always use graphify").

## Task-board rule (three artefacts, one daily habit)

The programme is 344 tasks across the blueprint's four phases.

| Artefact | Owns | Changes | Who touches it |
|---|---|---|---|
| `documentation/SponsorX-Phase{1..4}-*.md` | The **plan** — task definitions, plain-English detail, acceptance criteria, gates | Only when scope or a task's meaning changes | Anyone, by pull request, reviewed like code |
| `documentation/SponsorX-Full-Programme-Task-Board.xlsx` | The **working tracker** — all four phases in one file | Continuously, during the day | Every developer as they work |
| Google Sheet [SponsorXFullProgrammeTaskBoard](https://docs.google.com/spreadsheets/d/10PGtZb3jGBBHhbNOWwl__hS0b_HKN7EL0KRHrnSVoI0/) | The **published status** | Once a day, at end of day | Whoever worked that day |

> **During the day:** tag your task **In progress** in the consolidated **xlsx**. Set `Owner`
> and `Date Started`. Move to `Code review`, then `Done`, as it advances.
>
> **At end of day:** whatever state your tasks are in — finished, half-done, blocked,
> untouched — **update the Google Sheet to match.** That is the copy other people read.
> A task left `Blocked` in the Sheet when you have actually finished it is a teammate sitting
> idle tomorrow for no reason.
>
> **Reference the task ID** (e.g. `2S5-BE-04`) in the branch name and commit message.

Task IDs: Phase 1 uses `P{stage}-{CAT}-{nn}`; Phases 2–4 use `{phase}S{sprint}-{CAT}-{nn}`.

If a task's *definition* is wrong, fix it in the Markdown by pull request — do not quietly
reinterpret it in the tracker.

**No spreadsheet is committed.** `documentation/*.xlsx` is gitignored: a committed binary goes
stale against the Sheet the moment anyone edits it, and cannot be reviewed in a diff.

## Current working mode
- **No coding yet. No implementation/sprint plans yet.** The user is in a planning + understanding phase.
- Deliverables are **documentation** (editable Word docs generated via python-docx) and **discussion / plain-English explanations**.
- Do not scaffold projects or write code until the user explicitly asks.
- Prefer concrete real-world examples when explaining (they land well — e.g. the Maria + Tony's Pizza story).

## Project conventions established
- Documentation deliverables live under `Documentation/` in themed subfolders (`Architecture/`, `Overview/`).
- Word docs use the SponsorX brand styling (purple `#6D34FF` headings, Calibri body, tables, ASCII diagrams).
- Mockups are visual reference only — we may design our own UI while referencing them.

## Global user context (from CLAUDE.md)
- User email: creativebrainstudiosinc@gmail.com.
- `/graphify` skill available for knowledge-graph tasks.
- Environment: Windows 11, PowerShell primary shell. Project **is** a git repo (branch `main`).
