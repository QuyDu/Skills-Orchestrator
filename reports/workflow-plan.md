# P4 Continuation Workflow Plan

Generated: 2026-09-11T11:13:13.000Z

## Objective

Continue from the current blocked handoff through a candidate-bound P4 release-assurance decision. This plan does not authorize or execute remediation, external access, signing, publication, deployment, commit, push, or release.

## Current Position

- Branch: `feat/agent-builder-latest`
- Recorded revision: `39c1b62b2cc48f032f5acddc60800572b1523ce9`
- Active milestone: P4 release assurance
- Finding: `AUD-0205`
- Immediate executable step: `STEP-001` recovery analysis
- Current blockers: no distinct qualified reviewer, controlled signer, restricted internal artifact destination, installation-health evidence, tested revocation operation, or production verification
- Important drift: the current execution checkpoint is bound to an older revision and must not be resumed directly

## Ordered Steps

| Step | Owner | Status | Action | Approval |
| --- | --- | --- | --- | --- |
| STEP-001 | `skill:workflow-recovery` | Ready | Reconstruct P4 history and choose a safe restart, resume, or replan route. | No |
| STEP-002 | `skill:change-review` | Planned | Review the bounded current report and plan changes. | No |
| STEP-003 | `skill:prepare-commit` | Planned | Prepare the minimal candidate boundary and checklist. | No |
| STEP-004 | `operator:release-owner` | Planned | Approve and create one clean immutable candidate revision. | Commit and push |
| STEP-005 | `skill:audit-code` | Planned | Audit the exact frozen candidate. | No |
| STEP-006 | `skill:audit-review-findings` | Planned | Review candidate findings without weakening evidence. | No |
| STEP-007 | `skill:audit-plan-remediation` | Planned | Produce and validate the current P4 remediation plan. | No |
| STEP-008 | `skill:architecture-review` | Planned | Refresh operational and release architecture assurance. | No |
| STEP-009 | `skill:security-review` | Planned | Refresh identity, signing, artifact, and revocation assurance. | No |
| STEP-010 | `skill:deployment-review` | Planned | Assess the named restricted internal target without deploying. | No |
| STEP-011 | `operator:governance-owner` | Planned | Assign a distinct qualified reviewer and candidate-bound scope. | Privileged assignment |
| STEP-012 | `operator:security-owner` | Planned | Assign a controlled signer and pinned trust anchor. | Privileged signing assignment |
| STEP-013 | `operator:release-owner` | Planned | Assign the restricted artifact destination, health criteria, and revocation procedure. | External, privileged, publication |
| STEP-014 | `skill:policy-engine` | Planned | Evaluate the exact P4 action set and approval requirements. | No; decisions do not grant approval |
| STEP-015 | `skill:audit-remediation` | Planned | Snapshot the plan, execute the approved P4 phase, and gather candidate-bound evidence. | Phase plus point-of-action approvals |
| STEP-016 | `skill:audit-code` | Planned | Verify whether `AUD-0205` can close. | No |
| STEP-017 | `skill:project-handoff` | Planned | Publish terminal continuity from any completed, blocked, or failed path. | No |

## Phase 1: Recover And Stabilize

### STEP-001: Recovery decision

Reconstruct the event stream and compare the last P4 checkpoint with the current revision and worktree. The step completes only when `reports/recovery-plan.json` and its Markdown view identify the last valid checkpoint, intervening changes, side effects, stop conditions, and one safe route.

If execution history is inconsistent, stop. Do not edit historical events or claim that the old checkpoint is resumable.

### STEP-002: Bounded change review

Review only the continuity, clarification, workflow-plan, and validation-generated evidence changes. Any confirmed high- or critical-severity finding blocks candidate preparation. Corrections return through focused validation and the same bounded review.

### STEP-003: Candidate preparation

Prepare the exact path boundary, current validation evidence, commit summary, and pre-commit checklist. This step performs no commit or push.

### STEP-004: Candidate freeze approval

Stop for fresh explicit approval covering the exact commit and configured branch push. On approval, create one normal commit, push without force or history rewrite, record the exact SHA, and verify a clean worktree. The approval is consumed by that operation and cannot authorize later commits or pushes.

## Phase 2: Refresh Candidate Assurance

Run `audit-code`, `audit-review-findings`, and `audit-plan-remediation` against the same frozen revision. The new remediation plan must be validated and dependency-closed. `audit-remediation` creates the immutable content-addressed snapshot immediately before approved execution. Prior plans and execution records remain historical evidence and are never rewritten.

Refresh architecture and security assurance for that candidate. The reviews must explicitly evaluate:

- separate release, signing, artifact, and review ownership;
- signing-key custody and external trust anchoring;
- restricted artifact access and distribution boundaries;
- installation-health signals and failure detection;
- revocation initiation, propagation, verification, and recovery;
- residual risk when any external control is unknown.

Deployment review then evaluates the named restricted internal target without deploying to it. Missing target, rollback, observability, or current architecture/security evidence produces a blocked decision.

## Phase 3: Satisfy External Prerequisites

Before policy evaluation can authorize or gate P4 execution, the explicit operator gates must provide:

1. A distinct qualified reviewer who did not author or sign the candidate.
2. A controlled signing identity and independently pinned trust anchor.
3. A restricted internal artifact destination with a named owner and access policy.
4. Defined installation-health signals and success/failure thresholds.
5. A revocation procedure that can be exercised without rewriting historical evidence.

These are operator-owned approval gates, not fabricated repository skills. Failure or denial in `STEP-011`, `STEP-012`, or `STEP-013` routes directly to terminal `STEP-017`, which records the remaining blocker.

## Phase 4: Evaluate And Execute P4

In `STEP-014`, `policy-engine` evaluates every proposed action and produces a rule trace. It does not grant approval. Missing context returns blocked or denied and routes to terminal handoff.

`STEP-015` may begin only after explicit phase approval. It first snapshots the validated remediation plan. Separate point-of-action approval remains mandatory for hosted CI or external access, signing, artifact upload or publication, installation testing, revocation testing, commits, pushes, and release.

The execution must bind all of the following to the same commit and candidate digest:

- repository gate and supported-platform CI;
- checksums, SBOM, and provenance;
- trusted signature and pinned verification identity;
- distinct qualified independent review;
- restricted artifact installation-health evidence;
- tested revocation evidence;
- production release verification.

Any denied, failed, stale, missing, or mismatched control leaves P4 blocked.

## Phase 5: Verify And Hand Off

In `STEP-016`, re-audit the exact candidate after successful P4 execution. Close `AUD-0205` only when it is no longer reproducible and every acceptance criterion passes. Otherwise preserve the finding and identify the failed control.

`STEP-017` is the terminal handoff for success, block, or failure from every nonterminal step. Publish the synchronized handoff, Markdown view, and current-work snapshot from the latest valid checkpoint. Remove completed actions from the active resume path, retain incomplete work, mark approvals as consumed where applicable, and identify exactly one next eligible action.

## Checkpoints

| Checkpoint | Meaning |
| --- | --- |
| `CP-P4-RECOVERY-DECISION` | Safe restart, resume, or replan route selected. |
| `CP-P4-CHANGE-REVIEW` | Current bounded changes reviewed. |
| `CP-P4-CANDIDATE-PREPARED` | Candidate boundary ready for approval. |
| `CP-P4-CANDIDATE-FROZEN` | Exact clean candidate revision recorded. |
| `CP-P4-CANDIDATE-AUDITED` | Current candidate audit validated. |
| `CP-P4-FINDINGS-REVIEWED` | Findings review validated. |
| `CP-P4-REMEDIATION-REPLANNED` | Current remediation plan validated; immutable snapshot is deferred to approved execution. |
| `CP-P4-ARCHITECTURE-REVIEWED` | Architecture assurance refreshed. |
| `CP-P4-SECURITY-REVIEWED` | Security assurance refreshed. |
| `CP-P4-DEPLOYMENT-REVIEWED` | Restricted-target readiness evaluated. |
| `CP-P4-REVIEWER-ASSIGNED` | Distinct qualified reviewer and scope assigned. |
| `CP-P4-SIGNER-ASSIGNED` | Controlled signer and trust anchor assigned. |
| `CP-P4-ARTIFACT-CONTROLS-ASSIGNED` | Restricted destination, health criteria, and revocation procedure assigned. |
| `CP-P4-POLICY-EVALUATED` | Exact P4 action set evaluated. |
| `CP-P4-EXECUTION-TERMINAL` | P4 execution completed or safely blocked. |
| `CP-P4-CLOSURE-VERIFIED` | `AUD-0205` closure or continued block verified. |
| `CP-P4-HANDOFF-PUBLISHED` | Final synchronized continuity published. |

## Rollback And Recovery

- Read-only review failures require no repository rollback; preserve the previous valid report and keep P4 blocked.
- Never edit immutable remediation snapshots or accepted execution events.
- Do not rewrite a published candidate revision. Supersede it only through a separately reviewed and approved corrective revision.
- If external side effects partially occur, stop, checkpoint them, update the handoff, and run `workflow-recovery` before retrying.
- If artifact or trust evidence becomes invalid, reinstate blockers, stop distribution, and invoke the tested revocation route.

## Success Decision

P4 passes only when every required control is current, independently verifiable, and bound to the same candidate revision and digest. Otherwise the workflow completes with a blocked handoff naming the failed control and the single next eligible action.