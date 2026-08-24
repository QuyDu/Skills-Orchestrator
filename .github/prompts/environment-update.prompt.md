---
mode: agent
description: Find available updates for existing VS Code and development tools.
---

# Environment Update

Run the `environment-update` skill. Update existing tools only.

Inventory VS Code extensions, Azure CLI, Bicep, Node.js, PowerShell, and project language tooling. List every available update with current and target versions, source, privilege and restart requirements, and findings. Then ask the user to select `-All` or one numbered update.

Use `-WhatIf` for inventory-only behavior; it is the default. Require confirmation before applying each selected update. Report every success, skip, warning, and error in `reports/environment-update.json` and `reports/environment-update.md`. Do not install missing tools, alter project code, change cloud resources, or capture credentials.
