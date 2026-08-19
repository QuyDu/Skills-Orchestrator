---
name: audit-plan-remediation
description: Convert validated audit findings into prioritized remediation work with owners, dependencies, verification, rollout, and rollback guidance. Use after findings are reviewed and confirmed; do not use to generate findings or to execute the remediation work.
lifecycle: tested
confidence: medium
---

# audit-plan-remediation

## Purpose

Convert validated audit findings into prioritized remediation work with owners, dependencies, verification, rollout, and rollback guidance.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- `reports/code-audit-review.json` or `reports/azure-audit-review.json` produced by `audit-review-findings`.
- Delivery constraints, ownership boundaries, maintenance windows, risk tolerance, and required approval policy.
- Repository architecture and dependency evidence needed to sequence changes safely.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Validate the reviewed findings report against `schemas/audit-findings-review.schema.json`; reject raw or unreviewed findings.
2. Include confirmed findings and explicitly disposition `needs-more-evidence`, disputed, and false-positive findings without scheduling unsupported repairs.
3. Build a directed dependency graph from finding prerequisites, shared root causes, affected components, containment needs, and release constraints. Reject cycles until they are resolved or explicitly broken into phases.
4. Prioritize mandatory containment and critical/high security findings first, except where a prerequisite must precede them. Then order by dependency criticality, severity, exploitability, user impact, confidence, and remediation cost.
5. Group findings only when one change and one verification strategy resolves the same root cause; preserve all source finding IDs.
6. For each work item define owner role, scope, prerequisites, implementation steps, Microsoft and industry guidance inherited from review, acceptance criteria, tests, security validation, rollout, rollback, approvals, and residual risk.
7. Define milestones and parallelizable work without violating dependencies. Separate immediate containment, permanent remediation, and deferred risk acceptance.
8. Require explicit approval for accepted risk, destructive changes, production deployment, external mutation, or bypassing a security control.
9. Validate the JSON plan against `schemas/audit-remediation-plan.schema.json`, then generate the Markdown view from the same ordered data.

## Validation

- Every confirmed reviewed finding is mapped to a remediation item, containment item, or explicit approved disposition.
- Dependencies are acyclic, resolvable, and reflected in execution order; no lower-severity item bypasses an unresolved prerequisite.
- Each item has acceptance criteria, verification, owner role, rollout, rollback, approval requirements, and source finding IDs.
- The JSON validates against `schemas/audit-remediation-plan.schema.json`; Markdown preserves the same ordering and traceability.

## Outputs

- `reports/audit-remediation-plan.json`
- `reports/audit-remediation-plan.md`

## Failure Behavior

- Fail closed when authority, evidence, schema compatibility, or approval is missing.
- Preserve valid partial artifacts and identify a safe resume or recovery point.
- Never report success for blocked or unvalidated work.

## Approval Gates

Pause for explicit approval before destructive, external, privileged, irreversible, or scope-expanding actions.

## Composition and Dependencies

- audit-review-findings
- policy-engine

## Examples

- Invoke `audit-plan-remediation` when its owned capability is selected by the workflow plan.
- Validate its reports before downstream skills consume them.
