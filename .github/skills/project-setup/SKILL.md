---
name: project-setup
description: Establish a new application's repository structure, agent customization layer, standards, and required skill set so development can start from a governed baseline. Use when starting a new application or bringing an unstructured repository up to the project baseline; do not use for feature implementation or dependency installation.
lifecycle: draft
confidence: low
---

# project-setup

## Purpose

Turn a new or unstructured repository into a governed development baseline with an accurate instruction layer, scoped standards, reusable prompts, specialist agents, decision records, and the skill set the project actually needs.

## Preconditions

- Read repository instructions and `config/skills-orchestrator.json` when present.
- Inspect the existing tree before writing anything; an unstructured repository is not an empty one.
- Confirm this skill owns setup scaffolding rather than `development-environment-readiness`, which owns tool, runtime, and access validation.
- Never overwrite existing project-authored instructions, agents, prompts, or skills.

## Inputs

- Project purpose, primary language and framework, target platform, and hosting model.
- Compliance, data-classification, and cloud constraints, including sovereign or government cloud requirements.
- Detected repository evidence: existing manifests, source layout, infrastructure definitions, tests, and CI configuration.
- Clarification result from `clarify-the-ask` when purpose, stack, or constraints are materially ambiguous.
- Resolved conformance profile and the installed skill catalog.

## Approved Tools and Resources

- Use read-only repository inspection to detect existing structure, stack, and conventions.
- Use file creation for absent baseline artifacts only.
- Use schema validators to confirm emitted artifacts.
- Do not install packages, run build tooling, or contact external services.

## Read and Write Boundaries

- Create baseline files only where none exist; report a conflict instead of replacing project-authored content.
- Append orchestration routing to existing instruction files without removing existing text.
- Write only the owned reports listed below plus the approved baseline artifacts.
- Do not modify source code, infrastructure definitions, lock files, or CI secrets.

## Procedure

1. Detect the current state: languages, frameworks, build and test tooling, infrastructure definitions, existing agent customization files, and existing skills.
2. Resolve the project's purpose, stack, constraints, and cloud target; route material ambiguity through `clarify-the-ask` before proposing structure.
3. Determine the required baseline: repository instructions, scoped instruction files matching the detected languages, specialist agents, reusable prompts, decision-record location, reports directory, and workspace support files.
4. Select required and suggested skills from the installed catalog against the project's actual shape, and record why each suggested skill is or is not applicable.
5. Classify every planned artifact as `create`, `already-present`, or `conflict`, and never plan a silent replacement.
6. Populate the repository instruction file with the project's real purpose, architecture summary, coding, naming, testing, security, and documentation standards rather than placeholder text.
7. Confirm that continuity artifacts under `reports/` are tracked by source control and are not excluded by ignore rules.
8. Emit the setup plan, apply only the approved `create` actions, and record the resulting baseline.
9. Hand the next step to `development-environment-readiness` for tool, runtime, authentication, debugging, and security validation.

## Validation

- Every planned artifact has an explicit classification and no `conflict` item was written.
- Scoped instruction files match languages actually present in the repository.
- Selected skills are dependency-closed within the resolved profile.
- The repository instruction file routes multi-skill work through `project-skills-orchestrator`.
- Continuity artifacts under `reports/` are not excluded by ignore rules.
- The machine-readable plan validates against `schemas/project-setup-plan.schema.json` and the Markdown view derives from it.

## Outputs

- `reports/project-setup-plan.json`
- `reports/project-setup-plan.md`

## Failure Behavior

- Fail closed when the target path is outside the project root, is a symbolic link, or resolves outside the repository.
- Stop and report when a baseline artifact exists with different project-authored content; never merge silently.
- Leave the repository unchanged when the plan cannot be fully classified.
- Report a partial baseline explicitly rather than claiming a complete one.

## Approval Gates

Require explicit approval before writing any file, before replacing an existing artifact, and before adding a dependency, CI workflow, or infrastructure definition.

## Composition and Dependencies

- clarify-the-ask
- workflow-planner

## Examples

- Establish the instruction, prompt, agent, and skill baseline for a new Azure API service and hand off to readiness validation.
- Bring an existing repository with source but no agent customization layer up to the project baseline without altering its code.
