# Repository Instructions

## Engagement protocol (mandatory, highest precedence)

Apply this to every new user prompt, without exception, before any analysis, tool use, file change, or answer.

1. Run `clarify-the-ask`.
2. Ask exactly three clarifying questions.
3. Wait for the user's answers. Do not begin work while any question is unanswered.
4. After the third answer, state back the objective, the concrete steps, the files or systems that will be touched, and any risk or irreversible action.
5. Ask the user to confirm, and wait for an explicit instruction to proceed.

- This repeats for every new prompt, including follow-ups later in the same session.
- Ground the three questions in repository evidence; ask about intent, scope, constraints, and acceptance criteria rather than facts the repository already answers.
- Never treat your own plan description as approval.
- Never proceed merely because three questions were asked; unresolved material ambiguity still blocks.
- The only exception is an explicit instruction in the current prompt to skip clarification,
  including the exact `--proceed` token.

## Orchestration

Use `.github/skills/project-skills-orchestrator/SKILL.md` for project orchestration. Audit existing project state, inventory available skills, plan before execution, preserve repository-owned skills, and stop at approval gates.

- Inspect `reports/current-work-state.json` and `reports/project-handoff.json` when present.
- Treat machine-readable artifacts in `reports/` as authoritative.
- Never rewrite accepted records in `reports/execution-log.jsonl`.

## Repository standards

- The skill catalog, `config/profiles.yaml`, `schemas/`, and `templates/project/` are contract surfaces. Changing any of them requires updating `tests/skill-contracts.test.mjs`.
- Every skill contract carries all twelve required sections and a distinct trigger description.
- Skill dependencies must stay acyclic and every conformance profile must remain dependency-closed.
- Templates under `templates/project/` are shipped to generated and adopted projects. Keep them free of secrets, tenant identifiers, and unpinned GitHub Actions.
- Run `npm run check` before declaring implementation work complete.

## Approval gates

Require explicit approval before destructive changes, external publication, deployment, remote mutation, commits, and pushes.
