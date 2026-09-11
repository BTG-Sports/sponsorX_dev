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

## Task-board rule (single source of truth)

> **After completing any task or fix, update the task board spreadsheet in Google
> Drive before closing your branch.** Set `Status`, `Date Done` and `Owner` on that
> task's row. Marking a task **Done** is what flips everything depending on it from
> Blocked to Ready — leave it and your teammate has no way to know the work is
> available. Put the task ID (e.g. `P2-BE-04`) in the branch name and commit message
> so the row and the code can be matched later.

**Where each thing lives — do not let these drift:**

| Artefact | Owns | Edited |
|---|---|---|
| `documentation/SponsorX-Phase1-Development-Plan.md` | The **plan** — 184 task definitions, details, acceptance criteria, dependencies, gates, risks | Via pull request, reviewed like code |
| Google Sheet *SponsorX — Phase 1 Task Board* (Google Drive) | The **status** — Status, Owner, Weight, Date Started, Date Done, Notes | Directly in the browser, by any developer, from any workstation |

**No spreadsheet is committed to this repository.** A committed `.xlsx` goes stale
the moment someone edits the Sheet, and a binary cannot be reviewed in a diff.
`*.xlsx` under `documentation/` is gitignored for that reason. Need a spreadsheet
copy? Export it from the Sheet.

If a task's *definition* turns out to be wrong, change it in the Markdown via a pull
request — and note it in the Sheet's Notes column so the other person sees why.

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
