---
name: workflow-planner
description: Convert user intent into an ordered, validated workflow plan with inputs, outputs, approvals, checkpoints, rollback points, and recovery routes. Use after clarification to turn a confirmed request into an executable sequence; do not use to execute the plan.
lifecycle: draft
confidence: low
---

# workflow-planner

## Purpose

Convert user intent into an ordered, validated workflow plan with inputs, outputs, approvals, checkpoints, rollback points, and recovery routes.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- User objective, constraints, success criteria, and prohibited actions.
- Ready clarification result from `clarify-the-ask`, including confirmed requirements, project facts, and accepted assumptions.
- Skill catalog and ownership map from `skill-inventory`.
- Dependency graph and cycle checks from `skill-dependency-manager`.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Validate that clarification is ready and resolve its confirmed objective into candidate workflow steps owned by available skills.
2. Define step inputs, expected outputs, and completion criteria per skill boundary.
3. Order steps using dependency graph evidence and reject cyclic plans.
4. Insert checkpoints, rollback points, and explicit approval gates where mutation risk exists.
5. Define failure recovery branches for blocked, denied, or failed steps.
6. Emit machine-readable and markdown workflow plans with identical ordering.

## Validation

- Every step has one owner, clear prerequisites, and deterministic success criteria.
- Planning does not proceed while the clarification result is blocked by material ambiguity.
- Ordering respects dependency constraints and contains no unresolved cycles.
- Approval gates are tied to concrete mutation or external-impact operations.
- Recovery branches exist for each critical path failure point.

## Outputs

- `reports/workflow-plan.json`
- `reports/workflow-plan.md`

## Failure Behavior

- Fail closed when ownership mapping or dependency evidence is incomplete.
- Return blocked planning output with unresolved prerequisites listed.
- Never publish an executable plan with ambiguous step authority.

## Approval Gates

Require explicit approval before including steps that perform destructive, privileged, external, or irreversible mutations.

## Composition and Dependencies

- clarify-the-ask
- skill-inventory
- skill-dependency-manager

## Examples

- Build an audit-to-remediation workflow with review, planning, and gated execution phases.
- Produce a blocked plan when requested goals require unavailable owning skills.
