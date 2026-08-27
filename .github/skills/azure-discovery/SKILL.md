---
name: azure-discovery
description: Discover Azure Commercial or Azure US Government service and model availability for the current project, persist dated results, and identify when a refresh is needed.
lifecycle: tested
confidence: medium
---

# azure-discovery

## Purpose

Resolve and persist the project's Azure environment once, establish the matching Azure CLI context automatically, then discover services, regions, models, SKUs, API versions, and nonsecret Speech-resource readiness in Azure Commercial or Azure US Government.

## Preconditions

- Read repository instructions and the current project handoff first.
- Read `reports/azure-discovery.json` and `reports/azure-discovery.md` when present.
- Read `.azure/environment.json` when present and reuse it without asking for the cloud, subscription, MCP policy, or login again.
- Confirm Azure CLI is installed. When its context is absent or mismatched, start the authentication method recorded in the local profile rather than asking whether to log in.
- Never request or record credentials or tokens. Tenant, subscription, and OAuth client IDs are nonsecret identifiers and may exist only in the ignored local profile, never in discovery reports or distributable templates.

## Inputs

- Optional `-Commercial` or `-Gov` selection. An explicit flag updates the local profile; persisted configuration is next in precedence; a missing profile defaults to Azure Commercial.
- Optional target location and preferred model.
- One-time environment name, subscription target, authentication method, and Azure MCP service selection when the local profile does not exist.

## Approved Tools and Resources

- The packaged `.github/skills/azure-discovery/scripts/azure-environment.ps1` and `azure-discovery.ps1`. `infra/azure-environment.ps1` and `infra/discover.ps1` remain compatible project-infrastructure copies when present.
- Azure CLI read-only discovery commands.
- Existing project reports and configuration.

## Read and Write Boundaries

- Read Azure subscription metadata, service availability, and Speech-capable account kinds and regions. Persist public account identifiers only in ignored `.azure/environment.json`; discovery reports must not contain them.
- Update `.vscode/settings.json` so Azure MCP sampling and namespaces match the recorded profile. MCP is disabled until the project opts in, and `foundryextensions` remains excluded unless a client ID is already recorded.
- Write `reports/azure-discovery.json` and the readable `reports/azure-discovery.md`.
- Never deploy resources, change Azure state, or write secrets.

## Procedure

1. Read `.azure/environment.json`. If it is missing, collect the Azure cloud, environment name, default region, subscription target, authentication method, and Azure MCP namespaces during the initial project questions, then initialize the profile. Use Azure Commercial for an omitted cloud.
2. Apply cloud precedence deterministically: explicit `-Gov` or `-Commercial`, then persisted profile, then Azure Commercial. Never ask again after the profile exists unless reconfiguration is explicitly requested.
3. Keep Azure MCP disabled by default. If enabled, write the selected namespaces to workspace settings. Exclude `foundryextensions` until its nonsecret OAuth client ID is recorded, avoiding VS Code's unsupported dynamic-registration prompt.
4. Select the profile's Azure CLI cloud. When no matching account is active, immediately start the recorded login method; interactive login uses device code in the selected cloud. Select the recorded subscription after login.
5. Dot-source `.github/skills/azure-discovery/scripts/azure-discovery.ps1` and invoke `Invoke-AzureDiscovery` with the resolved cloud, location, and optional model preference. Enumerate only the kind and region of existing `SpeechServices`, `AIServices`, or `CognitiveServices` accounts.
6. Persist the JSON result and readable Markdown report, including the UTC `discoveredAt` timestamp, Speech query certainty, count, kinds, and regions. Keep account identifiers out of both reports.

## Validation

- The selected cloud is `AzureCloud` or `AzureUSGovernment`.
- `.azure/environment.json` validates against `schemas/azure-environment.schema.json`, is excluded from source control, and contains no secret values.
- Both report files exist and contain the same discovery timestamp and cloud.
- The JSON report validates against `schemas/azure-discovery.schema.json` and contains no resource name, resource ID, subscription ID, tenant ID, key, or token.
- Discovery failures are reported as unknown or unavailable according to the script output.
- A report older than 14 days is identified as stale before relying on it.

## Outputs

- `reports/azure-discovery.json`
- `reports/azure-discovery.md`
- `.azure/environment.json` (ignored local state)

## Failure Behavior

- Fail closed when the profile is invalid or the requested cloud, tenant, or subscription cannot be selected.
- Surface the Azure CLI login process directly when user interaction is required; do not replace it with repeated login questions.
- Treat unavailable Azure queries as discovery uncertainty and preserve the diagnostic output.
- Never claim deployment readiness from discovery alone.

## Approval Gates

Discovery is read-only and does not require deployment approval. Any deployment or external mutation requires its normal explicit approval gate.

## Composition and Dependencies

- project-handoff

## Examples

- `/azure-discovery -Commercial`
- `/azure-discovery -Gov`
- `/azure-discovery` uses the saved profile or initializes an Azure Commercial profile when no cloud was selected.
