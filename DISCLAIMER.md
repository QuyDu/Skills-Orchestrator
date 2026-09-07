# Security and Use Disclaimer

Project Orchestrator is provided subject to the terms in [LICENSE](LICENSE). This notice supplements, and does not replace, modify, or expand those terms. It does not grant permission to use, copy, modify, publish, distribute, or provide the software to any person who is not authorized under the license.

## Security Efforts

Reasonable efforts have been made to design, develop, test, and document this software using secure-engineering practices. The project includes automated tests, security scanning, secret detection, dependency controls, integrity checks, approval gates, and fail-closed behavior for identified trust boundaries.

These measures reduce risk but do not guarantee that the software is free from vulnerabilities, defects, malicious dependencies, configuration errors, compatibility problems, data-loss conditions, or other unintended behavior. Security controls and threat information also change over time, so prior test or review results may no longer be current.

## Use at Your Own Risk

Use of this software is at the user's own risk and remains subject to all organizational policies, approvals, and applicable laws. Before use, each user and organization should perform an independent security, privacy, legal, compliance, architecture, and operational review appropriate to the intended environment and sensitivity of the affected data and systems.

At a minimum, users should:

- obtain the software from an authorized and trusted source;
- review the source, instructions, scripts, dependencies, configuration, and proposed changes;
- verify available checksums, provenance, signatures, and current security-scan results;
- run `npm run check` and resolve any failure before use;
- use a maintained supported runtime and operate without elevated privileges;
- begin with dry-run behavior and test in a disposable or non-production environment;
- maintain independent, tested backups and version-control recovery points;
- protect credentials and sensitive data, and grant only the minimum required access;
- obtain qualified security and legal advice when the intended use warrants it; and
- independently determine whether the software and its outputs are suitable for the intended purpose.

Do not rely on this software, its reports, or its automated checks as the sole basis for a security, compliance, legal, deployment, or production-readiness decision. Risk acceptance does not bypass a failed check, approval gate, release requirement, or organizational control.

## Reporting Security Concerns

Do not disclose suspected vulnerabilities in a public issue. Follow the private reporting process in [SECURITY.md](SECURITY.md) and stop using affected functionality until the concern has been assessed.

## No Legal Advice

This document provides a project-use notice and is not legal advice. The repository owner should have qualified legal counsel review this notice, the license, and the intended distribution model before providing the software to additional users or organizations.