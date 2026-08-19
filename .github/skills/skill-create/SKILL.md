---
name: skill-create
description: Create or update concise, composable skill packages with valid metadata, bounded tools, ownership, validation, dependencies, and examples. Use to author or revise a skill contract; do not use to invoke an existing skill.
lifecycle: draft
confidence: low
---

# skill-create

## Purpose

Create or update concise, composable skill packages with valid metadata, bounded tools, ownership, validation, dependencies, and examples.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Target skill ID, capability description, ownership intent, and allowed tool boundary.
- Existing inventory and dependency evidence from `skill-inventory` and `skill-dependency-manager`.
- Required schemas, conventions, and repository instruction constraints for skill contracts.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Confirm whether the request is create, update, or deprecate metadata for an existing skill ID.
2. Validate that frontmatter name exactly matches directory ID and remains lowercase kebab-case.
3. Define or refine contract sections: purpose, authoritative inputs, deterministic procedure, validation, failure behavior, approval gates, and examples.
4. Ensure dependencies include only existing skill IDs that are required as authoritative inputs.
5. Verify output ownership boundaries and remove ambiguous ownership claims.
6. Apply minimal edits to skill package files while preserving established public IDs.
7. Re-check contract completeness and dependency acyclicity evidence after updates.

## Validation

- Updated skill contract is complete, internally consistent, and executable without placeholder language.
- Declared dependencies resolve to existing skills and are acyclic.
- Ownership and mutation boundaries are explicit and non-conflicting.
- Any unresolved contract ambiguity is recorded as blocked work, not silently accepted.

## Outputs

- No dedicated report; the created or updated skill package is the output.

## Failure Behavior

- Fail closed when requested ownership or dependency claims conflict with existing contracts.
- Preserve unchanged skills when validation fails and report exact blocking defects.
- Never publish a partially defined skill as complete.

## Approval Gates

Require explicit approval before publishing or installing skills outside the local repository.

## Composition and Dependencies

- skill-inventory
- skill-dependency-manager

## Examples

- Create a new skill contract for a bounded reporting capability with explicit ownership and validation criteria.
- Update an existing skill's dependencies after verifying authoritative artifact usage.
