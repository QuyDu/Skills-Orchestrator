---
name: documentation-builder
description: Generate and maintain README files, decision records, deployment guides, and operations runbooks that are verified against repository evidence. Use when documentation is missing, stale, or contradicts the code; do not use to narrate changes an agent just made.
lifecycle: draft
confidence: low
---

# documentation-builder

## Purpose

Produce and refresh human-facing documentation that is verified against the repository, addresses one audience per document, and never presents intended behavior as delivered behavior.

## Preconditions

- Read repository instructions and existing documentation before writing.
- Inspect the code, configuration, and infrastructure that each claim describes.
- Confirm this skill owns documentation output rather than the skill that owns the underlying artifact.
- Never create a document that narrates agent activity instead of describing the system.

## Inputs

- Documentation request: target artifacts, audience, and depth.
- Repository evidence: entry points, manifests, scripts, configuration, infrastructure definitions, and tests.
- Existing documentation, decision records, and authoritative reports under `reports/`.
- Clarification result from `clarify-the-ask` when audience, scope, or product intent is ambiguous.

## Approved Tools and Resources

- Use read-only repository inspection to verify every command, path, port, and setting.
- Use file creation and in-place edits for the documentation artifacts named in the approved plan.
- Use schema validators for the emitted plan.
- Do not modify source, configuration, infrastructure, or machine-readable reports.

## Read and Write Boundaries

- Update existing documents in place rather than creating parallel documents that will drift.
- Write only the owned reports listed below plus the approved documentation artifacts.
- Never include secrets, tokens, tenant or subscription identifiers, customer names, or personal data.
- Never contradict a machine-readable report under `reports/`; cite it instead.

## Procedure

1. Determine which documents are required, which exist, and which are stale relative to the code they describe.
2. Fix one audience per document: new contributor, operator, security reviewer, or executive.
3. Extract verified facts from the repository: prerequisites, setup, run and test commands, configuration keys, endpoints, and environments.
4. Verify every command and path by inspection; discard any claim that cannot be confirmed.
5. Draft or update each document, leading with the outcome and following with the procedure.
6. Mark planned or unimplemented behavior explicitly and never describe it as available.
7. Reconcile documentation against accepted decision records and authoritative reports, and flag contradictions rather than resolving them silently.
8. Record which documents were created, updated, left unchanged, or blocked, with the evidence used for each.

## Validation

- Every command, path, and configuration key in the output was verified against the repository.
- Each document addresses exactly one audience and contains one top-level heading.
- Unverified or planned behavior is explicitly marked.
- No secrets, identifiers, or personal data appear in any output.
- Contradictions with `reports/` artifacts are reported, not silently reconciled.
- The plan validates against `schemas/documentation-plan.schema.json`.

## Outputs

- `reports/documentation-plan.json`
- `reports/documentation-plan.md`

## Failure Behavior

- Fail closed when the repository provides no verifiable evidence for the requested document.
- Leave a document unchanged and report it as blocked rather than publishing an unverified claim.
- Never invent setup steps, commands, endpoints, or architecture to fill a gap.

## Approval Gates

Require explicit approval before creating a new document, restructuring an existing one, or publishing documentation outside the repository.

## Composition and Dependencies

- clarify-the-ask

## Examples

- Rebuild a stale `README.md` from the verified build, run, and test commands the repository actually defines.
- Produce an operations runbook covering monitoring signals, common failures, and recovery steps for a deployed service.
