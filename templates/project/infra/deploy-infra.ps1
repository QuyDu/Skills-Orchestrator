# Bicep deployment.
# Library, not an entry point. Dot-source it and call Invoke-InfrastructureDeploy.

Set-StrictMode -Version Latest

function Invoke-InfrastructureDeploy {
    <#
    .SYNOPSIS  Create the resource group if needed and deploy main.bicep into it.

    .DESCRIPTION
        Uses the signed-in `az` context. Nothing here reads a credential, a subscription id,
        or a tenant id from source: the deployment targets whatever `az account show`
        reports, which is why the caller is expected to confirm before this runs.
    #>
    param(
        [Parameter(Mandatory)][string]$SiteName,
        [Parameter(Mandatory)][string]$Location,
        [Parameter(Mandatory)][hashtable]$Discovery,
        [string]$AppServiceSku = 'S1',
        [string]$LinuxFxVersion = 'NODE|22-lts',
        [bool]$DeployKeyVault = $true,
        [switch]$AzureGov,
        [switch]$WhatIf
    )

    $resourceGroup = "rg-$SiteName"
    $templatePath = Join-Path $PSScriptRoot 'main.bicep'
    if (-not (Test-Path $templatePath)) { throw "main.bicep not found beside deploy-infra.ps1" }

    $account = az account show -o json 2>$null | ConvertFrom-Json
    if (-not $account) { throw "Not signed in. Run 'az login' first." }
    Write-Host "Subscription: $($account.name) [$($account.id)]" -ForegroundColor Cyan

    Write-Host "Ensuring resource group '$resourceGroup' in '$Location'..." -ForegroundColor Gray
    if (-not $WhatIf) {
        az group create --name $resourceGroup --location $Location -o none
        if ($LASTEXITCODE -ne 0) { throw "Resource group creation failed." }
    }

    $parameters = @(
        "siteName=$SiteName",
        "location=$Location",
        "appServiceSku=$AppServiceSku",
        "linuxFxVersion=$LinuxFxVersion",
        "isAzureGov=$([bool]$AzureGov)",
        "deployKeyVault=$DeployKeyVault",
        "deployOpenAI=$($Discovery.openAIAvailable)",
        "openAIModelName=$($Discovery.openAIModelName)",
        "openAIModelVersion=$($Discovery.openAIModelVersion)",
        "openAIModelSku=$($Discovery.openAIModelSku)"
    )

    $operation = if ($WhatIf) { 'what-if' } else { 'create' }
    Write-Host "Running az deployment group $operation..." -ForegroundColor Gray
    az deployment group $operation `
        --resource-group $resourceGroup `
        --template-file $templatePath `
        --parameters $parameters `
        -o json | Tee-Object -Variable deploymentJson | Out-Null

    if ($LASTEXITCODE -ne 0) { throw "Bicep deployment failed." }
    if ($WhatIf) { return $null }

    $deployment = $deploymentJson | ConvertFrom-Json
    return $deployment.properties.outputs
}
