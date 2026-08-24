---
mode: agent
description: Inspect and safely clean up Azure resources for a project.
---

# Azure Cleanup

Run the `azure-cleanup` skill. Default to `-WhatIf` and list all resources and findings before deletion.

Use `-All -SiteName "name"` for the verified project resource group, `-Resource "name" -RG "name"` for one exact resource, or `-ResourceGroup "name"` for a named group. Use `-Commercial` or `-Gov`; without either, ask `1. Commercial` or `2. Gov` and accept only those numbers.

Destructive cleanup requires `-Apply`, display of the exact subscription/cloud/target/resources, and the user typing `DELETE`. Record results and errors in the project's cleanup reports. Never delete based on a name match alone.
