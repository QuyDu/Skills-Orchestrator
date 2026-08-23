# Azure service and model discovery.
# Library, not an entry point. Dot-source it and call Invoke-AzureDiscovery.
# Side effects: live read-only `az` queries against the signed-in subscription.

Set-StrictMode -Version Latest

function Test-AzureCognitiveKind {
    <#
    .SYNOPSIS  Report whether a Cognitive Services kind offers any SKU in one region.
    #>
    param(
        [Parameter(Mandatory)][string]$Kind,
        [Parameter(Mandatory)][string]$Location
    )
    try {
        $skus = az cognitiveservices account list-skus --kind $Kind --location $Location `
            --query "[].{sku:sku.name}" -o json 2>$null | ConvertFrom-Json
        return ($skus -and $skus.Count -gt 0)
    } catch { return $false }
}

function Get-AzureCognitiveKindRegion {
    <#
    .SYNOPSIS  Return every region offering a Cognitive Services kind in the current cloud.

    .DESCRIPTION
        Probing a single region reports a false negative whenever a kind is region-limited,
        and creating an account in a region that does not list the SKU fails preflight with
        SpecialFeatureOrQuotaIdRequired. Azure US Government is the common case: several
        kinds are offered in only one Gov region.

        `az cognitiveservices account list-skus` without --location is already scoped by the
        active `az cloud` context, so this returns the correct regions for whichever cloud
        you are signed in to.
    #>
    param(
        [Parameter(Mandatory)][string]$Kind
    )
    try {
        $locationSets = az cognitiveservices account list-skus --kind $Kind `
            --query "[].locations" -o json 2>$null | ConvertFrom-Json
        $regions = @()
        foreach ($set in @($locationSets)) {
            foreach ($region in @($set)) {
                if ($region) { $regions += ([string]$region).ToLower() }
            }
        }
        return @($regions | Select-Object -Unique)
    } catch { return @() }
}

function Resolve-AzureOpenAIApiVersion {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$ModelName)
    switch -Wildcard ($ModelName) {
        'gpt-5*'   { '2025-04-01-preview' }
        'gpt-4.1*' { '2025-04-01-preview' }
        'o3*'      { '2025-04-01-preview' }
        'o1*'      { '2024-12-01-preview' }
        default    { '2024-10-01' }
    }
}

function Resolve-AzureCloudSelection {
    param(
        [switch]$Gov,
        [switch]$Commercial
    )

    if ($Gov -and $Commercial) {
        throw 'Choose only one Azure cloud: -Gov or -Commercial.'
    }
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

    throw 'Azure cloud selection failed after 3 invalid responses. Exiting discovery.'
}

function Invoke-AzureDiscovery {
    <#
    .SYNOPSIS  Probe a region for available services and the best available OpenAI model.

    .DESCRIPTION
        Keeps a repository portable across subscriptions, regions and clouds: nothing about
        the target environment is hard-coded, so the same source deploys anywhere the
        signed-in account can reach.

    .OUTPUTS
        Hashtable with keys: cloud, location, cognitiveAvailable, cognitiveRegions,
        openAIAvailable, openAIModelName, openAIModelVersion, openAIModelSku, openAIApiVersion.
    #>
    param(
        [Parameter(Mandatory)][string]$Location,
        [Alias('AzureGov')][switch]$Gov,
        [switch]$Commercial,
        [string]$PreferModel,
        [string]$DiscoveryOutputPath = (Join-Path $PSScriptRoot '..\reports\azure-discovery.json')
    )

    $cloud = Resolve-AzureCloudSelection -Gov:$Gov -Commercial:$Commercial
    Write-Host "`n=== Azure discovery ($Location, $cloud) ===" -ForegroundColor Cyan

    $cognitiveAvailable = Test-AzureCognitiveKind -Kind 'AIServices' -Location $Location
    if (-not $cognitiveAvailable) {
        $cognitiveAvailable = Test-AzureCognitiveKind -Kind 'CognitiveServices' -Location $Location
    }
    $cognitiveRegions = @(Get-AzureCognitiveKindRegion -Kind 'AIServices')
    if ($cognitiveAvailable) {
        Write-Host "  Cognitive Services: available in '$Location'" -ForegroundColor Green
    } else {
        Write-Host "  Cognitive Services: not listed in '$Location'" -ForegroundColor Yellow
        if ($cognitiveRegions.Count -gt 0) {
            Write-Host "  Offered in this cloud at: $($cognitiveRegions -join ', ')" -ForegroundColor Yellow
        }
    }

    $modelPreference = @('gpt-5.1', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'gpt-4', 'gpt-35-turbo')
    if ($PreferModel) {
        $modelPreference = @($PreferModel) + ($modelPreference | Where-Object { $_ -ne $PreferModel })
        Write-Host "  Preference override: trying '$PreferModel' first" -ForegroundColor Cyan
    }

    $openAIAvailable = $false
    $openAIModelName = ''
    $openAIModelVersion = ''
    $openAIModelSku = 'Standard'

    $modelFilter = ($modelPreference | ForEach-Object { "model.name=='$_'" }) -join ' || '
    $availableModels = $null
    try {
        $availableModels = az cognitiveservices model list --location $Location `
            --query "[?$modelFilter].{name:model.name, version:model.version, sku:model.skus[0].name}" `
            -o json 2>$null | ConvertFrom-Json
    } catch {
        Write-Host "  Could not query OpenAI models (non-fatal): $_" -ForegroundColor Yellow
    }

    if ($availableModels -and $availableModels.Count -gt 0) {
        $openAIAvailable = $true
        foreach ($preferred in $modelPreference) {
            $candidates = $availableModels | Where-Object { $_.name -eq $preferred }
            if (-not $candidates) { continue }
            # A provisioned SKU cannot be deployed on demand, so prefer the pay-as-you-go tiers.
            $standard = $candidates | Where-Object { $_.sku -in @('Standard', 'DataZoneStandard', 'GlobalStandard') } |
                Sort-Object version -Descending
            $selected = if ($standard) { $standard[0] } else { ($candidates | Sort-Object version -Descending)[0] }
            $openAIModelName = $preferred
            $openAIModelVersion = [string]$selected.version
            $openAIModelSku = [string]$selected.sku
            Write-Host "  >> Selected: $openAIModelName version=$openAIModelVersion sku=$openAIModelSku" -ForegroundColor Cyan
            break
        }
    } else {
        Write-Host "  Azure OpenAI: no preferred model available in '$Location'" -ForegroundColor Yellow
    }

    $openAIApiVersion = Resolve-AzureOpenAIApiVersion -ModelName $openAIModelName
    if ($openAIAvailable) {
        Write-Host "  API version: $openAIApiVersion" -ForegroundColor Cyan
    }

    $result = @{
        discoveredAt       = (Get-Date).ToUniversalTime().ToString('o')
        cloud              = $cloud
        location           = $Location
        cognitiveAvailable = $cognitiveAvailable
        cognitiveRegions   = $cognitiveRegions
        openAIAvailable    = $openAIAvailable
        openAIModelName    = $openAIModelName
        openAIModelVersion = $openAIModelVersion
        openAIModelSku     = $openAIModelSku
        openAIApiVersion   = $openAIApiVersion
    }

    if ($DiscoveryOutputPath) {
        $outputDirectory = Split-Path -Parent $DiscoveryOutputPath
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
        $result | ConvertTo-Json -Depth 5 | Set-Content -Path $DiscoveryOutputPath -Encoding utf8
        $markdownPath = [IO.Path]::ChangeExtension($DiscoveryOutputPath, '.md')
        $availability = if ($result.openAIAvailable) { 'available' } else { 'not available' }
        @(
            '# Azure Discovery'
            ''
            "- Discovered at (UTC): $($result.discoveredAt)"
            "- Cloud: $($result.cloud)"
            "- Location: $($result.location)"
            "- Cognitive Services: $($result.cognitiveAvailable)"
            "- Azure OpenAI: $availability"
            "- Selected model: $($result.openAIModelName)"
            "- Model version: $($result.openAIModelVersion)"
            "- Model SKU: $($result.openAIModelSku)"
            "- API version: $($result.openAIApiVersion)"
            "- Cognitive regions: $($result.cognitiveRegions -join ', ')"
        ) | Set-Content -Path $markdownPath -Encoding utf8
        Write-Host "  Discovery written to $DiscoveryOutputPath" -ForegroundColor Gray
        Write-Host "  Readable report written to $markdownPath" -ForegroundColor Gray
    }

    return $result
}
