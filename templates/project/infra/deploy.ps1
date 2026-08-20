<#
.SYNOPSIS
    Discovers what the target Azure region offers, then deploys this project's infrastructure.

.DESCRIPTION
    The entry point. It dot-sources the focused modules beside it and runs them in order:

        discover.ps1      - live region probe; picks the best available OpenAI model
        deploy-infra.ps1  - az deployment group create against main.bicep

    Those modules are libraries. Running one directly does nothing.

    Authentication is your `az login` context. The scripts deploy to whatever subscription
    the CLI is currently scoped to, so confirm `az account show` before running without
    -WhatIf. No credential, subscription id, or tenant id is stored in this repository.

.PARAMETER SiteName
    2-20 characters, letters, numbers and hyphens. Drives every resource name, so two
    deployments with different names are fully isolated.
.PARAMETER Location
    Target region. Defaults to eastus, or usgovvirginia with -AzureGov.
.PARAMETER AzureGov
    Deploy to Azure US Government. Sets AZURE_CLOUD so the app resolves sovereign endpoints.
.PARAMETER PreferModel
    Try this OpenAI model first, falling back to the normal preference order if the region
    does not offer it.
.PARAMETER NoKeyVault
    Skip the Key Vault. Use this when the project keeps no secrets of its own.
.PARAMETER WhatIf
    Run discovery and a Bicep what-if without creating or changing anything.

.EXAMPLE
    ./deploy.ps1 -SiteName contoso-api -WhatIf

.EXAMPLE
    ./deploy.ps1 -SiteName contoso-api -AzureGov -Location usgovvirginia
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-zA-Z0-9-]{2,20}$')]
    [string]$SiteName,

    [string]$Location,

    [ValidateSet('B1', 'B2', 'S1', 'P1v3')]
    [string]$AppServiceSku = 'S1',

    [string]$LinuxFxVersion = 'NODE|22-lts',

    [string]$PreferModel,

    [string]$DiscoveryOutputPath,

    [switch]$NoKeyVault,

    [switch]$AzureGov,

    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "The Azure CLI is required. Install it and run 'az login'."
}

if (-not $Location) {
    $Location = if ($AzureGov) { 'usgovvirginia' } else { 'eastus' }
}

. (Join-Path $PSScriptRoot 'discover.ps1')
. (Join-Path $PSScriptRoot 'deploy-infra.ps1')

$expectedCloud = if ($AzureGov) { 'AzureUSGovernment' } else { 'AzureCloud' }
$activeCloud = az cloud show --query name -o tsv 2>$null
if ($activeCloud -and $activeCloud -ne $expectedCloud) {
    throw "Signed in to '$activeCloud' but '$expectedCloud' was requested. Run: az cloud set --name $expectedCloud"
}

$discovery = Invoke-AzureDiscovery -Location $Location -AzureGov:$AzureGov `
    -PreferModel $PreferModel -DiscoveryOutputPath $DiscoveryOutputPath

$outputs = Invoke-InfrastructureDeploy -SiteName $SiteName -Location $Location -Discovery $discovery `
    -AppServiceSku $AppServiceSku -LinuxFxVersion $LinuxFxVersion -DeployKeyVault:(-not $NoKeyVault) `
    -AzureGov:$AzureGov -WhatIf:$WhatIf

if ($WhatIf) {
    Write-Host "`nWhat-if complete. Nothing was created or changed." -ForegroundColor Cyan
    return
}

Write-Host "`n=== Deployment complete ===" -ForegroundColor Green
Write-Host "Web app:   https://$($outputs.webAppHostName.value)" -ForegroundColor Cyan
if ($outputs.keyVaultUri.value) { Write-Host "Key Vault: $($outputs.keyVaultUri.value)" -ForegroundColor Cyan }
Write-Host "Identity:  $($outputs.managedIdentityPrincipalId.value)" -ForegroundColor Cyan
Write-Host "`nThe web app authenticates with its managed identity. Do not add service keys to app settings." -ForegroundColor Gray
