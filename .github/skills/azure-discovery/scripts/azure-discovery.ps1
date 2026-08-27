# Azure service and model discovery.
# Library, not an entry point. Dot-source it and call Invoke-AzureDiscovery.
# Side effects: live read-only `az` queries against the signed-in subscription.

Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'azure-environment.ps1')

function Get-AzureDiscoveryProjectRoot {
    $directoryName = Split-Path -Leaf $PSScriptRoot
    $relativeRoot = if ($directoryName -eq 'infra') { '..' } else { '..\..\..\..' }
    return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $relativeRoot))
}

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

function Get-AzureSpeechResourceSummary {
    <#
    .SYNOPSIS  Summarize existing Speech-capable accounts without persisting names or identifiers.
    #>
    try {
        $accounts = az cognitiveservices account list `
            --query "[?kind=='SpeechServices' || kind=='AIServices' || kind=='CognitiveServices'].{kind:kind, location:location}" `
            -o json 2>$null | ConvertFrom-Json
        $items = @($accounts)
        return @{
            querySucceeded = $true
            available      = ($items.Count -gt 0)
            count          = $items.Count
            regions        = @($items | ForEach-Object { ([string]$_.location).ToLower() } | Where-Object { $_ } | Select-Object -Unique)
            kinds          = @($items | ForEach-Object { [string]$_.kind } | Where-Object { $_ } | Select-Object -Unique)
        }
    } catch {
        return @{
            querySucceeded = $false
            available      = $false
            count          = 0
            regions        = @()
            kinds          = @()
        }
    }
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
        [string]$Location,
        [Alias('AzureGov')][switch]$Gov,
        [switch]$Commercial,
        [string]$PreferModel,
        [switch]$InteractiveSetup,
        [string]$DiscoveryOutputPath = (Join-Path (Get-AzureDiscoveryProjectRoot) 'reports\azure-discovery.json')
    )

    $environmentProfile = Initialize-AzureEnvironmentProfile -Gov:$Gov -Commercial:$Commercial -Location $Location -InteractiveSetup:$InteractiveSetup
    Connect-AzureEnvironment -AzureContext $environmentProfile | Out-Null
    $cloud = [string]$environmentProfile.cloud
    $Location = [string]$environmentProfile.location
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

    $speechServiceRegions = @(Get-AzureCognitiveKindRegion -Kind 'SpeechServices')
    $speechResources = Get-AzureSpeechResourceSummary
    if ($speechResources.available) {
        Write-Host "  Speech resources: $($speechResources.count) existing in $($speechResources.regions -join ', ')" -ForegroundColor Green
    } elseif ($speechResources.querySucceeded) {
        Write-Host '  Speech resources: none found in the active subscription' -ForegroundColor Yellow
    } else {
        Write-Host '  Speech resources: account query unavailable' -ForegroundColor Yellow
    }

    $result = @{
        schemaVersion      = '1.0.0'
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
        speech             = @{
            serviceAvailable               = ($speechServiceRegions.Count -gt 0)
            serviceRegions                 = $speechServiceRegions
            existingResourceQuerySucceeded = $speechResources.querySucceeded
            existingResourceAvailable      = $speechResources.available
            existingResourceCount          = $speechResources.count
            existingResourceRegions        = $speechResources.regions
            existingResourceKinds          = $speechResources.kinds
        }
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
            "- Speech service regions: $($result.speech.serviceRegions -join ', ')"
            "- Existing Speech resource query succeeded: $($result.speech.existingResourceQuerySucceeded)"
            "- Existing Speech resources: $($result.speech.existingResourceCount)"
            "- Existing Speech resource regions: $($result.speech.existingResourceRegions -join ', ')"
            "- Existing Speech resource kinds: $($result.speech.existingResourceKinds -join ', ')"
            '- Speech credentials: environment only; never written to discovery reports'
        ) | Set-Content -Path $markdownPath -Encoding utf8
        Write-Host "  Discovery written to $DiscoveryOutputPath" -ForegroundColor Gray
        Write-Host "  Readable report written to $markdownPath" -ForegroundColor Gray
    }

    return $result
}