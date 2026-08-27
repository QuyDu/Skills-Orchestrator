---
mode: agent
description: Start a new project by turning its confirmed blueprint into an ordered, governed development plan.
---

# Project Start

Use this as the primary entry point for a new project or a project that has not yet established its development foundation.

## Required process

1. Ask for and record the exact project name before any Azure discovery or deployment decision. Preserve it in the project blueprint.
2. Normalize that name for Azure resource naming. Derive the resource group as `rg-<normalized-project-name>` and derive every child resource with the shared Azure naming function.
3. Read `docs/PROJECT-BRIEF.md`, `docs/PROJECT-BLUEPRINT.json`, the current project handoff, and the skill inventory when present.
4. Run `/clarify-the-ask` unless the user supplied the exact `--proceed` token and no material ambiguity remains.
5. Run `/project-blueprint` to establish or validate purpose, project type, stack, delivery target, quality requirements, assumptions, and acceptance criteria.
6. Ask whether to run `/azure-discovery` or use approved default service settings. If discovery runs, use the project name and target cloud/region to determine available services.
7. Run `/architecture-review` for the proposed design and `/development-environment-readiness` for the selected local environment.
8. Use `/workflow-planner` to produce the first ordered implementation plan.
9. Stop for explicit confirmation before writing application code, changing infrastructure, using privileged access, deploying, or performing any other gated action.
10. Record the approved next action with `/project-handoff`.

## Completion evidence

- Blueprint is present and schema-valid.
- Architecture and environment readiness results are available or explicitly blocked.
- The first implementation plan names its owner, inputs, outputs, dependencies, acceptance criteria, and rollback route.
- No credentials, tokens, connection strings, or secret values are added.
