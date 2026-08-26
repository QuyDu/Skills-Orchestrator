---
mode: agent
description: Discover Azure Commercial or Government services and models and save dated project reports.
---

# Azure Discovery

Run the `azure-discovery` skill.

Optional parameters:

- `-Commercial` selects Azure Commercial.
- `-Gov` selects Azure US Government.
- With neither parameter, ask the user to choose exactly `1. Commercial` or `2. Gov`.
- Accept only `1` or `2`; retry invalid input three times, then report an error and exit.

Read the project handoff before discovery. Save the result to `reports/azure-discovery.json` and the readable report to `reports/azure-discovery.md`. Include Speech service regions and only the count, kinds, and regions of existing Speech-capable resources. Discovery is read-only, must not persist resource names or identifiers, and must not retrieve keys, deploy, or mutate Azure resources.

Dot-source `.github/skills/azure-discovery/scripts/azure-discovery.ps1`; do not depend on a project-owned `infra/discover.ps1` being present or current.
