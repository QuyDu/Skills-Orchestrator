# Project Instructions

These instructions are always in context. Keep them accurate; stale instructions are worse than none.

Sections wrapped in `pso:begin` / `pso:end` markers are managed by Project Skills Orchestrator and are replaced on update. Edit freely outside those markers.

<!-- pso:begin id=clarification-protocol version=1 -->
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
- The only exception is an explicit instruction in the current prompt to skip clarification, including the exact `--proceed` token.
<!-- pso:end id=clarification-protocol -->

<!-- pso:begin id=orchestration-routing version=1 -->
## Orchestration

Use `.github/skills/project-skills-orchestrator/SKILL.md` for project orchestration. Audit existing project state, inventory available skills, plan before execution, preserve repository-owned skills, and stop at approval gates.
<!-- pso:end id=orchestration-routing -->

- Machine-readable artifacts under `reports/` are authoritative. Markdown views are derived.
- Never rewrite accepted records in `reports/execution-log.jsonl`.

## Startup continuity and Azure discovery

At the beginning of work, read `reports/project-handoff.json` before planning or changing files. If
it does not exist, create an initial handoff through `/project-handoff`. After understanding the
handoff, read `reports/azure-discovery.md` and `reports/azure-discovery.json`. If discovery is
missing, ask whether the user wants to run `/Azure Discovery`. If its recorded `discoveredAt`
timestamp is more than 14 days old, ask whether the user wants to rerun it. Continue with a warning
when the user declines and record that decision in the next handoff.

`/Azure Discovery` accepts `-Commercial` or `-Gov`. If neither is supplied, ask the user to choose
`1. Commercial` or `2. Gov`; accept only `1` or `2`, retry three invalid responses, then report an
error and exit. To explicitly bypass the normal clarification round, append the exact token
`--proceed` to the prompt. This is a user instruction to proceed with reasonable defaults,
not permission for destructive, external, privileged, irreversible, commit, or push actions.

## Project purpose

<!-- Replace: one paragraph describing what this system does and who uses it. -->

## Architecture overview

<!-- Replace: components, boundaries, data flow, external dependencies, and hosting model. -->

Record every significant architectural decision as an ADR in `docs/adr/` using `/create-adr`. Do not change a documented decision without superseding its ADR.

## Coding standards

- Prefer clarity over cleverness. Small, single-responsibility units.
- No dead code, commented-out code, unused imports, or speculative abstractions.
- Handle errors at system boundaries; do not swallow exceptions.
- Dispose or release every acquired resource deterministically.
- Comments explain *why*, never *what*. One line where one line will do.

## Naming standards

- Names describe intent, not type or implementation.
- Azure resources follow the documented naming convention and are tagged with owner, environment, and cost center.
- Files and directories use lowercase-kebab-case unless the language convention requires otherwise.

## Azure standards

- Prefer Azure-native, first-party services over custom infrastructure.
- Apply Zero Trust: explicit verification, least privilege, assume breach.
- Use Managed Identity for service-to-service authentication. Connection strings and keys are a last resort and require an ADR.
- Define all infrastructure as code with Bicep. No portal-only changes in any shared environment.
- Every deployable environment has diagnostic settings, alerts, and a documented recovery objective.

## Security requirements

- Never hard-code secrets, tokens, keys, or connection strings. Use Key Vault and Managed Identity.
- Validate and encode at every trust boundary. Treat all external input as hostile.
- Address the OWASP Top 10 explicitly for any request-handling code.
- Pin third-party GitHub Actions to a full commit SHA.
- Run `/security-review` before merging changes that touch authentication, authorization, secrets, network exposure, or data handling.

## Testing requirements

- Every bug fix ships with a failing-then-passing regression test via `/regression-test-development`.
- Tests assert behavior, not implementation details.
- No new code path merges without coverage of its success path and its primary failure path.
- The full test suite must pass locally before a commit is prepared.

## Documentation requirements

- Update `README.md` when setup, commands, or entry points change.
- Update `docs/` when architecture, operations, or deployment change.
- Generate and refresh documentation with `/documentation-builder`.
- Record continuity with `/project-handoff` at the end of any substantial work session.

## Approval gates

Require explicit user approval before: destructive changes, deployment, publication, privileged access, remote mutation, force operations, commits, and pushes. Never bypass safety checks such as `--no-verify`.
