---
name: project-understanding
description: Perform a complete evidence-grounded scan of the current repository and rebuild authoritative project understanding covering purpose, architecture, setup, usage, features, skills, prompts, workflows, validation, and limitations. Use before project-video or whenever the project guide must reflect current code.
lifecycle: draft
confidence: low
---

# project-understanding

## Purpose

Perform a complete repository rescan and rebuild a detailed, evidence-grounded description of the project where the skill is invoked. The output explains what the project is, how it is structured, how to use it, its important features, and how its skills, prompts, agents, tests, and operational workflows fit together.

## Preconditions

- Read repository instructions and authoritative reports before interpreting source or configuration.
- Run from the target project root using `.github/skills/project-understanding/scripts/project-understanding.mjs`.
- Treat each invocation as a full rebuild, not an incremental summary or continuation note.
- Require meaningful project evidence; an empty governed baseline is blocked.

## Inputs

- The complete current repository excluding generated dependencies, build output, version-control internals, caches, and the understanding outputs being rebuilt.
- Source, manifests, infrastructure, instructions, skills, prompts, agents, schemas, tests, documentation, and authoritative reports.
- Optional confirmed audience or emphasis; absence of these does not prevent a general contributor-oriented understanding.

## Approved Tools and Resources

- Use read-only repository inspection and the packaged deterministic scanner.
- Use semantic code inspection when needed to explain relationships the inventory alone cannot establish.
- Validate the machine-readable result against `schemas/project-understanding.schema.json`.
- Derive the Markdown guide from the same machine-readable record.

## Read and Write Boundaries

- Read all regular project files needed for a complete scan, while skipping secrets, binary payloads, dependency trees, generated builds, and symbolic links.
- Replace only `reports/project-understanding.json` and `reports/project-understanding.md` during a rebuild.
- Do not modify source, configuration, infrastructure, tests, instructions, or accepted event-stream records.
- Never copy secret values, credentials, personal data, or binary content into the understanding artifacts.

## Procedure

1. Run `node .github/skills/project-understanding/scripts/project-understanding.mjs scan` from the current project root.
2. Walk the complete repository within bounded exclusions, hash every scanned regular file, and record the resulting repository digest and exact scan scope.
3. Identify project identity, purpose, technology stack, top-level components, entry points, setup and usage commands, validation commands, and operational boundaries from verified files.
4. Inventory every installed skill, prompt, agent, and schema with its repository-relative evidence path and explain how the user invokes or applies each available capability.
5. Extract important features and workflows only from source, tests, instructions, manifests, and authoritative reports. Mark facts as `verified`, `inferred`, `planned`, or `unknown`; never silently promote intent to delivered behavior.
6. Reconcile contradictory claims in documentation and code by preferring machine-readable reports and executable evidence, then record unresolved contradictions as limitations.
7. Atomically replace both understanding outputs so a rerun never leaves mixed old and new content; the operation must atomically replace both understanding outputs as one publication pair.
8. Run `validate` and stop as blocked if required sections, evidence paths, source digests, or the Markdown binding are invalid.

## Validation

- The JSON validates against `schemas/project-understanding.schema.json` and the Markdown is generated from the same record.
- The repository digest covers the complete bounded scan and excludes the two generated understanding files to prevent self-reference.
- Every feature, workflow, command, skill, prompt, and architecture component has at least one safe repository-relative evidence path.
- Required coverage includes purpose, architecture, setup, usage, key features, skills and prompts, validation, limitations, and scan provenance.
- A rerun performs a new full scan and atomically replaces both outputs rather than appending stale content.

## Outputs

- `reports/project-understanding.json`
- `reports/project-understanding.md`

## Failure Behavior

- Return `blocked` when the repository is an empty baseline or lacks enough evidence to explain its purpose and use.
- Fail closed on symbolic-link traversal, unsafe paths, unreadable required evidence, malformed manifests, or output replacement failure.
- Preserve the last complete pair if atomic publication of the rebuilt pair fails.
- Record uncertainty and contradictions instead of inventing missing behavior.

## Approval Gates

- A local rebuild of owned understanding reports requires no external-service approval.
- Require separate approval before external processing, publication, upload, commit, push, deployment, or mutation outside the two owned reports.

## Composition and Dependencies

- clarify-the-ask

## Examples

- Run `/project-understanding --proceed` after implementing a feature to completely rescan the repository and rebuild the contributor guide.
- Invoke `/project-video`; it first dispatches `project-understanding`, then uses the rebuilt JSON and Markdown as the authoritative subject and narration source.
