---
mode: agent
description: Demo step 1 - provision the Skills Orchestrator Demo project and prepare it for automated follow-up prompts.
---

Skip clarification. Do not ask clarifying questions and do not wait for plan confirmation. Execute this request end to end and report the result when finished.

## Parameters

Use the prompt with no parameters for the normal demo project:

```text
/demo-create-project
```

Use `--Test` to create a separate preserved test project. Test mode keeps the same demo setup and
validation, but appends `-test` to the project name and destination folder so it cannot be
confused with the normal demo project:

```text
/demo-create-project --Test
```

Use `--demo-date YYYY-MM-DD` to record the scheduled demo date in the project brief and report.
This is optional and supports any future invitation; for example:

```text
/demo-create-project --demo-date 2026-09-17
/demo-create-project --Test --demo-date 2026-09-17
```

If `--demo-date` is omitted, do not invent a date. Record that the demo date was not supplied.
The date is metadata only and does not authorize deployment, cleanup, publication, commit, or push.

When `--Test` is present, use these values:

- Project name: `Skills Orchestrator Demo Test`
- Project path: `C:\repos\skills-orchestrator-demo-test`
- Intent: include `test run` and the supplied demo date when present

When `--Test` is absent, use the normal values in the steps below. Never delete an existing normal
or test project; stop and report if its destination already exists.

## Objective

Provision a new governed project named **Skills Orchestrator Demo** using the Project Skills Orchestrator, then prepare it so the next demo prompt runs without interruption.

## Steps

1. Create the project by running, from the repository root. Use the normal command unless `--Test`
   was supplied; in test mode use the test name, destination folder, and intent shown above. Add
   the optional demo date to the intent only when the user supplied it:

   ```powershell
   node .\pso.mjs create-project --name "Skills Orchestrator Demo" --destination "C:\repos" --stack typescript,tests --intent "Build the session countdown web app for the GitHub Copilot Skills Orchestrator demo." --accept-risk
   ```

   The normal project is created at `C:\repos\skills-orchestrator-demo`; test mode is created at
   `C:\repos\skills-orchestrator-demo-test`. Stop and report if the selected path already exists;
   do not delete it.

2. Confirm and report these facts from the created project:
   - `conformanceProfile` in `project-orchestrator.json` is `durable`
   - `reports/installation-verification.json` has status `passed`
   - `.github/skills/audit-azure-environment/SKILL.md` exists
   - `infra/discover.ps1` and `infra/main.bicep` exist
   - the number of installed skills
   - `docs/PROJECT-BLUEPRINT.json` exists and records the selected project name and demo intent
   - the supplied demo date is present when `--demo-date` was used, otherwise report it as not supplied

3. Prepare the new project for automated prompts. In the created project only:
   - In `config/skills-orchestrator.json`, set `clarification.askEveryPrompt` to `false` and `clarification.confirmPlanBeforeExecution` to `false`. Leave `blockOnMaterialAmbiguity` as `true` and leave every entry in `policy.requireApprovalFor` untouched.
   - In both `.github/copilot-instructions.md` and `AGENTS.md`, replace the body between the `pso:begin id=clarification-protocol` and `pso:end` markers with an engagement protocol that says to work autonomously, apply safe reversible defaults, ask at most three questions only when a material ambiguity has no defensible default, and still require explicit approval before destructive, irreversible, privileged, external, deployment, commit, or push actions. Keep the marker comments intact.

   This matters because a newly created project ships with a mandatory three-question protocol that would stall the next demo prompt.

4. Copy `.github/prompts/demo-web-app.prompt.md` from this repository into the created project at the same relative path, so the presenter can run `/demo-web-app` there without pasting prompt text. In test mode, preserve the test project for inspection after the run; do not delete it automatically.

5. Open the new project in its own Visual Studio Code window:

   ```powershell
   code --new-window "C:\repos\skills-orchestrator-demo\skills-orchestrator-demo.code-workspace"
   ```

   `--new-window` is required. Without it the command can return exit code 0 and open nothing at all. Confirm a window titled `skills-orchestrator-demo (Workspace)` appears before reporting success.

   Do not pass `--open` to `create-project`. Combined with `--intent`, that path launches `code chat --mode ask`, which cannot edit files, and it seeds a kickoff prompt that instructs the agent to ask three clarifying questions first. Both would stall the demo.

6. Report the absolute project path and tell the presenter to accept the workspace trust prompt, switch Chat to **Agent** mode, and run `/demo-web-app` in the new window.

   For a fully unattended handoff instead, run this from the created project directory rather than step 5:

   ```powershell
   code chat --mode agent --add-file .github/prompts/demo-web-app.prompt.md "Follow .github/prompts/demo-web-app.prompt.md exactly. Skip clarification and build it end to end."
   ```

## Constraints

- Do not modify anything in the Skills Orchestrator repository itself.
- Do not commit, push, or deploy.
- `--Test` changes only the project name and destination convention; it does not grant permission to mutate external systems.
- `--demo-date` is optional scheduling metadata and must use `YYYY-MM-DD`; do not infer it from conversational context.
