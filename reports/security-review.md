# Security Review

One high-severity hosted supply-chain weakness remains for the P4 candidate.

Main has no branch protection or rulesets. Hosted secret scanning, push protection, dependency alerts/security updates, and private vulnerability reporting are disabled. An identity with write access can therefore place unreviewed source on main without required checks, and several hosted prevention/detection controls will not run.

Local controls remain strong: the built-in scanner and pinned Gitleaks pass, workflow dependencies are commit-pinned, the default workflow token is read-only, and the unsigned candidate's checksums, SBOM, and provenance verify. The dirty candidate has not run remotely, and this review is not the separately signed independent approval required for production release.