[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ProjectRoot,
    [ValidateSet('AzureCloud', 'AzureUSGovernment')][string]$Cloud,
    [string]$Location,
    [string]$EnvironmentName,
    [ValidateSet('interactive', 'managed-identity')][string]$AuthenticationMethod,
    [string]$SubscriptionId,
    [switch]$InteractiveSetup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$resolvedRoot = [IO.Path]::GetFullPath($ProjectRoot)
$environmentModule = Join-Path $resolvedRoot '.github\skills\azure-discovery\scripts\azure-environment.ps1'
if (-not (Test-Path $environmentModule -PathType Leaf)) {
    throw "The target project is missing the packaged Azure environment module: $environmentModule"
}

. $environmentModule

$profilePath = Join-Path $resolvedRoot '.azure\environment.json'
$profileDirectory = Split-Path -Parent $profilePath
New-Item -ItemType Directory -Path $profileDirectory -Force | Out-Null
$stagingProfilePath = Join-Path $profileDirectory ("agent-builder-{0}.json" -f [guid]::NewGuid().ToString('N'))
$settingsPath = Join-Path $resolvedRoot '.vscode\settings.json'
$settingsBackup = $null
$settingsExisted = Test-Path $settingsPath -PathType Leaf
if ($settingsExisted) {
    $settingsBackup = [IO.File]::ReadAllBytes($settingsPath)
}

$existing = Read-AzureEnvironmentProfile -ProfilePath $profilePath
$sameCloud = $existing -and ((-not $Cloud) -or ([string]$existing.cloud -eq $Cloud))
if ($sameCloud) {
    Copy-Item -LiteralPath $profilePath -Destination $stagingProfilePath
}

$parameters = @{
    ProfilePath = $stagingProfilePath
    InteractiveSetup = $InteractiveSetup.IsPresent
}
if ($Cloud -eq 'AzureUSGovernment') { $parameters.Gov = $true }
if ($Cloud -eq 'AzureCloud') { $parameters.Commercial = $true }
if ($Location) { $parameters.Location = $Location }
if ($EnvironmentName) { $parameters.EnvironmentName = $EnvironmentName }
if ($AuthenticationMethod) { $parameters.AuthenticationMethod = $AuthenticationMethod }
if ($SubscriptionId) { $parameters.SubscriptionId = $SubscriptionId }

if ($existing) {
    if ([bool]$existing.mcp.enabled) { $parameters.UseAzureMcp = $true } else { $parameters.NoAzureMcp = $true }
    $parameters.McpServices = @($existing.mcp.services)
    if ([bool]$existing.mcp.foundryExtensions.requested) {
        $parameters.UseFoundryExtensions = $true
        if ($existing.mcp.foundryExtensions.clientId) {
            $parameters.McpClientId = [string]$existing.mcp.foundryExtensions.clientId
        }
    } else {
        $parameters.NoFoundryExtensions = $true
    }
} else {
    $parameters.NoAzureMcp = $true
    $parameters.NoFoundryExtensions = $true
}

try {
    $context = Initialize-AzureEnvironmentProfile @parameters
    $account = Connect-AzureEnvironment -AzureContext $context -ProfilePath $stagingProfilePath
    if (-not $account.id -or -not $account.tenantId) {
        throw 'Azure authentication did not return a subscription and tenant.'
    }
    if ($SubscriptionId -and ([string]$account.id -ne $SubscriptionId)) {
        throw 'The authenticated Azure subscription does not match the requested subscription.'
    }
    Move-Item -LiteralPath $stagingProfilePath -Destination $profilePath -Force
} catch {
    Remove-Item -LiteralPath $stagingProfilePath -Force -ErrorAction SilentlyContinue
    if ($settingsExisted) {
        [IO.File]::WriteAllBytes($settingsPath, $settingsBackup)
    } elseif (Test-Path $settingsPath) {
        Remove-Item -LiteralPath $settingsPath -Force
    }
    throw
}

[pscustomobject][ordered]@{
    cloud = [string]$context.cloud
    location = [string]$context.location
    environmentName = [string]$context.environmentName
    authenticationMethod = [string]$context.authentication.method
    subscriptionConfigured = -not [string]::IsNullOrWhiteSpace([string]$account.id)
} | ConvertTo-Json -Compress