---
name: audit-code
description: Perform a complete, read-only repository audit for security, correctness, resource management, performance, dependencies, tests, architecture, and maintainability with structured evidence. Use for a whole-repository assessment; use change-review for a bounded diff and security-review for a security-only pass.
lifecycle: tested
confidence: medium
---

# audit-code

## Purpose

Perform a complete, read-only repository audit for security, correctness, resource management, performance, dependencies, tests, architecture, and maintainability with structured evidence.

## Preconditions

- Read repository instructions and applicable configuration.
- Inspect authoritative existing artifacts before replacing derived views.
- Verify that this skill owns the requested decision or output.

## Inputs

- Audit scope, exclusions, target revision, and user constraints.
- Repository instructions, source, configuration, manifests, lock files, tests, and existing diagnostics.
- Applicable Microsoft guidance and authoritative industry standards available during the audit.

## Approved Tools and Resources

- Use read-only repository inspection by default.
- Use deterministic scripts and schema validators when provided.
- Use mutating tools only within the approved workflow boundary.

## Read and Write Boundaries

- Write only the owned reports listed below.
- Never rewrite accepted event-stream records.
- Do not silently mutate source, infrastructure, external systems, or unrelated artifacts.

## Procedure

1. Record the exact scope, revision, exclusions, available tools, and checks that cannot be run.
2. Identify the languages, frameworks, trust boundaries, data flows, dependencies, deployment surfaces, and repository-specific instructions.
3. Run applicable read-only builds, tests, linters, formatters in check mode, type checks, dependency checks, secret scanners, static analyzers, and security analyzers; preserve command, tool version, status, and exit code.
4. Complete every applicable audit area below and record its status and evidence in the report coverage matrix:
	- Security: authentication, authorization, input validation, injection, secrets, cryptography, sensitive data, unsafe deserialization, path handling, request forgery, supply chain, and trust-boundary violations.
	- Correctness and reliability: control flow, error handling, nullability, edge cases, races, deadlocks, async misuse, cancellation, retries, idempotency, transaction boundaries, and recovery behavior.
	- Resource management: memory retention and leaks, unbounded collections or caches, event/listener leaks, stream/socket/file/handle disposal, connection lifetime, thread/task leaks, and language-specific cleanup such as C# `using`, `await using`, `IDisposable`, and `IAsyncDisposable`.
	- Performance: algorithmic complexity, blocking operations, repeated I/O, allocation pressure, unnecessary serialization, query patterns, batching, caching, and hot-path risks. Do not claim a performance defect without static evidence or measurement.
	- Dependencies and configuration: vulnerable, stale, duplicate, unused, or unpinned dependencies; lock-file integrity; insecure defaults; environment drift; and unsupported runtimes.
	- Code hygiene: unused, duplicate, wildcard, misplaced, or missing imports and C# `using` directives; unreachable code; warnings; inconsistent nullability; dead code; and generated artifacts committed incorrectly.
	- Design and maintainability: oversized or multi-responsibility methods/classes, excessive complexity or nesting, duplication, tight coupling, poor cohesion, abstraction leaks, unclear naming, testability barriers, and concrete refactoring opportunities. Recommend extraction or decomposition only when evidence identifies a responsibility boundary and expected benefit.
	- Tests and operability: missing coverage for critical behavior, brittle tests, nondeterminism, unsafe test data, observability gaps, logging defects, health checks, diagnostics, accessibility, privacy, and deployment/runtime failure modes.
5. Follow repository call paths and data flows far enough to establish root cause and blast radius; do not report isolated syntax observations without behavioral context.
6. Create one finding per independently remediable root cause. Assign a stable `AUD-####` ID, category, bug type, evidence locations, observed behavior, expected behavior, impact, likelihood, confidence, and security classification.
7. Use `critical`, `high`, `medium`, `low`, or `none` for security severity. Include CVSS and CWE only when supported by evidence; never inflate code quality, maintainability, or performance concerns into vulnerabilities.
8. Describe a concrete resolution direction, verification criteria, and authoritative Microsoft and industry references when applicable. Distinguish required fixes from optional improvements and verified facts from assumptions.
9. Deduplicate findings by root cause while retaining every affected location. Record limitations, skipped or blocked coverage, and cleanly report an empty findings array when no issues are substantiated.
10. Validate `reports/code-audit-findings.json` against `schemas/code-audit-findings.schema.json` before completion, then invoke `audit-review-findings` when a reviewed report is requested or required by the workflow.

## Validation

- Every finding has a unique ID, reproducible evidence, bug type, confidence, impact, resolution direction, and verification criteria.
- Every required audit area has a coverage entry with `completed`, `partial`, `blocked`, `not-applicable`, or `failed`; `completed` entries cite evidence, and all other statuses explain why coverage is incomplete.
- Security findings include a justified severity; non-security findings use `securitySeverity: none`.
- Referenced files and line numbers exist at the audited revision, and commands include exit status.
- Resource-leak, disposal, import/using, refactoring, complexity, and oversized-method checks are explicitly represented in coverage even when they produce no findings.
- The report records skipped, blocked, degraded, and failed checks without presenting them as passed.
- The JSON validates against `schemas/code-audit-findings.schema.json` and is consumable by `audit-review-findings`.

## Outputs

- `reports/code-audit-findings.json`

## Failure Behavior

- Fail closed when authority, evidence, schema compatibility, or approval is missing.
- Preserve valid partial artifacts and identify a safe resume or recovery point.
- Never report success for blocked or unvalidated work.

## Approval Gates

The audit is read-only. Obtain explicit approval before external environment access, privileged scanning, source mutation, or scope expansion.

## Composition and Dependencies

- None

## Examples

- Audit a .NET repository for security defects, incorrect `using`/disposal patterns, async and cancellation errors, memory retention, dependency risk, unused directives, oversized methods, and missing tests.
- Audit a JavaScript, Python, Java, Go, or mixed-language repository using equivalent language-specific analyzers and resource-lifetime rules.
- Produce an empty findings array only after recording completed coverage and limitations for every applicable audit area.
