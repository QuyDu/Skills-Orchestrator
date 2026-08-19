# Project Skills Orchestrator

Turn any repository into a governed GitHub Copilot workspace: agent instructions, scoped standards, reusable prompts, specialist agents, and 35 governed skills — installed consistently, verified after every run, and safe to rerun.

| Item | Value |
| --- | --- |
| Runtime version | `1.0.0` |
| Framework version | `9.0.0` |
| Skill catalog | 35 governed skills |
| Supported Node.js | 22, 24, 26 |
| Dependencies | None |
| Distribution | Authorized internal use only |

> **Release status.** This build passes its full local gate. Three release blockers remain open and are tracked in [release/release-manifest.json](release/release-manifest.json): trusted signing identity, independent security review, and cross-platform CI evidence. See [SECURITY.md](SECURITY.md) and [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md).

---

## What this is

GitHub Copilot reads instruction files, prompt files, agent files, and skills from your repository. Setting those up well is slow, and keeping them consistent across many repositories is slower. This tool does it for you.

It has two halves.

**A command-line installer** (`pso.mjs`) that creates a new project or adopts an existing one. It runs entirely on Node.js built-ins — no packages to install, no registry access — and every change it makes is planned, journaled, and verified.

**A catalog of 35 skills** installed into `.github/skills/`, invoked from GitHub Copilot Chat in Agent mode. Each skill is a bounded contract: what it owns, what it reads, what it writes, when it must stop and ask you.

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

Asks whether your target is new, already local, or a remote GitHub repository, then collects the destination, profile, and stack.

### Create a new project

```powershell
node .\pso.mjs create-project `
  --name "My Project" `
  --destination "C:\Projects" `
  --profile core `
  --stack typescript `
  --accept-risk
```

`--stack` is optional and accepts a comma-separated list. It decides which scoped instruction files are installed and what the generated CI workflow actually runs.

Supported values: `typescript`, `javascript`, `csharp`, `python`, `powershell`, `bicep`, `terraform`, `java`, `ruby`, `php`, `go`, `rust`, `swift`, `tests`.

Without `--stack`, you get the universal standards and a CI workflow that **fails until you configure it**. That is deliberate — a pipeline that passes without testing anything is worse than no pipeline.

The destination must be absent or empty. The project is published only after installation verification passes. Open the generated `.code-workspace` file to start.

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
| `--profile` | `core`, `durable`, `distributed`, or `advanced` |

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
| `.github/prompts/` | `/create-adr`, `/review-architecture`, `/executive-summary`, `/security-review`, `/project-status`, `/new-component` |
| `.github/agents/` | Azure Architect, Security Reviewer, Documentation Writer |
| `.github/skills/` | The 35-skill catalog |
| `.github/workflows/ci.yml` | Stack-aware pipeline, SHA-pinned actions (new projects only) |
| `.vscode/mcp.json` | GitHub and Microsoft Learn MCP servers; registry-dependent servers documented but disabled |
| `docs/adr/` | Architecture Decision Record template |
| `schemas/` | Report contracts |
| `reports/` | Authoritative machine-readable evidence, tracked in source control |

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
| `node .\pso.mjs adopt ... --apply --accept-risk` | Apply the reviewed plan |
| `node .\pso.mjs recover --project PATH` | Restore an interrupted adoption |
| `node .\pso.mjs inventory --root PATH` | Regenerate and validate the skill inventory |
| `node .\pso.mjs plan --root PATH --intent TEXT` | Create a workflow plan |
| `npm run check` | Full conformance gate |

## Reports

| Report | Meaning |
| --- | --- |
| `reports/installation-verification.json` | Proof a new project is complete and correctly wired |
| `reports/adoption-verification.json` | Proof an adopted project is current |
| `reports/adoption-plan.json` | Exact actions from the last run, including skipped and covered decisions |
| `reports/skill-inventory.json` | Installed skills, dependencies, lifecycle, outputs |
| `reports/artifact-ownership.json` | The single producer of every report |
| `reports/execution-log.jsonl` | Append-only workflow event stream |

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
