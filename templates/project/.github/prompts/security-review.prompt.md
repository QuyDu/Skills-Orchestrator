---
mode: agent
description: Run a security review of the current changes or a named scope and produce severity-ranked findings.
---

# Security Review

Run a security review over the scope the user names. Default to the current working-tree diff.

1. Establish scope and map the trust boundaries it touches.
2. Review for OWASP Top 10 weaknesses, secret exposure, identity and authorization defects, unsafe deserialization, SSRF, injection, and insecure defaults.
3. Check dependency advisories and confirm GitHub Actions are pinned to full commit SHAs.
4. For each finding record: file and line, weakness class, exploitable path, impact, severity, confidence, and the smallest correct fix.
5. Distinguish proven weaknesses from hardening opportunities. Do not inflate severity.
6. List what you could not assess and why.

Write the result through the `security-review` skill to `reports/security-review.json`.

This review is read-only. Do not apply fixes in the same pass; route remediation through `audit-plan-remediation`.
