# Threat Model

## Scope

This model covers GitHub cloning, local project creation, inspection, adoption, validation, journaling, rollback, and recovery. The product package is a trusted input only after checksum and provenance verification. The remote repository and target repository files, metadata, links, configuration, and agent instructions are untrusted inputs.

## Assets And Trust Boundaries

- Project-owned source, instructions, configuration, credentials, and version-control history must not be changed outside reviewed managed paths.
- Framework packages, schemas, manifests, journals, backups, hashes, and validation evidence require integrity protection.
- Boundaries exist between the installed product and target repository, plan and apply, process and filesystem, package and agent platform, and local execution and external systems.

## Threats And Controls

| Threat | Control | Residual risk |
| --- | --- | --- |
| Path traversal or Windows device paths | Canonical root, strict relative-path validation, reserved-name rejection | Filesystem behavior must remain covered on every supported OS. |
| Symbolic-link or junction escape | Component-by-component `lstat` checks at plan and apply; package links rejected; release/report writers serialized and paths rechecked at mutation boundaries | A malicious same-user process may still race filesystem operations between checks. Portable Node lacks handle-relative no-follow APIs on every supported OS. Run only from a protected workspace under a trusted local account. |
| Stale plan overwrites newer work | SHA-256 destination states revalidated while holding the adoption lock | The current CLI builds and applies in one process; future saved-plan APIs require signed or digest-bound plans. |
| Concurrent writers | Exclusive `wx` lock with process and transaction identity | PID reuse causes conservative recovery refusal and may require manual review. |
| Partial write or validation failure | Persistent pre-write journal, backups, automatic reverse restoration, explicit recovery | Abrupt storage failure can damage both destination and local backup; retain an independent repository backup. |
| Malicious recovery journal | Strict journal identity, root, field, relative path, backup prefix, and symlink checks | Journals are not yet cryptographically authenticated against same-user tampering. |
| Malicious or misdirected clone source | Only exact GitHub HTTPS and SSH forms without embedded credentials are accepted; clone arguments bypass shell parsing; submodules and repository commands are not executed | Git, global Git configuration, credential helpers, network transport, and the remote host remain external trust dependencies. |
| Partial remote provisioning | Clone and adoption occur in a unique sibling staging directory; the final destination is published by rename only after verification | A failed adoption may preserve staging for journal recovery and requires operator cleanup after review. |
| Support-file adoption overwrites project guidance | Existing Copilot and `AGENTS.md` text is preserved; routing is appended only when absent; existing VS Code extension and settings files are not rewritten | Existing project instructions may conflict with framework routing and require human resolution. |
| Clarification limit causes unsafe assumptions | Questions are evidence-driven, bounded per round, and material ambiguity blocks planning independently of the numeric limit | Agent-platform compliance is prompt-mediated; users must review the clarification result before high-impact work. |
| Clarification captures secrets | The skill forbids requesting secrets through agent-visible input and remains read-only | Users may still volunteer sensitive data; platform and operator redaction controls remain necessary. |
| Compromised framework package | Distribution verification, package-asset link rejection, release signing/SBOM/provenance gate | Development source snapshots are not signed release artifacts. |
| Project command execution during inspection | Inspection and planning do not execute detected project commands | Approved future stack validation must display commands as data before execution. |
| Agent performs privileged or external action | Installed policy requires explicit approval classes and least privilege | Agent-platform enforcement varies; users must review tool permissions and prompts. |
| Sensitive path or secret disclosure | Plans should contain project-relative paths and no file contents unless required | Current console output includes the canonical project root; redaction is required before sharing logs. |

## Security Invariants

1. Dry-run does not mutate the target repository.
2. Apply does not begin without explicit approval, an exclusive lock, safe managed paths, and unchanged destination states.
3. No managed read, write, backup, or recovery destination may escape its canonical root.
4. Validation failure never commits a successful manifest or verification record.
5. Project-owned content outside declared managed paths remains byte-identical.
6. Recovery refuses a lock whose owner may still be alive and restores only journaled entries.
7. The tool never requests elevation or silently executes repository-provided commands.
8. Root and VS Code recovery targets are limited to `AGENTS.md`, `.vscode/extensions.json`, and `.vscode/settings.json`; other support paths fail closed.
9. Clarification question limits never authorize proceeding through unresolved material ambiguity.
10. Remote provisioning never overwrites an existing destination or publishes an unverified clone.

## Review Triggers

Update and independently review this model when adding dependencies, remote registries, archive extraction, network access, new platform or CI adapters, saved plans, plugin execution, telemetry, cryptography, or any new write location.