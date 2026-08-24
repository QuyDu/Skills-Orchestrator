---
mode: agent
description: Find and optionally apply updates to existing VS Code and development tools.
---

# Environment Update

Run the `environment-update` skill. Update existing tools only.

1. Inventory installed tools such as VS Code extensions, Azure CLI, Bicep, Node.js, PowerShell, and project language tooling.
2. List all available updates with current version, target version, source, privilege requirement, and restart requirement.
3. Ask the user to select `-All` or one numbered update.
4. Use `-WhatIf` for discovery only; it is the default.
5. Require confirmation before applying each selected update.
6. Report every update, skip, warning, and error in `reports/environment-update.json` and `reports/environment-update.md`.

Do not install missing tools, modify project code, alter cloud resources, or capture credentials.
