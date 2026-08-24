# Project Skills Orchestrator

Turn any repository into a governed GitHub Copilot workspace: agent instructions, scoped standards, reusable prompts, specialist agents, and 39 governed skills — installed consistently, verified after every run, and safe to rerun.

| Item | Value |
| --- | --- |
| Runtime version | `1.0.2` |
| Framework version | `9.0.0` |
| Skill catalog | 39 governed skills |
| Supported Node.js | 22, 24, 26 |
| Dependencies | None |
| Distribution | Authorized internal use only |

> **Release status.** This build is an unsigned internal candidate. Three release blockers remain open and are tracked in [release/release-manifest.json](release/release-manifest.json): trusted signing identity, independent security review, and cross-platform CI evidence. See [SECURITY.md](SECURITY.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

---

## What this is

GitHub Copilot reads instruction files, prompt files, agent files, and skills from your repository. Setting those up well is slow, and keeping them consistent across many repositories is slower. This tool does it for you.

It has two halves.

**A command-line installer** (`pso.mjs`) that creates a new project or adopts an existing one. It runs entirely on Node.js built-ins — no packages to install, no registry access — and every change it makes is planned, journaled, and verified.

**A catalog of 39 skills** installed into `.github/skills/`, invoked from GitHub Copilot Chat in Agent mode. Each skill is a bounded contract: what it owns, what it reads, what it writes, when it must stop and ask you.

### What makes it different

- **Every prompt starts with clarification.** Provisioned projects require the agent to ask three questions and get your confirmation before touching anything. Installation fails if that rule is missing.
- **It adapts to your repository.** A Python repo does not get C# standards. Detection drives what gets installed.
- **It will not duplicate your work.** If your repo already has a security instruction file, it reports that coverage instead of adding a second one.
- **Everything is reversible.** Every mutation is journaled under `.skills-orchestrator/transactions/` before it happens, with automatic rollback and manual recovery.
- **Reports are machine-readable and authoritative.** JSON under `reports/`, validated against schemas in `schemas/`. Markdown views are derived.

### What it does not do

It does **not** generate application code. `create-project` produces a governed baseline — instructions, standards, skills, CI wiring — with empty `src/` and `tests/`. You bring the application.

---

## Requirements

- Node.js 22, 24, or 26 on `PATH`
- Git on `PATH` (only for `clone-setup`)
- Visual Studio Code with GitHub Copilot and Copilot Chat, to use the installed skills

## Install

```powershell
git clone https://github.com/QuyDu/Skills-Orchestrator.git
cd Skills-Orchestrator
node .\pso.mjs verify
```

`verify` confirms the distribution is complete and every skill contract, schema, dependency, and ownership claim is valid. Do not provision another project if it fails.

To run the full conformance gate — security scan, release build, verification, and the complete test suite:

```powershell
npm run check
```

No dependencies are installed. `npm run check` needs no network access.

### Before you run it against anything

This tool modifies repositories. Back up your work, review the dry run, and test the result somewhere safe first. Interactive runs require you to type `I ACCEPT`; non-interactive runs require `--accept-risk`. Accepting acknowledges residual risk — it does not replace your own review.

---

## Use it

### Guided setup

```powershell
node .\pso.mjs
```

Asks whether your target is new, already local, or a remote GitHub repository, then collects the destination, profile, stack, and workspace accent color.

### Create a new project

```powershell
node .\pso.mjs create-project `
  --name "My Project" `
  --destination "C:\Projects" `
  --profile durable `
  --stack typescript `
  --color "#004578" `
  --open `
  --accept-risk
```

`--profile` is optional and defaults to `durable`, which requires the continuity skills and `audit-azure-environment` in addition to the `core` set. Pass `--profile core` for a smaller required set that excludes the deployed-environment Azure audit.

`--stack` is optional and accepts a comma-separated list. It decides which scoped instruction files are installed, what the build and test tasks run, which debug configurations are written, and what the generated CI workflow actually executes.

Supported values: `typescript`, `javascript`, `csharp`, `python`, `powershell`, `bicep`, `terraform`, `java`, `ruby`, `php`, `go`, `rust`, `swift`, `tests`.

`--color` is optional and accepts a six-digit hexadecimal color. It defaults to `#004578`. New projects use it for the active title bar and status bar, set the window title to `🚀 <project name> • ${rootName}`, and choose black or white foreground text automatically for contrast. The values are written to `.vscode/settings.json` for direct-folder use and to the generated `.code-workspace` file used by **Preferences: Open Workspace Settings (JSON)**. The guided prompts accept the same value.

`--open` launches Visual Studio Code on the generated workspace with the README showing. Without it the workspace path is printed for you to open manually.

Every generated project is standalone: it receives its own copy of the complete governed skill
catalog, schemas, workflows, prompts, agents, and Azure discovery scaffold. Stack-specific editor
tasks, launch configurations, and extensions remain conditional so a Python project does not show
misleading .NET or Terraform commands.

Use `/linkedin-post` to analyze a project and prepare a reviewable draft for Microsoft employees
and the technical community. Use `/linkedin-post --update` to compare against
`reports/linkedin-post-history.md` and describe only verified changes. Drafts are saved to
`reports/linkedin-post-draft.md`; publication always remains a user-approved external action.

To refresh a standalone project from a newer Skills Orchestrator checkout, preview the update first:

```powershell
node .\pso.mjs update --project "C:\Projects\my-project" --dry-run
node .\pso.mjs update --project "C:\Projects\my-project" --accept-risk
```

The updater refreshes orchestrator-owned skills, schemas, configuration, and missing framework
assets. It preserves application code, reports, and project-owned instruction customizations.

Without `--stack`, you get the universal standards and a CI workflow that **fails until you configure it**. That is deliberate — a pipeline that passes without testing anything is worse than no pipeline.

The destination must be absent or empty. The project is published only after installation verification passes.

### Get help for any skill

The source repository and every generated project expose a deterministic help route for each
skill. In Copilot Chat, run `/<skill-name>-help` or start with `/skills-help`. From the CLI,
print the same contract-based guide with:

```powershell
node .\pso.mjs help azure-discovery
node .\pso.mjs --help azure-cleanup
```

The guide includes the skill's purpose, inputs, boundaries, validation, approval gates, and
composition dependencies. Help is read-only; it never authorizes deployment, cleanup, commits,
pushes, or other gated actions.

### Hand the first task over with `--intent`

`--intent` records what you want built first, so the new workspace opens with the work already in front of the agent.

```powershell
node .\pso.mjs create-project `
  --name "Skills Orchestrator Demo" `
  --destination "C:\repos" `
  --stack typescript `
  --intent "Demo started 10:30 am and runs for 1 hour. Build a web app that explains the demo and counts down to the end." `
  --open `
  --accept-risk
```

Describe the **application** only. The project itself already exists by the time the agent reads this, so an intent that says "create a new project" tells the agent to create something it is already sitting inside.

Two things happen:

- `docs/PROJECT-BRIEF.md` is written into the project, recording the requested outcome verbatim alongside an ISO 8601 creation timestamp. The brief is the durable copy; it survives closing the window.
- With `--open`, the outcome is handed to Copilot Chat **in ask mode**, with the brief attached as context.

Ask mode is deliberate. A newly created folder has not been trusted yet, and the text arrived over a command-line argument that a script could just as easily have supplied. The first turn therefore reads the brief, asks its three clarifying questions, and proposes a plan — it cannot write files. Switch to Agent mode once you approve.

Relative times are left alone. `--intent` is never parsed for dates; the agent resolves "10:30 am" against the recorded creation timestamp and asks if that is ambiguous.

If Visual Studio Code cannot be launched, project creation still succeeds and the composed prompt is printed for you to paste.

### First run in Visual Studio Code

Two prompts appear the first time, and both are expected:

1. **Workspace trust** — select *Yes, I trust the authors*. Tasks, debugging, and MCP servers stay disabled until you do. This cannot be pre-approved from inside a workspace, by design.
2. **Recommended extensions** — select *Install* to get the language extensions for your stack.

Everything else is discovered automatically. Instructions, prompts, agents, and skills all live in the locations Visual Studio Code searches by default, so there is nothing to configure:

| Location | Discovered as |
| --- | --- |
| `.github/copilot-instructions.md`, `AGENTS.md` | Always-on instructions |
| `.github/instructions/` | Pattern-scoped instructions |
| `.github/prompts/` | Slash commands, surfaced as recommendations in a new chat |
| `.github/agents/` | Entries in the agent picker |
| `.github/skills/` | The governed skill catalog |

Open Copilot Chat in Agent mode and your first prompt triggers the three-question clarification protocol.

### Copilot cloud agent and code review

The same customization files carry beyond the IDE. Per the [GitHub Copilot features](https://docs.github.com/en/copilot/get-started/features) documentation, `.github/copilot-instructions.md`, `AGENTS.md`, `.github/agents/`, and `.github/skills/` are read by Copilot cloud agent on GitHub.com, in IDEs, and in Copilot CLI — not only by VS Code.

A project created with `--stack` also gets `.github/workflows/copilot-setup-steps.yml`, which preinstalls dependencies in the ephemeral environment Copilot cloud agent and Copilot code review use. Without it the agent has to discover dependencies by trial and error, which the GitHub documentation warns is slow, unreliable, and sometimes impossible for private packages.

Two caveats, stated plainly:

- The setup steps workflow only takes effect once it is on your default branch.
- MCP servers are configured for VS Code in `.vscode/mcp.json`. Cloud agent and CLI read MCP configuration from the `mcp-servers` property of an agent profile instead, which these templates do not set.

### Adopt an existing project

Always preview first:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --dry-run
```

The plan tells you exactly what will happen:

```text
Detected stack: python, tests
Files to create: 24
Existing skills to update: 0
Templates skipped as not applicable: 4
Templates covered by existing files: 1
  covered: .github/instructions/security.instructions.md by .github/instructions/appsec.instructions.md
Blocking conflicts: 0
```

Apply the reviewed plan:

```powershell
node .\pso.mjs adopt --project "C:\repos\ExistingProject" --profile core --apply --accept-risk
```

Rerun it any time. A rerun adds new skills, synchronizes changed ones, migrates legacy skill IDs, and reports zero changes when nothing moved.

**What adoption will never do:** overwrite your instruction text, replace a skill you wrote, install a second copy of a standard you already have, or add a CI workflow to a repository that has its own.

Useful flags:

| Flag | Effect |
| --- | --- |
| `--force-templates` | Install framework templates even where an equivalent already exists |
| `--force-adopt` | Proceed against a directory with no recognized project marker |
| `--profile` | `core`, `durable`, `distributed`, or `advanced`. Adoption keeps the profile the project already declares; new projects default to `durable` |

### Clone and provision in one step

```powershell
node .\pso.mjs clone-setup `
  --repository "https://github.com/owner/project.git" `
  --destination "C:\repos\project" `
  --accept-risk
```

Clones into an isolated staging directory, provisions, verifies, and only then publishes to your destination. Credential-bearing URLs are rejected; use Git Credential Manager or SSH. No script from the cloned repository is ever executed.

---

## What a provisioned project receives

| Path | Contents |
| --- | --- |
| `.github/copilot-instructions.md` | Repository constitution: engagement protocol, orchestration, purpose, architecture, coding, naming, Azure, security, testing, documentation |
| `.github/instructions/` | Scoped standards applied by glob — only the ones your stack needs |
| `.github/prompts/` | `/create-adr`, `/review-architecture`, `/executive-summary`, `/security-review`, `/project-status`, `/new-component`, `/azure-cleanup`, `/environment-update`, `/release-readiness`, and skill help prompts |
| `.github/agents/` | Azure Architect, Security Reviewer, Documentation Writer |
| `.github/skills/` | The 39-skill catalog |
| `.github/workflows/ci.yml` | Stack-aware pipeline, SHA-pinned actions (new projects only) |
| `.github/workflows/copilot-setup-steps.yml` | Preinstalls dependencies for Copilot cloud agent and Copilot code review (new projects with a stack) |
| `.vscode/tasks.json` | Build and test tasks for the stack — `Ctrl+Shift+B` and Test Explorer work immediately |
| `.vscode/launch.json` | Debug configurations for the stack |
| `.vscode/extensions.json` | Copilot, EditorConfig, plus the language extensions your stack needs |
| `.vscode/mcp.json` | GitHub and Microsoft Learn MCP servers; registry-dependent servers documented but disabled |
| `.editorconfig` / `.gitattributes` | Shared formatting and line-ending normalization |
| `docs/adr/` | Architecture Decision Record template |
| `schemas/` | Report contracts |
| `reports/` | Authoritative machine-readable evidence, tracked in source control |

### Build, test, and debug

Declare a stack and the workspace is wired for it. A `--stack csharp,bicep` project gets:

- **Extensions**: C# Dev Kit, C#, Bicep — and not Python or Go
- **Tasks**: `dotnet build` as the default build task, `dotnet test` as the default test task, plus `validate: bicep`
- **Debug**: a `coreclr` configuration with `build` as its `preLaunchTask`

Configurations that genuinely cannot be inferred — a .NET assembly path, a Node entry point, a Java main class — carry an explicit `REPLACE_WITH_` placeholder. Python, Go, PowerShell, and PHP configurations work with no edit at all.

**Declare no stack and none of this is generated.** No task file, no launch file, and a CI workflow that fails until you configure it. The tool will not invent a build command it cannot stand behind.

### The clarification protocol

Every provisioned project carries one non-negotiable rule. For **every** new prompt, the agent must:

1. Run `clarify-the-ask`
2. Ask exactly three clarifying questions
3. Wait for your answers
4. State the objective, the steps, the files it will touch, and the risks
5. Wait for your explicit confirmation

It is installed in four places — `.github/copilot-instructions.md`, `.github/instructions/clarification.instructions.md`, `AGENTS.md`, and `config/skills-orchestrator.json` — and enforced in code: installation verification fails if the managed region is missing or duplicated.

Tune it in `config/skills-orchestrator.json`:

```json
{
  "clarification": {
    "enabled": true,
    "askEveryPrompt": true,
    "questionsPerPrompt": 3,
    "maxQuestionsPerRound": 3,
    "blockOnMaterialAmbiguity": true,
    "confirmPlanBeforeExecution": true
  }
}
```

Set `askEveryPrompt` to `false` for evidence-driven clarification, where zero questions is valid when the repository already answers them.

### Managed regions

Framework-owned sections of your instruction files are wrapped in markers:

```markdown
<!-- pso:begin id=clarification-protocol version=1 -->
...
<!-- pso:end id=clarification-protocol -->
```

Edit anything outside them freely. Updates replace the region in place. Rename a heading or delete the markers and the next run migrates it back — it never appends a second copy.

---

## Using the skills

Open the project in VS Code, start Copilot Chat in **Agent** mode, and invoke a skill:

```text
/project-setup            Establish the baseline for this application
/audit-code               Full repository audit with structured findings
/security-review          Exploitable weaknesses, secrets, authorization defects
/architecture-review      Well-Architected assessment of the defined architecture
/deployment-review        Is this release candidate deployable, and how do we roll back
/documentation-builder    Rebuild README, deployment guide, operations runbook
/systematic-debugging     Reproduce, isolate root cause, verify the smallest fix
/change-review            Review this diff before commit
/project-handoff          Record continuity before you stop
```

The audit workflow is staged, and each stage validates the one before it:

```text
/audit-code            -> reports/code-audit-findings.json
/audit-review-findings -> reports/code-audit-review.json
/audit-plan-remediation-> reports/audit-remediation-plan.json
```

### Conformance profiles

| Profile | Adds |
| --- | --- |
| `core` | Orchestration, clarification, planning, policy, setup, audit pipeline, security and architecture review, documentation, deployment review, debugging, testing, CI triage, dependencies, commit preparation |
| `durable` | Handoff, knowledge capture, memory, recovery, artifact upgrade, Azure environment audit |
| `distributed` | Scheduler, multi-agent coordination, telemetry |
| `advanced` | Workflow simulation, skill registry |

Every profile is dependency-closed and enforced by tests.

---

## Command reference

| Command | Purpose |
| --- | --- |
| `node .\pso.mjs` | Guided setup |
| `node .\pso.mjs verify` | Verify this distribution |
| `node .\pso.mjs create-project ... --accept-risk` | Create a new governed project |
| `node .\pso.mjs clone-setup ... --accept-risk` | Clone a GitHub repository and provision it |
| `node .\pso.mjs adopt ... --dry-run` | Preview changes to an existing project |
| `node .\pso.mjs adopt ... --dry-run --json` | Emit the portable plan as JSON without changing the project |
| `node .\pso.mjs adopt ... --apply --accept-risk` | Apply the reviewed plan |
| `node .\pso.mjs recover --project PATH` | Restore an interrupted adoption |
| `node .\pso.mjs inventory --root PATH` | Regenerate and validate the skill inventory |
| `node .\pso.mjs plan --root PATH --intent TEXT` | Create a workflow plan |
| `npm run evidence:adoption` | Regenerate disposable-fixture adoption and no-op evidence |
| `npm run check` | Full conformance gate |

## Reports

| Report | Meaning |
| --- | --- |
| `reports/installation-verification.json` | Proof a new project is complete and correctly wired |
| `reports/adoption-verification.json` | Proof an adopted project is current |
| `reports/adoption-plan.json` | Exact actions applied by the last adoption of a target project, including skipped and covered decisions |
| `reports/adoption-rerun-evidence.json` | Reproducible before/apply/no-op evidence from a disposable project fixture |
| `reports/adoption-rerun-evidence.md` | Concise presentation view derived from the rerun evidence |
| `reports/skill-inventory.json` | Installed skills, dependencies, lifecycle, outputs |
| `reports/artifact-ownership.json` | The declared producer of every skill-owned report |
| `reports/execution-log.jsonl` | Append-only workflow event stream |

An adoption dry run never writes into the target repository, so it does not create `reports/adoption-plan.json`. Use `--json` to capture that portable plan from standard output. The target report is persisted only after an approved apply. The source repository's rerun evidence is generated separately with `npm run evidence:adoption` against a disposable local fixture.

## Recovery

If adoption is interrupted, the journal under `.skills-orchestrator/transactions/` holds a backup of every file touched. A `rolled-back` journal means restoration already completed. Otherwise:

```powershell
node .\pso.mjs recover --project "C:\repos\ExistingProject"
```

Recovery refuses to replace a lock whose owning process may still be running.

## Security

- Zero runtime dependencies; committed lock file; `ignore-scripts` enforced
- Every GitHub Action pinned to a full commit SHA, enforced by [scripts/security-check.mjs](scripts/security-check.mjs)
- Shipped templates may not resolve unpinned packages at runtime (`SEC-SUPPLY-006`)
- Symbolic links rejected on every managed path; all writes confined to the project root
- Credential-bearing repository URLs rejected
- No dynamic code execution, no shell interpretation

Report vulnerabilities per [SECURITY.md](SECURITY.md). Threat boundaries and residual risks are in [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md). No software eliminates every defect — do not treat any build as security-assured without current evidence for all documented release gates.

## Contributing

`config/profiles.yaml`, `schemas/`, `templates/`, and the skill catalog are contract surfaces. Changing any of them requires updating [tests/skill-contracts.test.mjs](tests/skill-contracts.test.mjs). Run `npm run check` before proposing a change.

## License

See [LICENSE](LICENSE). Restricted to authorized internal use; see [docs/INTERNAL-RELEASE.md](docs/INTERNAL-RELEASE.md).
