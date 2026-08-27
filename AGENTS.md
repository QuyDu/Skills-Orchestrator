# Repository Agent Instructions

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
- The only exception is an explicit instruction in the current prompt to skip clarification.

## Project Skills Orchestrator

- Read `.github/skills/project-skills-orchestrator/SKILL.md` before coordinating multi-skill work.
- Inspect `reports/current-work-state.json` and `reports/project-handoff.json` when present.
- Treat machine-readable artifacts in `reports/` as authoritative.
- Never rewrite accepted records in `reports/execution-log.jsonl`.
- Require explicit approval before destructive changes, external publication, deployment, or remote mutation.
- Run `npm run check` before declaring implementation work complete.

## Azure environment automation

- Read `.azure/environment.json` before Azure work. Explicit `-Gov` or `-Commercial` overrides the saved cloud; otherwise use the saved profile, then Azure Commercial as the default.
- Collect missing nonsecret Azure environment choices once, persist them, and do not repeat cloud, subscription, MCP, or login questions while the profile remains valid.
- Select the recorded Azure CLI cloud and subscription automatically. Start the recorded login flow when authentication is absent or stale.
- Azure MCP is opt-in. Do not invoke it when disabled, and never invoke `foundryextensions` unless the profile already enables it with a client ID.
