---
mode: agent
description: Report verified project status, blockers, and the next approved action from reports evidence.
---

# Project Status

Report the current state of this project from evidence, not from memory.

1. Read `reports/project-handoff.json`, `reports/current-execution-state.json`, and the most recent entries in `reports/execution-log.jsonl` when present.
2. Read the latest audit, review, and readiness reports in `reports/`.
3. Summarize:
   - Last completed work and the artifact proving it.
   - Work in progress and where it stopped.
   - Open blockers, each with an owner or the decision required.
   - Open approval gates awaiting the user.
   - The single next approved action.
4. Flag any report that is stale relative to the working tree.

State explicitly when an artifact is missing rather than inferring status. Do not modify any report; refresh continuity through the `project-handoff` skill.
