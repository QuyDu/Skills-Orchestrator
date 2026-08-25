---
mode: agent
description: Summarize the authoritative project state and identify the next governed action.
---

# Project Status

Use this prompt when you need to know what is complete, blocked, stale, or next.

## Required process

1. Read `reports/current-execution-state.json`, `reports/project-handoff.json`, the project manifest, and the blueprint when present.
2. Read authoritative JSON reports before derived Markdown views.
3. Check for stale or missing Azure discovery, clarification, validation, security, architecture, deployment, adoption, and recovery evidence.
4. Identify pending approvals, blocked steps, unresolved findings, and the exact owner of each next action.
5. Report the current lifecycle position, evidence freshness, risks, and one recommended next action.
6. Do not mutate source, infrastructure, external systems, or workflow state while reporting status.

## Completion evidence

- Status is based on current authoritative artifacts, not memory or a previous successful run.
- Missing artifacts are reported as missing.
- Stale evidence includes its timestamp and refresh recommendation.
- Blocked and approval-wait states are not reported as complete.
