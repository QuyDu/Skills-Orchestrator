---
name: project-skills-orchestrator
description: Coordinate project workflows by discovering capabilities, routing intent, enforcing ownership boundaries, and composing approved skills. Use to route any request that spans more than one skill or whose owner is unclear; do not use when a single owning skill clearly applies.
lifecycle: tested
confidence: medium
---

# project-skills-orchestrator

## Purpose

Coordinate project workflows by discovering capabilities, routing intent, enforcing ownership boundaries, and composing approved skills.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- User intent, constraints, risk boundaries, and required completion criteria.
- Clarification result from `clarify-the-ask` when the request is ambiguous, conflicting, or high impact.
- Skill and ownership catalog from `skill-inventory`.
- Workflow plan from `workflow-planner`, current execution state from `workflow-state-manager`, and policy decision evidence from `policy-engine`.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Route every new user prompt through `clarify-the-ask` first; when the project configures `askEveryPrompt`, no step is dispatched until the required questions are answered and the stated plan is explicitly confirmed.
2. Resolve clarified intent to candidate skills using the inventory and ownership map.
3. Load authoritative workflow plan and current execution state to determine next executable step.
4. Enforce policy decisions before dispatching any step that is blocked, denied, or approval-gated.
5. Route each eligible step to exactly one owning skill and prevent overlapping ownership claims.
6. Track step outcomes, blocked states, and required approvals to maintain deterministic progression.
7. Emit completion artifacts summarizing executed, skipped, blocked, and pending steps with rationale.

## Validation

- Clarification completed for the current prompt before any step was dispatched.
- Every routed step maps to one owning skill and one policy outcome.
- Orchestration status aligns with current execution state and workflow plan ordering.
- Blocked or approval-wait states are explicit and not reported as complete.
- Completion artifacts are internally consistent and traceable to upstream evidence.

## Outputs

- `reports/workflow-completion.json`
- `reports/workflow-completion.md`

## Failure Behavior

- Fail closed when plan/state/policy artifacts are missing or contradictory.
- Preserve last valid orchestration checkpoint and return explicit resume conditions.
- Never dispatch a step that lacks authoritative ownership or policy allowance.

## Approval Gates

Require explicit approval before dispatching any destructive, external, privileged, irreversible, or scope-expanding workflow step.

## Composition and Dependencies

- clarify-the-ask
- workflow-planner
- skill-inventory
- policy-engine
- workflow-state-manager

## Examples

- Route a validated remediation workflow through review, planning, and gated execution steps.
- Halt orchestration when policy denies a requested operation and publish the blocked path.
