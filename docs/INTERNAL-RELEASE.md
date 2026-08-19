# Internal Release Process

Skills Orchestrator is licensed and configured for authorized internal use only. Public registry publication and third-party distribution are prohibited without new legal, security, and owner approval.

## Preconditions

- Work from a committed revision with a clean worktree.
- Use a maintained Node.js 22, 24, or 26 release without elevation.
- Run the pinned GitHub workflows for the exact release commit.
- Download `cross-platform-ci-evidence.json` from the successful security-validation workflow into `reports/`.
- Download the `codeql-sarif-COMMIT` artifact from the successful CodeQL workflow and preserve it with review evidence. Private repositories without GitHub Code Security retain SARIF as a workflow artifact instead of uploading it to code scanning.
- Provision an organization-controlled signing identity outside this repository.
- Appoint a qualified reviewer who did not author the release changes.

## Build And Candidate Verification

```powershell
npm run check
npm run release
npm run release:verify:candidate
```

The candidate is written under `dist/project-skills-orchestrator-VERSION/` and contains the standalone distribution, restricted package, payload checksums, final checksums, CycloneDX SBOM, SLSA-format provenance statement, and release contract. Candidate verification rejects stale source bytes, links, missing files, unexpected files, and checksum mismatches.

## Signing

Sign the exact bytes of `SHA256SUMS` with the approved organizational signing service. Store detached evidence as `release-signature.json` using `schemas/release-signature.schema.json`. Configure the independently distributed SHA-256 fingerprint of the trusted public key as `PSO_TRUSTED_SIGNING_KEY_SHA256` when verifying. Never place a private key, certificate password, token, or HSM credential in this repository, command history, logs, or release directory.

The signature evidence identifies the signer, algorithm, signing time, public verification key, signed artifact, and base64 signature. Key provisioning, custody, rotation, revocation, and authorization remain organization-owned controls.

## Independent Review

The independent reviewer must inspect the exact candidate bound by the SHA-256 digest of `SHA256SUMS`, review security scan and the commit-bound CodeQL SARIF artifact, confirm the threat model, exercise recovery and package installation, and resolve all critical/high findings. Record and sign the decision in `independent-review.json` using `schemas/independent-review.schema.json`. Configure the independently distributed reviewer public-key fingerprint as `PSO_TRUSTED_REVIEW_KEY_SHA256` when verifying.

Authorship and review must be performed by different people. A generated or self-approved review does not satisfy this gate.

## Final Verification

```powershell
npm run release:verify
npm run release:status
```

Both commands must exit successfully. `release:status` writes `reports/release-readiness.json`. Distribution is prohibited unless its status is `production-ready` and every check is `passed` for the same committed revision and candidate digest.

## Internal Distribution

Publish only to the approved restricted internal package registry or internal artifact store. Preserve checksums, SBOM, provenance, signature, review evidence, CI evidence, source revision, and readiness report for the organization's required retention period. Apply least-privilege access and prevent anonymous or public reads.

## Revocation

For a suspected compromise or material defect, stop distribution, revoke the artifact in the internal registry, preserve evidence, notify security response owners, rotate compromised signing credentials, and publish a replacement only after completing the full release process again.
