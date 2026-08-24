---
mode: agent
description: Inspect and safely clean up Azure resources for the current project.
---

# Azure Cleanup

Run the `azure-cleanup` skill. Default to `-WhatIf` and list every resource and finding before any deletion.

Options:

- `-All -SiteName "name"` targets the verified project resource group `rg-<SiteName>` and its resources.
- `-Resource "name" -RG "name"` targets one exact resource.
- `-RG "name"` targets a named resource group.
- `-Commercial` selects Azure Commercial.
- `-Gov` selects Azure US Government.
- With neither cloud parameter, ask `1. Commercial` or `2. Gov`; accept only `1` or `2`, retry three times, then exit with an error.
- `-WhatIf` performs discovery only and is the default.

Before a destructive operation, display the subscription, cloud, resource group, exact resources, and findings, then ask for explicit confirmation. Record all results in `reports/azure-cleanup.json` and `reports/azure-cleanup.md`.
