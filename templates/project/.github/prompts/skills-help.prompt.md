---
mode: agent
description: Explain how to use project skills, inspect their contracts, and use VS Code chat references.
---

# Skills Help

## Run a skill

Use a slash command with the skill name:

```text
/security-review
/Azure Discovery -Gov
/project-handoff
```

Use the matching `/<skill-name>-help` command for the detailed guide. Each guide is generated from the skill contract at `.github/skills/<skill-name>/SKILL.md`.

## Read a skill

Use an `@` workspace reference to give the agent a specific file or folder as context:

```text
@.github/skills/azure-discovery/SKILL.md
```

The `SKILL.md` contract defines purpose, preconditions, inputs, approved tools, read/write boundaries, procedure, validation, outputs, failure behavior, approval gates, and dependencies.

## VS Code chat syntax

- `/command` invokes a saved prompt or skill workflow.
- `@reference` attaches workspace context such as a file, folder, symbol, or participant.
- `#variable` inserts a chat variable or participant supplied by VS Code, such as `#file`, `#selection`, or another available context variable. It is not a skill invocation.

You can combine them:

```text
/security-review @src #selection
```

## Clarification override

Append either exact token to the current prompt when you do not want the normal clarification round:

```text
--no-clarification
--nmc
```

These tokens do not authorize deployment, destructive changes, privileged access, commits, or pushes.

## Project startup order

1. Read `reports/project-handoff.json`, creating it through `/project-handoff` if missing.
2. Read and understand `reports/azure-discovery.md` and `reports/azure-discovery.json` when present.
3. If discovery is missing or older than 14 days, ask whether to run `/Azure Discovery`.
4. Read the relevant skill help prompt and then its complete `SKILL.md` before invoking it.
