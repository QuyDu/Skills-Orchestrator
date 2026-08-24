# Azure resource cleanup.
# Read-only by default. Use -Apply only after reviewing the listed targets and confirming.

[CmdletBinding(DefaultParameterSetName = 'WhatIf')]
param(
    [Parameter(ParameterSetName = 'All', Mandatory)][switch]$All,
    [Parameter(ParameterSetName = 'All', Mandatory)][string]$SiteName,
    [Parameter(ParameterSetName = 'Resource', Mandatory)][string]$Resource,
    [Parameter(ParameterSetName = 'Resource', Mandatory)][string]$RG,
    [Parameter(ParameterSetName = 'Group', Mandatory)][string]$ResourceGroup,
    [switch]$Gov,
    [switch]$Commercial,
    [switch]$Apply,
    [switch]$WhatIf
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($Gov -and $Commercial) { throw 'Choose only one Azure cloud: -Gov or -Commercial.' }
if ($Apply -and $WhatIf) { throw 'Choose either -Apply or -WhatIf, not both.' }
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw "The Azure CLI is required. Install it and run 'az login'." }

function Resolve-Cloud {
    if ($Gov) { return 'AzureUSGovernment' }
    if ($Commercial) { return 'AzureCloud' }
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        Write-Host "`nChoose the Azure cloud:" -ForegroundColor Cyan
        Write-Host '1. Commercial'
        Write-Host '2. Gov'
        $choice = Read-Host 'Enter 1 or 2'
        if ($choice -eq '1') { return 'AzureCloud' }
        if ($choice -eq '2') { return 'AzureUSGovernment' }
        Write-Host 'Invalid response. Enter only 1 or 2.' -ForegroundColor Yellow
    }
    throw 'Azure cloud selection failed after 3 invalid responses. Exiting cleanup.'
}

$cloud = Resolve-Cloud
$activeCloud = az cloud show --query name -o tsv 2>$null
if ($activeCloud -and $activeCloud -ne $cloud) { throw "Signed in to '$activeCloud' but '$cloud' was requested." }
$account = az account show -o json 2>$null | ConvertFrom-Json
if (-not $account) { throw "Not signed in. Run 'az login' first." }

$targetGroup = if ($All) { "rg-$SiteName" } elseif ($ResourceGroup) { $ResourceGroup } else { $RG }
if (-not $targetGroup) { throw 'Specify -All -ResourceGroup <name>, -Resource <name> -RG <name>, or -ResourceGroup <name>.' }

$resources = @(az resource list --resource-group $targetGroup -o json 2>$null | ConvertFrom-Json)
if (-not $resources) { throw "Resource group '$targetGroup' was not found or contains no resources." }
if ($Resource) {
    $matches = @($resources | Where-Object { $_.name -eq $Resource -or $_.id -eq $Resource })
    if ($matches.Count -ne 1) { throw "Expected exactly one resource named '$Resource' in '$targetGroup'; found $($matches.Count)." }
    $resources = $matches
}

$targetDescription = if ($All) { "resource group '$targetGroup' and all $($resources.Count) resources" } elseif ($Resource) { "resource '$($resources[0].name)'" } else { "resource group '$targetGroup'" }
Write-Host "Cloud: $cloud" -ForegroundColor Cyan
Write-Host "Subscription: $($account.name) [$($account.id)]" -ForegroundColor Cyan
Write-Host "Target: $targetDescription" -ForegroundColor Yellow
$resources | Select-Object name, type, location, id | Format-Table -AutoSize

if (-not $Apply) {
    Write-Host "`nWhat-if only. Nothing was deleted. Use -Apply after reviewing this list and confirming the exact target." -ForegroundColor Green
    return
}

$confirmation = Read-Host "Type DELETE to confirm deletion of $targetDescription"
if ($confirmation -cne 'DELETE') { throw 'Cleanup cancelled; no resources were deleted.' }

if ($All) {
    az group delete --name $targetGroup --yes
} elseif ($Resource) {
    az resource delete --ids $resources[0].id
} else {
    az group delete --name $targetGroup --yes
}
if ($LASTEXITCODE -ne 0) { throw "Azure cleanup failed for $targetDescription." }
Write-Host "Cleanup completed for $targetDescription." -ForegroundColor Green
