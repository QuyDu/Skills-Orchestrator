# Infrastructure

Azure discovery and deployment for this project. Azure CLI plus Bicep, orchestrated by PowerShell.

## Not yet verified against a live subscription

This scaffold was generated, compiled, and linted, but **it has not been deployed to a real Azure
subscription**. Run it with `-WhatIf` first and read the plan before you trust it.

## Layout

| File | Role |
| --- | --- |
| `deploy.ps1` | The entry point. Dot-sources the modules below and runs them in order. |
| `discover.ps1` | Library. Probes the region for available services and picks the best OpenAI model. |
| `deploy-infra.ps1` | Library. Runs `az deployment group create` against `main.bicep`. |
| `main.bicep` | App Service with a system-assigned identity, Key Vault with RBAC, optional Azure OpenAI. |

`discover.ps1` and `deploy-infra.ps1` are **libraries, not entry points**. Running one directly
defines its functions and exits without doing anything. Only `deploy.ps1` does work.

## Usage

```powershell
# See what would happen, change nothing.
./deploy.ps1 -SiteName contoso-api -WhatIf

# Commercial cloud.
./deploy.ps1 -SiteName contoso-api

# Azure US Government.
./deploy.ps1 -SiteName contoso-api -AzureGov -Location usgovvirginia
```

When neither `-Commercial` nor `-Gov` is supplied, the script asks:

```text
1. Commercial
2. Gov
```

Only `1` or `2` is accepted. After three invalid responses, discovery exits with an error. The
legacy `-AzureGov` switch remains supported as an alias for `-Gov`.

The Copilot skill `/azure-discovery` runs the same read-only probe and writes both
`reports/azure-discovery.json` and the readable `reports/azure-discovery.md`. Use
`/azure-discovery -Commercial` or `/azure-discovery -Gov` to select a cloud without the menu.
The report also records whether the existing Speech-resource query succeeded plus only the count,
kinds, and regions of compatible accounts. It never stores account names, resource identifiers, or
keys. `/project-video` requires this evidence to be no older than 14 days before Azure narration.

## Cleanup

Cleanup is read-only by default. Preview a project resource group:

```powershell
./cleanup.ps1 -All -SiteName contoso-api -Commercial
```

Preview a single resource or named group:

```powershell
./cleanup.ps1 -Resource app-contoso-api -RG rg-contoso-api -Gov
./cleanup.ps1 -ResourceGroup rg-contoso-api -Commercial
```

The script lists the subscription, cloud, target, and resources first. To apply a deletion, add
`-Apply` and type `DELETE` when asked. Every result and error is reported; no credentials are stored.

Use `/environment-update` to inventory already-installed development tools and list available
updates. It reports all findings first, supports `-WhatIf` by default, and requires selection and
confirmation before updating a tool.

`-SiteName` drives every resource name and is capped at 12 characters so the derived names stay
inside Azure's limits:

| Resource | Pattern | Worst case |
| --- | --- | --- |
| Resource group | `rg-<name>` | 15 |
| App Service plan | `asp-<name>-<hash>` | 23 of 40 |
| Web app | `app-<name>-<hash>` | 23 of 60 |
| Key Vault | `kv<name><hash>` | 20 of 24 |
| Azure OpenAI | `oai-<name>-<hash>` | 23 of 64 |

`<hash>` is six characters of `uniqueString(resourceGroup().id)`. The Key Vault name drops hyphens
because Key Vault rejects consecutive and trailing hyphens, and it is never truncated, so the
uniqueness suffix always survives in that globally unique namespace. Separate site names stay fully
isolated and the same repository deploys into a fresh subscription unchanged.

## Authentication

Deployment uses your `az login` context and targets whatever subscription the CLI is scoped to.
Confirm with `az account show` before running without `-WhatIf`.

No subscription id, tenant id, service principal, or secret belongs in this directory. If you find
yourself wanting to add one, that is the signal to use a managed identity or a federated credential
instead.

## How the application authenticates

The web app gets a **system-assigned managed identity**, and `main.bicep` grants it RBAC roles
rather than issuing keys. Use `DefaultAzureCredential` in application code; do not put service keys
in app settings.

## Network access: change this before production

`publicNetworkAccess` defaults to `Enabled` so the baseline deploys to a working state without a
VNet. A freshly created deployment holds no data, so the exposure at that moment is an empty
resource defended by RBAC, which is a reasonable place to start.

That stops being true the moment real data lands. Before it does:

1. Set `publicNetworkAccess` to `Disabled`.
2. Add a VNet, subnet, private endpoints, and private DNS zones, and integrate the web app.
3. Record the decision in `docs/adr/`.

The project's own `bicep.instructions.md` requires private endpoints by default, so leaving this at
`Enabled` will be flagged by `security-review` and `architecture-review` until an ADR explains it.

## Optional components

| Parameter | Default | Turn it off when |
| --- | --- | --- |
| `deployKeyVault` | `true` | The project keeps no secrets of its own. The app setting and role assignment disappear with it. |
| `deployOpenAI` | `false` | Set automatically from discovery; no account is created unless a model was found. |

With `deployKeyVault` false the deployment is just an App Service with a managed identity, which is
often all a stateless service needs.

## Sovereign clouds

`main.bicep` sets `AZURE_CLOUD` to `AzureUSGovernment` or `AzureCloud`. Read that setting at
startup to choose the right authority host and service endpoints, so one build works against both
`.com` and `.us` without a rebuild. `deploy.ps1` refuses to run if your active `az cloud` does not
match the requested one.

## Region availability

`Get-AzureCognitiveKindRegion` probes **every** region in the current cloud rather than just the
target one. A single-region probe reports a false negative whenever a service is region-limited,
and creating an account in a region that does not list the SKU fails preflight with
`SpecialFeatureOrQuotaIdRequired`. This matters most in Azure US Government, where several AI
services are offered in only one region.

## Extending this

`main.bicep` is deliberately minimal. Add the services your application actually needs, grant the
managed identity a role assignment for each, and extend `Invoke-AzureDiscovery` when a service is
not available in every region you deploy to.
