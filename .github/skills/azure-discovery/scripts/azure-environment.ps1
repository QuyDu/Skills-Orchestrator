# Local Azure environment profile and authentication orchestration.
# Stores only non-secret preferences and public identifiers in an ignored project-local file.

Set-StrictMode -Version Latest

$script:DefaultAzureMcpServices = @(
    'documentation',
    'get_azure_bestpractices',
    'subscription',
    'group',
    'role',
    'keyvault',
    'foundry',
    'speech',
    'deploy',
    'extension'
)

function Get-AzureEnvironmentProjectRoot {
    $directoryName = Split-Path -Leaf $PSScriptRoot
    $relativeRoot = if ($directoryName -eq 'infra') { '..' } else { '..\..\..\..' }
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $relativeRoot))
}

function Get-AzureEnvironmentProfilePath {
    return (Join-Path (Get-AzureEnvironmentProjectRoot) '.azure\environment.json')
}

function Read-AzureEnvironmentProfile {
    param([string]$ProfilePath = (Get-AzureEnvironmentProfilePath))

    if (-not (Test-Path $ProfilePath -PathType Leaf)) { return $null }
    $azureContext = Get-Content $ProfilePath -Raw | ConvertFrom-Json
    if ($azureContext.schemaVersion -ne '1.0.0') { throw "Unsupported Azure environment profile version '$($azureContext.schemaVersion)'." }
    if ($azureContext.cloud -notin @('AzureCloud', 'AzureUSGovernment')) { throw "Unsupported Azure cloud '$($azureContext.cloud)' in $ProfilePath." }
    if (-not $azureContext.location) { throw "Azure environment profile location is missing in $ProfilePath." }
    if ($azureContext.authentication.method -notin @('interactive', 'managed-identity')) {
        throw "Unsupported Azure authentication method '$($azureContext.authentication.method)' in $ProfilePath."
    }
    return $azureContext
}

function Write-AzureEnvironmentProfile {
    param(
        [Parameter(Mandatory)]$AzureContext,
        [string]$ProfilePath = (Get-AzureEnvironmentProfilePath)
    )

    $directory = Split-Path -Parent $ProfilePath
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $AzureContext.updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    $AzureContext | ConvertTo-Json -Depth 8 | Set-Content -Path $ProfilePath -Encoding utf8
    return $AzureContext
}

function Get-AzureCloudEndpoints {
    $cloud = az cloud show -o json 2>$null | ConvertFrom-Json
    if (-not $cloud) { throw 'Could not read Azure cloud endpoints.' }
    $suffixes = $cloud.suffixes
    return [pscustomobject][ordered]@{
        resourceManager   = [string]$cloud.endpoints.resourceManager
        activeDirectory   = [string]$cloud.endpoints.activeDirectory
        portal            = [string]$cloud.endpoints.portal
        storage           = [string]$suffixes.storageEndpoint
        keyVault          = [string]$suffixes.keyvaultDns
        cosmos            = if ($cloud.name -eq 'AzureUSGovernment') { 'documents.azure.us' } else { 'documents.azure.com' }
        openAI            = if ($cloud.name -eq 'AzureUSGovernment') { 'openai.azure.us' } else { 'openai.azure.com' }
        cognitiveServices = if ($cloud.name -eq 'AzureUSGovernment') { 'cognitiveservices.azure.us' } else { 'cognitiveservices.azure.com' }
        speech            = if ($cloud.name -eq 'AzureUSGovernment') { 'tts.speech.azure.us' } else { 'tts.speech.microsoft.com' }
    }
}

function Read-AzureEnvironmentChoice {
    param([Parameter(Mandatory)][string]$Prompt, [Parameter(Mandatory)][string]$Default)
    $value = Read-Host "$Prompt [$Default]"
    if ([string]::IsNullOrWhiteSpace($value)) { return $Default }
    return $value.Trim()
}

function Initialize-AzureEnvironmentProfile {
    [CmdletBinding()]
    param(
        [Alias('AzureGov')][switch]$Gov,
        [switch]$Commercial,
        [string]$Location,
        [string]$EnvironmentName,
        [ValidateSet('azure-cli', 'azd', 'bicep', 'terraform')][string]$DeploymentTool,
        [ValidateSet('interactive', 'managed-identity')][string]$AuthenticationMethod,
        [string]$TenantId,
        [string]$SubscriptionId,
        [switch]$UseAzureMcp,
        [switch]$NoAzureMcp,
        [string[]]$McpServices,
        [switch]$UseFoundryExtensions,
        [switch]$NoFoundryExtensions,
        [string]$McpClientId,
        [switch]$InteractiveSetup,
        [string]$ProfilePath = (Get-AzureEnvironmentProfilePath)
    )

    if ($Gov -and $Commercial) { throw 'Choose only one Azure cloud: -Gov or -Commercial.' }
    if ($UseAzureMcp -and $NoAzureMcp) { throw 'Choose only one MCP option: -UseAzureMcp or -NoAzureMcp.' }
    if ($UseFoundryExtensions -and $NoFoundryExtensions) { throw 'Choose only one Foundry Extensions option.' }

    $existing = Read-AzureEnvironmentProfile -ProfilePath $ProfilePath
    $cloud = if ($Gov) { 'AzureUSGovernment' } elseif ($Commercial) { 'AzureCloud' } elseif ($existing) { [string]$existing.cloud } else { 'AzureCloud' }

    if ($InteractiveSetup -and -not $existing -and -not $Gov -and -not $Commercial) {
        $selection = Read-AzureEnvironmentChoice -Prompt 'Azure cloud: 1 Commercial, 2 Government' -Default '1'
        if ($selection -notin @('1', '2')) { throw 'Azure cloud must be 1 for Commercial or 2 for Government.' }
        $cloud = if ($selection -eq '2') { 'AzureUSGovernment' } else { 'AzureCloud' }
    }

    $defaultLocation = if ($cloud -eq 'AzureUSGovernment') { 'usgovvirginia' } else { 'eastus' }
    if (-not $Location) { $Location = if ($existing) { [string]$existing.location } else { $defaultLocation } }
    if (-not $EnvironmentName) { $EnvironmentName = if ($existing) { [string]$existing.environmentName } else { 'development' } }
    if (-not $DeploymentTool) { $DeploymentTool = if ($existing) { [string]$existing.deploymentTool } else { 'azure-cli' } }
    if (-not $AuthenticationMethod) { $AuthenticationMethod = if ($existing) { [string]$existing.authentication.method } else { 'interactive' } }

    if ($InteractiveSetup -and -not $existing) {
        $EnvironmentName = Read-AzureEnvironmentChoice -Prompt 'Azure environment name' -Default $EnvironmentName
        $Location = Read-AzureEnvironmentChoice -Prompt 'Default Azure region' -Default $Location
        if (-not $PSBoundParameters.ContainsKey('UseAzureMcp') -and -not $PSBoundParameters.ContainsKey('NoAzureMcp')) {
            $mcpChoice = Read-AzureEnvironmentChoice -Prompt 'Use Azure MCP for this project? y or n' -Default 'n'
            $UseAzureMcp = $mcpChoice -match '^(?i:y|yes)$'
            $NoAzureMcp = -not $UseAzureMcp
        }
    }

    $mcpEnabled = if ($UseAzureMcp) { $true } elseif ($NoAzureMcp) { $false } elseif ($existing) { [bool]$existing.mcp.enabled } else { $false }
    $foundryRequested = if ($UseFoundryExtensions) { $true } elseif ($NoFoundryExtensions) { $false } elseif ($existing) { [bool]$existing.mcp.foundryExtensions.requested } else { $false }
    if (-not $McpClientId -and $existing) { $McpClientId = [string]$existing.mcp.foundryExtensions.clientId }
    $foundryEnabled = $mcpEnabled -and $foundryRequested -and -not [string]::IsNullOrWhiteSpace($McpClientId)

    if (-not $McpServices) {
        $McpServices = if ($existing) { @($existing.mcp.services) } elseif ($mcpEnabled) { @($script:DefaultAzureMcpServices) } else { @() }
    }
    $McpServices = @($McpServices | Where-Object { $_ -and $_ -ne 'foundryextensions' } | Select-Object -Unique)
    if ($foundryEnabled) { $McpServices += 'foundryextensions' }

    if (-not $TenantId -and $existing) { $TenantId = [string]$existing.subscription.tenantId }
    if (-not $SubscriptionId -and $existing) { $SubscriptionId = [string]$existing.subscription.subscriptionId }
    $subscriptionName = if ($existing) { [string]$existing.subscription.subscriptionName } else { '' }

    $azureContext = [pscustomobject][ordered]@{
        schemaVersion   = '1.0.0'
        updatedAt       = (Get-Date).ToUniversalTime().ToString('o')
        cloud           = $cloud
        location        = $Location.ToLowerInvariant()
        environmentName = $EnvironmentName
        deploymentTool  = $DeploymentTool
        authentication  = [pscustomobject][ordered]@{
            method = $AuthenticationMethod
        }
        subscription    = [pscustomobject][ordered]@{
            tenantId        = if ($TenantId) { $TenantId } else { '' }
            subscriptionId  = if ($SubscriptionId) { $SubscriptionId } else { '' }
            subscriptionName = $subscriptionName
        }
        cloudEndpoints  = $null
        mcp             = [pscustomobject][ordered]@{
            enabled           = $mcpEnabled
            services          = @($McpServices | Select-Object -Unique)
            foundryExtensions = [pscustomobject][ordered]@{
                requested = $foundryRequested
                enabled   = $foundryEnabled
                clientId  = if ($McpClientId) { $McpClientId } else { '' }
            }
        }
        mutationPolicy  = 'approval-required'
    }

    az cloud set --name $cloud | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not select Azure cloud '$cloud' for endpoint discovery." }
    $azureContext.cloudEndpoints = Get-AzureCloudEndpoints

    $azureContext = Write-AzureEnvironmentProfile -AzureContext $azureContext -ProfilePath $ProfilePath
    Sync-AzureMcpWorkspaceConfiguration -AzureContext $azureContext
    if ($foundryRequested -and -not $foundryEnabled) {
        Write-Warning 'Foundry Extensions remain disabled because no OAuth client ID is recorded. No registration prompt will be opened.'
    }
    return $azureContext
}

function Sync-AzureMcpWorkspaceConfiguration {
    param([Parameter(Mandatory)]$AzureContext)

    $settingsPath = Join-Path (Get-AzureEnvironmentProjectRoot) '.vscode\settings.json'
    $settingsDirectory = Split-Path -Parent $settingsPath
    New-Item -ItemType Directory -Path $settingsDirectory -Force | Out-Null
    $settings = if (Test-Path $settingsPath) { Get-Content $settingsPath -Raw | ConvertFrom-Json } else { [pscustomobject]@{} }

    $sampling = [pscustomobject]@{
        'Azure MCP Server Provider: Azure MCP' = [pscustomobject]@{
            allowedDuringChat = [bool]$AzureContext.mcp.enabled
        }
    }
    $settings | Add-Member -NotePropertyName 'chat.mcp.serverSampling' -NotePropertyValue $sampling -Force
    if ($AzureContext.mcp.enabled) {
        $settings | Add-Member -NotePropertyName 'azureMcp.enabledServices' -NotePropertyValue @($AzureContext.mcp.services) -Force
    } else {
        $settings.PSObject.Properties.Remove('azureMcp.enabledServices')
    }
    $settings | ConvertTo-Json -Depth 8 | Set-Content -Path $settingsPath -Encoding utf8
}

function Connect-AzureEnvironment {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$AzureContext,
        [string]$ProfilePath = (Get-AzureEnvironmentProfilePath)
    )

    if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'The Azure CLI is required.' }

    $activeCloud = (az cloud show --query name -o tsv 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $activeCloud -ne $AzureContext.cloud) {
        az cloud set --name $AzureContext.cloud
        if ($LASTEXITCODE -ne 0) { throw "Could not select Azure cloud '$($AzureContext.cloud)'." }
    }

    $account = $null
    try { $account = az account show -o json 2>$null | ConvertFrom-Json } catch { $account = $null }
    $tenantMismatch = $account -and $AzureContext.subscription.tenantId -and $account.tenantId -ne $AzureContext.subscription.tenantId
    if (-not $account -or $tenantMismatch) {
        switch ($AzureContext.authentication.method) {
            'interactive' {
                $arguments = @('login', '--use-device-code')
                if ($AzureContext.subscription.tenantId) { $arguments += @('--tenant', [string]$AzureContext.subscription.tenantId) }
                & az @arguments
            }
            'managed-identity' { az login --identity }
        }
        if ($LASTEXITCODE -ne 0) { throw "Azure login failed for cloud '$($AzureContext.cloud)'." }
    }

    if ($AzureContext.subscription.subscriptionId) {
        az account set --subscription $AzureContext.subscription.subscriptionId
        if ($LASTEXITCODE -ne 0) { throw 'The recorded Azure subscription is unavailable to the authenticated identity.' }
    }

    $account = az account show -o json 2>$null | ConvertFrom-Json
    if (-not $account) { throw "Azure authentication did not produce an active account in '$($AzureContext.cloud)'." }
    $AzureContext.subscription.tenantId = [string]$account.tenantId
    $AzureContext.subscription.subscriptionId = [string]$account.id
    $AzureContext.subscription.subscriptionName = [string]$account.name
    $AzureContext.cloudEndpoints = Get-AzureCloudEndpoints
    Write-AzureEnvironmentProfile -AzureContext $AzureContext -ProfilePath $ProfilePath | Out-Null
    Write-Host "Azure context: $($AzureContext.cloud), $($account.name) [$($account.id)]" -ForegroundColor Cyan
    return $account
}

function Resolve-AzureCloudSelection {
    param(
        [switch]$Gov,
        [switch]$Commercial,
        [string]$ProfilePath = (Get-AzureEnvironmentProfilePath)
    )

    if ($Gov -and $Commercial) { throw 'Choose only one Azure cloud: -Gov or -Commercial.' }
    if ($Gov) { return 'AzureUSGovernment' }
    if ($Commercial) { return 'AzureCloud' }
    $azureContext = Read-AzureEnvironmentProfile -ProfilePath $ProfilePath
    if ($azureContext) { return [string]$azureContext.cloud }
    return 'AzureCloud'
}
