# Registry-Free Windows Setup

This edition requires a maintained Node.js 22, 24, or 26 release but does not use npm or any package registry.

## Guided setup

Run:

```powershell
node .\pso.mjs
```

The wizard asks whether the project is new, existing locally, or hosted remotely on GitHub.

- New: asks for project name, parent destination, and conformance profile.
- Existing: asks for the repository location and profile, shows a dry-run adoption plan, and asks for confirmation before adding missing files.
- Remote: asks for a GitHub HTTPS or SSH location, optional local destination, and profile, then clones, provisions, and verifies the project before publishing the local folder.

## Verify

```powershell
node .\pso.mjs verify
```

Expected result:

```text
Verified registry-free distribution: 30 skills
```

## Create a project

```powershell
node .\pso.mjs create-project `
  --name "PSO Test Project" `
  --destination "C:\repos" `
  --profile durable `
  --accept-risk
```

Or use the PowerShell launcher:

```powershell
.\pso.ps1 create-project `
  --name "PSO Test Project" `
  --destination "C:\repos" `
  --profile durable `
  --accept-risk
```

If PowerShell script execution is restricted, use the `node .\pso.mjs` form.

The new project is created under `C:\repos\pso-test-project`. Open its `.code-workspace` file in Visual Studio Code.

## Clone and provision a GitHub project

```powershell
node .\pso.mjs clone-setup `
  --repository "https://github.com/owner/project.git" `
  --destination "C:\repos\project" `
  --profile durable `
  --accept-risk
```

Omit `--destination` to use the repository name under the current directory. The destination must not exist. Use Git Credential Manager or SSH for private repositories; do not place credentials in the URL. Repository-provided setup commands are not executed automatically. Run `development-environment-readiness` from the provisioned project before restoring dependencies or beginning implementation.

## Adopt into an existing project

Interactive:

```powershell
node .\pso.mjs
```

Non-interactive dry run:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --dry-run
```

Apply only after reviewing the dry run:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --apply --accept-risk
```

Before changing project files, Skills Orchestrator displays its security and risk acknowledgment. Interactive setup requires the exact phrase `I ACCEPT`; automated installation requires `--accept-risk`. Proceeding acknowledges that secure engineering reduces but cannot eliminate all defects, vulnerabilities, compatibility problems, or unintended outcomes. The user remains responsible for backups, review, validation, and non-production testing before any production use.

The command is safe to rerun. Dry run identifies new or changed complete skill packages, schemas, profiles, wiring files, and legacy or duplicate skill directories. Apply mode journals every changed framework asset under `.skills-orchestrator/transactions/`, synchronizes the current distribution, preserves unrelated project skills and custom Copilot instruction text, and verifies inventory, dependencies, ownership, versions, configuration paths, profile selection, and orchestration routing. Invalid manifests or failed post-apply verification trigger automatic rollback with persistent recovery evidence.

For an interrupted transaction after confirming its recorded process is no longer active:

```powershell
node .\pso.mjs recover --project "C:\repos\ExistingProject" --transaction TRANSACTION_ID
```
