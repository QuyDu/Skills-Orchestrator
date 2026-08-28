# Repository Agent Instructions

## Engagement protocol (mandatory, highest precedence)

Apply this to every new user prompt, without exception, before any analysis, tool use, file change, or answer.

1. Run `clarify-the-ask`.
2. Ask one question round only: ask three questions for an ordinary request, and up to five only when the request is complex, confusing, high-impact, or potentially damaging to the current project.
3. Wait for the user's answers. Do not begin work while a question is unanswered.
4. After the answers arrive, do not ask any more clarification questions for this prompt. State the objective, concrete steps, files or systems touched, and risks, then continue.

- This runs once for every new prompt, including follow-ups later in the same session. Answers close clarification for that prompt; the next prompt starts a new round.
- Ground the three questions in repository evidence; ask about intent, scope, constraints, and acceptance criteria rather than facts the repository already answers.
- Never treat your own plan description as approval.
- Do not ask filler questions. Three is the normal round size; use four or five only when additional decisions are genuinely material. Unresolved material ambiguity still blocks.
- The only exception is an explicit instruction in the current prompt to skip clarification,
  including the exact `--proceed` or `--Proceed` token. Treat the token case-insensitively.

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
