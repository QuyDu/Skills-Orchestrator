# Audit Findings Review

- Review: `REVIEW-2026-08-19-PSO-100`
- Source: [reports/code-audit-findings.json](code-audit-findings.json) (`AUDIT-2026-08-19-PSO-100`)
- Generated: 2026-08-19

Machine-readable [reports/code-audit-review.json](code-audit-review.json) is authoritative. This is a derived view.

Supersedes `REVIEW-2026-08-19-PSO-083`, whose eleven findings were remediated in this candidate.

## Summary

| Status | Count |
| --- | --- |
| Confirmed | 5 |
| Disputed | 0 |
| Needs more evidence | 0 |
| False positive | 0 |
| **Total** | **5** |

No severity was changed during review.

## For a non-technical reader

The tool works and its own quality gate passes end to end: 45 automated tests, a security scan, a reproducible build, and a verified offline installation. The eleven problems found in the previous audit are fixed and covered by tests.

Five things remain open. **None of them prevents using the tool for authorized internal work.**

1. **The release is not yet signed or independently reviewed.** The checks that enforce this are working correctly and are correctly reporting the gap. Clearing it needs organizational steps — a signing identity, an external reviewer, and pipeline runs on all supported platforms — not code changes.
2. **The tool's judgement about "you already have this" can occasionally be too generous.** If your repository has a short file on a topic, the tool may treat it as full coverage and skip installing its own more detailed standard. It always tells you when it does this, and you can override it.
3. **On very large repositories the language scan stops early.** That is intentional for speed, but it currently does not say so, which could leave you with fewer standards than you expected.
4. **Generated pipelines for languages other than Node rely on whatever the build machine has preinstalled.** A build-machine update could change behavior without any change to your project.
5. **The main program file is large and there is no automatic code-style checker.** This does not affect correctness today; it makes future changes slower to review.

## Findings

| ID | Status | Severity | Confidence | Title |
| --- | --- | --- | --- | --- |
| AUD-0101 | confirmed | medium | high | Release blockers remain open for signing, independent review, and cross-platform evidence |
| AUD-0102 | confirmed | none | high | Equivalence classification can suppress a framework standard that is broader than the project's own |
| AUD-0103 | confirmed | none | high | Stack detection is bounded and can under-report languages in very large repositories |
| AUD-0104 | confirmed | none | high | Generated pipelines for non-Node stacks depend on unpinned runner-provided tooling |
| AUD-0105 | confirmed | none | high | The runtime is a single large module with no automated hygiene tooling |

## Detail

### AUD-0101 — Release blockers remain open

**Status** confirmed · **Severity** medium · **Confidence** high

The gates are implemented correctly and are failing correctly. The build produces an unsigned candidate and refuses to relax the internal distribution policy. What is outstanding is external evidence only the owning organization can supply.

**Risk.** Without a trusted signature a consumer cannot verify that the distribution they received is the one that was built. Without an independent review, the security posture rests entirely on the author's own assessment. Without cross-platform evidence, support for Linux and macOS across all three Node majors is asserted rather than demonstrated.

**Recommended.** Obtain a signing identity and sign the candidate; commission and record an independent security review; publish cross-platform CI evidence; clear each manifest blocker only once its evidence artifact verifies.

**Rejected.** Relaxing the manifest to declare the blockers satisfied would be false.

**Containment.** Keep distribution restricted to authorized internal use and keep the open blockers stated in `README.md` and `SECURITY.md`.

### AUD-0102 — Equivalence classification can be too generous

**Status** confirmed · **Severity** none · **Confidence** high

This is the residual risk of the feature that closed the previous audit's largest finding. Suppression is deliberately conservative: mandatory templates are exempt, every decision is printed with its covering path and recorded in the plan, and `--force-templates` restores installation.

**Root cause.** Equivalence is scored on scope overlap and vocabulary overlap only. Neither reflects how much guidance the existing file actually provides.

**Risk.** A repository can end up with weaker guidance than intended while the plan reports the topic as covered. The failure requires a reviewer to skip reading the covered list — plausible, but not silent.

**Recommended.** Add a coverage-depth signal and downgrade a match to a reported *overlap* rather than a suppression when the project's file is materially thinner.

**Rejected.** Confirming every decision manually does not scale. Report-only reintroduces duplicate governance. Semantic comparison via a model makes planning non-deterministic and network-dependent.

**Containment.** Review the covered list in the dry run before applying to any repository with its own instruction library.

### AUD-0103 — Bounded stack scan is silent about truncation

**Status** confirmed · **Severity** none · **Confidence** high

The bound is a deliberate performance decision and is correct in principle. The defect is that reaching it is invisible: the plan reports a detected stack with no indication the scan stopped early.

**Root cause.** The scan tracks its limits internally but discards that state instead of returning it with the detected tags.

**Recommended.** Record whether either limit was reached, surface a truncated-scan notice, and accept `--stack` on `adopt` so a user can declare what detection missed.

**Containment.** On very large repositories, check the reported detected stack in the dry run before applying.

### AUD-0104 — Generated non-Node pipelines depend on runner-provided tooling

**Status** confirmed · **Severity** none · **Confidence** high

A deliberate trade-off taken during implementation. Emitting official setup actions requires full commit SHAs, and no verified SHA was available for the non-Node setup actions at authoring time. Fabricating one would have been considerably worse.

**Risk.** A runner image update can change a compiler or SDK version with no repository change. Exposure is limited to generated pipelines the user has not yet customized; the repository's own workflows are fully pinned.

**Recommended.** Add verified commit SHAs for each supported stack's official setup action, emit them with an explicit toolchain version, and extend the pinning rule to cover generated workflow content.

**Containment.** Treat the generated pipeline as a starting point and pin the toolchain before relying on it for release gating.

### AUD-0105 — Single large module, no hygiene tooling

**Status** confirmed · **Severity** none · **Confidence** high

The single-file design is a direct consequence of the zero-dependency, registry-free constraint that makes the distribution deployable in restricted environments. That same constraint blocks the usual linting tooling. The cost has grown as features accumulated.

**Risk.** Review and onboarding effort scales with file size rather than change size. Not a correctness risk today, but it raises the cost of every future change.

**Recommended.** Split along existing seams — detection, template planning, transactions, inventory — keeping a single executable entry point, and add a hygiene gate that runs without third-party dependencies or a documented development-only exception.

## Limitations

- Every finding identifier, category, bug type, severity, and confidence value is preserved from the source report; no severity was changed.
- This review supersedes `REVIEW-2026-08-19-PSO-083`, whose eleven findings were remediated in the 1.0.0 candidate.
- Root-cause statements for behavior introduced in this release are informed by direct knowledge of the change and are not independently corroborated.
- No effort estimates are included; sequencing belongs to the remediation plan.
- Resolution options were assessed against repository evidence only, without maintainer roadmap or customer commitments.
