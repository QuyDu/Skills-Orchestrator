# Audit Remediation Plan

- Plan: `PLAN-2026-08-19-PSO-110`
- Source: [reports/code-audit-review.json](code-audit-review.json) (`REVIEW-2026-08-19-PSO-110`)
- Generated: 2026-08-19

Machine-readable [reports/audit-remediation-plan.json](audit-remediation-plan.json) is authoritative. This is a derived view.

**This plan does not execute any remediation work.** Each item requires its own implementation pass and verification run.

**No finding in this plan blocks use of the 1.0.0 candidate for authorized internal work.**

## Prioritization basis

Prerequisite → security severity → user impact → exploitability → confidence → remediation cost.

## Milestones

| Milestone | Goal | Items |
| --- | --- | --- |
| **M1** | Clear the release assurance blockers | REM-0101 |
| **M2** | Make automated classification decisions visible and correctable | REM-0102, REM-0103 |
| **M3** | Extend pinning to generated pipelines and reduce maintenance cost | REM-0104, REM-0105 |

## Items

| ID | Pri | Severity | Owner | Title | Approval |
| --- | --- | --- | --- | --- | --- |
| REM-0101 | 1 | medium | Release owner | Sign the release, obtain independent review, publish cross-platform evidence | Required |
| REM-0102 | 2 | none | Runtime engineer | Distinguish genuine coverage from shallow overlap | No |
| REM-0103 | 3 | none | Runtime engineer | Report truncated stack scans and accept `--stack` on adopt | No |
| REM-0104 | 4 | none | Security engineer | Pin setup actions and toolchain versions in generated pipelines | No |
| REM-0105 | 5 | none | Framework maintainer | Decompose the runtime and add a dependency-free hygiene gate | No |

REM-0102 and REM-0103 may proceed concurrently, as may REM-0104 and REM-0105.

---

### REM-0101 — Sign the release, obtain independent review, publish cross-platform evidence

**Fixes** AUD-0101 · **Severity** medium · **Approval required** (signing key custody, external publication)

**Steps**

1. Provision a trusted signing identity and record its public key fingerprint outside the repository.
2. Sign the release candidate and verify with `npm run release:verify`.
3. Commission an independent security review and record its signed result against the reviewed scope.
4. Run the cross-platform workflow on Windows, Linux, and macOS for Node 22, 24, and 26 and publish the aggregated evidence.
5. Clear each blocker in `release/release-manifest.json` only after its evidence artifact verifies.

**Acceptance.** `npm run release:verify` passes against a signed candidate; `reports/cross-platform-ci-evidence.json` covers every required OS and Node major; the manifest lists no remaining blockers; `SECURITY.md` and `README.md` describe achieved assurance rather than pending work.

**Rollout.** Each blocker clears independently; no runtime change. **Rollback.** Reinstate the blocker; tooling already fails closed.

**Residual risk.** Signing keys require ongoing custody and rotation discipline.

### REM-0102 — Distinguish genuine coverage from shallow overlap

**Fixes** AUD-0102 · **Severity** none

**Steps**

1. Add a coverage-depth signal such as relative content length or checklist-item count.
2. Introduce an `overlap` classification that is reported but does not suppress installation.
3. Downgrade a match to `overlap` when the project's file is materially thinner than the framework template.
4. Print overlap and coverage separately in the adoption summary and record both in the plan.
5. Add fixtures for a thin existing instruction and a comprehensive one.

**Acceptance.** A single-line existing instruction produces an overlap report and the framework template is still installed; a comprehensive one still suppresses; both classifications appear separately; `--force-templates` continues to install regardless.

**Rollout.** Ship the overlap classification and reporting before changing what is suppressed. **Rollback.** Restore the current threshold; templates are only created when absent, so no existing project is affected.

**Residual risk.** Any depth heuristic can misjudge a concise but complete standard.

### REM-0103 — Report truncated stack scans and accept a declared stack on adopt

**Fixes** AUD-0103 · **Severity** none

**Steps**

1. Return whether the depth limit or entry cap was reached alongside the detected tags.
2. Record the truncation state in the adoption plan and print it in the summary.
3. Accept `--stack` on the `adopt` command and union it with detected tags.
4. Add a fixture that exceeds the entry cap and assert the truncation notice appears.

**Acceptance.** A repository exceeding the cap reports a truncated scan; a normal repository reports a complete scan; a declared stack installs the corresponding instruction files regardless of detection.

**Rollout.** Additive reporting first, then the adopt-side override. **Rollback.** Remove the notice and the option.

**Residual risk.** Repositories that legitimately exceed the cap see the notice on every run.

### REM-0104 — Pin setup actions and toolchain versions in generated pipelines

**Fixes** AUD-0104 · **Severity** none

**Steps**

1. Verify the current commit SHA of the official setup action for each supported stack.
2. Emit the pinned action together with an explicit toolchain version.
3. Extend the template pinning rule so generated workflow content is checked with the same standard.
4. Assert in tests that every generated workflow pins both the action and the toolchain version.

**Acceptance.** Every generated workflow references only SHA-pinned actions; each stack pins an explicit toolchain version; the rule fails on a deliberately unpinned generated workflow.

**Rollout.** One stack at a time as each SHA is verified; unverified stacks keep current behavior. **Rollback.** Fall back to the runner-provided invocation.

**Residual risk.** Pinned action SHAs require deliberate maintenance to receive upstream fixes.

### REM-0105 — Decompose the runtime and add a dependency-free hygiene gate

**Fixes** AUD-0105 · **Severity** none

**Steps**

1. Split along existing seams: detection, template planning, transactions, verification, inventory, CLI.
2. Keep `pso.mjs` as the single executable entry point and update the shipped file list.
3. Add a hygiene gate that runs without third-party dependencies, or record a documented development-only exception to the zero-dependency rule.
4. Refactor in small steps, running `npm run check` after each.

**Acceptance.** Each module has a single stated responsibility; `pso.mjs` remains directly executable and the packaged distribution still installs offline; `npm run check` passes with no behavior change; the hygiene gate fails on a seeded violation.

**Rollout.** Incremental, one seam at a time, each step independently revertible. **Rollback.** Revert the affected step; the entry point contract does not change.

**Residual risk.** A dependency-free hygiene gate is necessarily less capable than an established linter.

## Limitations

- Ordering reflects security severity and user impact; no calendar dates or effort estimates are included.
- REM-0101 is the only item requiring approval and the only one depending on organizational process rather than code.
- Items sharing a parallel group have no ordering constraint between them.
- No finding from this audit blocks use of the 1.0.0 candidate for authorized internal work.
- This plan does not execute any remediation work.
