# Audit Remediation Plan

- Plan: `PLAN-2026-09-11-PSO-126`
- Audit run: `d343d673-dc11-4469-bce4-ccc0681608d1`
- Source review: `reports/code-audit-review.json`
- Source review SHA-256: `d0283d8d25e1d05347366aa5fc1f51cbaafebad480052fb3cfac3ec7887021c4`
- Status: **approval wait**
- Assurance: **insufficient evidence**

Machine-readable `reports/audit-remediation-plan.json` is authoritative. This plan does not execute remediation.

## Phases

| Phase | Goal | Items |
| --- | --- | --- |
| `P1-evidence-validation` | Close audit evidence trust gaps | `REM-0301`, `REM-0302` |
| `P2-record-integrity` | Complete record and digest binding | `REM-0303`, `REM-0304` |

## Prioritized Items

| ID | Finding | Severity | Complexity | Dependencies |
| --- | --- | --- | --- | --- |
| `REM-0301` | `AUD-0301` | medium | medium | none |
| `REM-0302` | `AUD-0302` | medium | high | none |
| `REM-0303` | `AUD-0303` | medium | high | `REM-0301`, `REM-0302` |
| `REM-0304` | `AUD-0304` | none | low | `REM-0301` |

No work items are declared parallel. Dependency and priority order controls execution.

## P1 Evidence Validation

### REM-0301 Validate Immutable Audit Evidence Content

Scope:

- `.github/skills/audit-code/scripts/audit-validate.mjs`
- `schemas/audit-evidence.schema.json`
- `tests/audit-assurance.test.mjs`

Implementation:

1. Invoke the audit-evidence schema during findings validation.
2. Enforce scanner freshness, required scope, helper validity, hosted status, and standards-profile semantics.
3. Add correctly hashed malformed snapshot fixtures.

Acceptance: malformed or incomplete snapshots fail; valid current snapshots pass.

### REM-0302 Canonicalize And Contain Audit Artifact Paths

Scope:

- `.github/skills/audit-code/scripts/audit-validate.mjs`
- `.github/skills/audit-code/scripts/safe-path.mjs`
- `tests/audit-assurance.test.mjs`
- `tests/security-fuzz.test.mjs`

Implementation:

1. Require repository root for findings and plan validation.
2. Canonicalize artifact and parent paths and reject symlinks and non-regular files.
3. Apply repository-owned report-directory containment.
4. Add Windows, Linux, and macOS boundary fixtures.

Acceptance: outside-root and redirected paths fail closed; normal repository artifacts pass on supported platforms.

## P2 Record Integrity

### REM-0303 Bind Verification Records To Immutable Artifacts

Dependencies: `REM-0301`, `REM-0302`.

Scope:

- `schemas/code-audit-findings.schema.json`
- `schemas/audit-findings-review.schema.json`
- `.github/skills/audit-code/scripts/audit-validate.mjs`
- `.github/skills/audit-code/scripts/audit-evidence.mjs`
- `.github/skills/audit-code/scripts/gitleaks-scan.mjs`
- `tests/audit-assurance.test.mjs`
- `tests/adoption-rerun.test.mjs`
- `tests/gitleaks-scan.test.mjs`
- `tests/skill-contracts.test.mjs`

Implementation:

1. Add a content-addressed evidence reference to each verification record.
2. Validate artifact bytes, digest, run, revision, tool, status, and scope.
3. Update producers, schemas, and adoption fixtures.

Acceptance: arbitrary digest records fail; valid immutable records survive findings and review validation.

### REM-0304 Canonicalize Digest Encoding

Dependency: `REM-0301`.

Scope:

- `schemas/code-audit-findings.schema.json`
- `schemas/audit-evidence.schema.json`
- `schemas/gitleaks-scan.schema.json`
- `.github/skills/audit-code/scripts/audit-validate.mjs`
- `.github/skills/audit-code/scripts/audit-evidence.mjs`
- `.github/skills/audit-code/scripts/gitleaks-scan.mjs`
- `tests/audit-assurance.test.mjs`
- `tests/gitleaks-scan.test.mjs`

Implementation:

1. Select canonical lowercase digest encoding.
2. Align schema patterns, writers, and comparisons.
3. Add mixed-case regression fixtures.

Acceptance: schema and semantic validators agree; canonical writers emit lowercase digests.

## Validation And Rollback

For every item, run focused audit assurance and execution tests followed by `npm run check`. Version contracts and validate current and historical fixtures before rollout. Revert schema, producer, validator, and fixture changes as one unit if compatibility validation fails.

Every item requires explicit approval because it changes the governed `audit-code` skill or contract surfaces. Historical artifacts remain readable under their original schema versions.

## Limitations

- This plan does not execute remediation.
- Skill-update approval is required before changing `audit-code`.
- External, destructive, deployment, publication, commit, and push actions remain separately approval-gated.