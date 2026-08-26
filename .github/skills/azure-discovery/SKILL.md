---
name: azure-discovery
description: Discover Azure Commercial or Azure US Government service and model availability for the current project, persist dated results, and identify when a refresh is needed.
lifecycle: tested
confidence: medium
---

# azure-discovery

## Purpose

Discover the services, regions, models, SKUs, API version, and nonsecret existing Speech-resource readiness available to the project in Azure Commercial or Azure US Government, then persist the result for later agent sessions.

## Preconditions

- Read repository instructions and the current project handoff first.
- Read `reports/azure-discovery.json` and `reports/azure-discovery.md` when present.
- Confirm Azure CLI is installed and the user is signed in with `az login`.
- Do not request or record credentials, tokens, subscription IDs, or tenant IDs.

## Inputs

- Optional `-Commercial` or `-Gov` selection.
- Optional target location and preferred model.
- The current Azure CLI subscription and cloud context.

## Approved Tools and Resources

- The packaged `.github/skills/azure-discovery/scripts/azure-discovery.ps1` and its `Invoke-AzureDiscovery` function. `infra/discover.ps1` remains a compatible project-infrastructure copy when present.
- Azure CLI read-only discovery commands.
- Existing project reports and configuration.

## Read and Write Boundaries

- Read Azure subscription metadata, service availability, and Speech-capable account kinds and regions only; must not persist account names or resource identifiers.
- Write `reports/azure-discovery.json` and the readable `reports/azure-discovery.md`.
- Never deploy resources, change Azure state, or write secrets.

## Procedure

1. If the user supplied `-Commercial` or `-Gov`, use that cloud. Otherwise ask exactly: `1. Commercial` and `2. Gov`.
2. Accept only the number `1` or `2`; ask again for invalid input, up to three attempts total.
3. After three invalid responses, report an error and exit the skill.
4. Verify the active Azure CLI cloud matches the selected cloud.
5. Dot-source `.github/skills/azure-discovery/scripts/azure-discovery.ps1` and invoke `Invoke-AzureDiscovery` with the selected cloud, location, and optional model preference. Enumerate only the kind and region of existing `SpeechServices`, `AIServices`, or `CognitiveServices` accounts.
6. Persist the JSON result and readable Markdown report, including the UTC `discoveredAt` timestamp, Speech query certainty, count, kinds, and regions.

## Validation

- The selected cloud is `AzureCloud` or `AzureUSGovernment`.
- Both report files exist and contain the same discovery timestamp and cloud.
- The JSON report validates against `schemas/azure-discovery.schema.json` and contains no resource name, resource ID, subscription ID, tenant ID, key, or token.
- Discovery failures are reported as unknown or unavailable according to the script output.
- A report older than 14 days is identified as stale before relying on it.

## Outputs

- `reports/azure-discovery.json`
- `reports/azure-discovery.md`

## Failure Behavior

- Stop after three invalid cloud selections.
- Fail closed when the active Azure CLI cloud does not match the requested cloud.
- Treat unavailable Azure queries as discovery uncertainty and preserve the diagnostic output.
- Never claim deployment readiness from discovery alone.

## Approval Gates

Discovery is read-only and does not require deployment approval. Any deployment or external mutation requires its normal explicit approval gate.

## Composition and Dependencies

- project-handoff

## Examples

- `/azure-discovery -Commercial`
- `/azure-discovery -Gov`
- `/azure-discovery` then choose `1` or `2` when prompted.
