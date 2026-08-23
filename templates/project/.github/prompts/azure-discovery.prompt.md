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

Read the project handoff before discovery. Save the result to `reports/azure-discovery.json` and the readable report to `reports/azure-discovery.md`. Discovery is read-only and must not deploy or mutate Azure resources.
