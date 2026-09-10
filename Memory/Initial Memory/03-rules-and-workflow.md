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
