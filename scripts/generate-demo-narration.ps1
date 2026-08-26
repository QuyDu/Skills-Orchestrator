[CmdletBinding()]
param(
  [string]$ManifestPath = (Join-Path $PSScriptRoot "..\Demo\audio\narration\scenes.json"),
  [ValidateSet("ava-hd-warm", "aria-hd-warm", "aria-professional")]
  [string]$VoiceProfile = "ava-hd-warm",
  [string]$VoiceName = "",
  [switch]$ApproveExternal,
  [switch]$Audition,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function ConvertTo-XmlText {
  param([Parameter(Mandatory)][string]$Text)

  return $Text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace('"', "&quot;").Replace("'", "&apos;")
}

function New-SpeechSsml {
  param(
    [Parameter(Mandatory)][string]$Text,
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$Locale,
    [Parameter(Mandatory)][string]$Style,
    [Parameter(Mandatory)][double]$Degree,
    [Parameter(Mandatory)][int]$Rate,
    [Parameter(Mandatory)][int]$PauseMs
  )

  $protectedPeriod = [string][char]0x2024
  $protectedText = [regex]::Replace($Text, "\b(?:[A-Za-z]\.){2,}", { param($match) $match.Value.Replace(".", $protectedPeriod) })
  $protectedText = [regex]::Replace($protectedText, "\b(?:e\.g|i\.e|etc|Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs)\.", { param($match) $match.Value.Replace(".", $protectedPeriod) }, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $protectedText = [regex]::Replace($protectedText, "(?<=[\p{L}\p{N}])\.(?=[\p{L}\p{N}])", $protectedPeriod)
  $sentences = [regex]::Matches($protectedText, "[^.!?]+[.!?]+|[^.!?]+$") | ForEach-Object { $_.Value.Replace($protectedPeriod, ".").Trim() } | Where-Object { $_ }
  $pause = if ($PauseMs -gt 0) { "<break time=`"${PauseMs}ms`"/>" } else { "" }
  $sentenceMarkup = (($sentences | ForEach-Object { "<s>$(ConvertTo-XmlText -Text $_)</s>" }) -join $pause)
  $ratePrefix = if ($Rate -gt 0) { "+" } else { "" }
  $prosody = if ($Rate -eq 0) { $sentenceMarkup } else { "<prosody rate=`"$ratePrefix$Rate%`">$sentenceMarkup</prosody>" }
  $delivery = if ($Style -eq "auto") { $prosody } else { "<mstts:express-as style=`"$Style`" styledegree=`"$Degree`">$prosody</mstts:express-as>" }

  return @"
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="$Locale">
  <voice name="$Name">
    $delivery
  </voice>
</speak>
"@
}

function Write-SpeechAudio {
  param(
    [Parameter(Mandatory)][string]$Uri,
    [Parameter(Mandatory)]$Headers,
    [Parameter(Mandatory)][string]$Ssml,
    [Parameter(Mandatory)][string]$Target,
    [Parameter(Mandatory)][string]$Label
  )

  $temporary = "$Target.partial"
  try {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    Invoke-WebRequest -Uri $Uri -Method Post -Headers $Headers -ContentType "application/ssml+xml; charset=utf-8" -Body $Ssml -OutFile $temporary
    if ((Get-Item -LiteralPath $temporary).Length -lt 1024) {
      throw "Azure Speech returned an unexpectedly small audio file for $Label."
    }
    Move-Item -LiteralPath $temporary -Destination $Target -Force
    return (Get-FileHash -LiteralPath $Target -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
  }
}

$speechKey = if ($env:AZURE_SPEECH_KEY) { $env:AZURE_SPEECH_KEY } else { $env:SPEECH_KEY }
$speechRegion = if ($env:AZURE_SPEECH_REGION) { $env:AZURE_SPEECH_REGION } else { $env:SPEECH_REGION }

if ([string]::IsNullOrWhiteSpace($speechKey)) {
  throw "Set AZURE_SPEECH_KEY (or SPEECH_KEY) in this process before generating narration."
}
if (-not $ApproveExternal) {
  throw "Azure Speech generation requires -ApproveExternal after explicit approval of text processing and cost."
}
if ([string]::IsNullOrWhiteSpace($speechRegion) -or $speechRegion -notmatch "^[a-z0-9-]+$") {
  throw "Set AZURE_SPEECH_REGION (or SPEECH_REGION) to the Azure Speech resource region."
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
  throw "Narration manifest not found: $ManifestPath"
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne "1.0.0" -or $manifest.scenes.Count -ne 8) {
  throw "Narration manifest must use schemaVersion 1.0.0 and contain exactly eight scenes."
}

$profiles = @(
  [ordered]@{ id = "ava-hd-warm"; slot = "A"; label = "A - Ava Dragon HD - warm conversational"; name = "en-US-Ava:DragonHDLatestNeural"; locale = "en-US"; style = "friendly"; degree = 0.65; rate = -2; pauseMs = 180 },
  [ordered]@{ id = "aria-hd-warm"; slot = "B"; label = "B - Aria Dragon HD - warm presenter"; name = "en-US-Aria:DragonHDLatestNeural"; locale = "en-US"; style = "friendly"; degree = 0.65; rate = -2; pauseMs = 180 },
  [ordered]@{ id = "aria-professional"; slot = "C"; label = "C - Aria Neural - professional narration"; name = "en-US-AriaNeural"; locale = "en-US"; style = "narration-professional"; degree = 0.75; rate = -3; pauseMs = 200 }
)
$selectedProfile = $profiles | Where-Object { $_.id -eq $VoiceProfile } | Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($VoiceName)) {
  $VoiceName = $selectedProfile.name
}
if ($VoiceName -notmatch "^[A-Za-z0-9-]+(?::[A-Za-z0-9-]+)?Neural$") {
  throw "VoiceName must be an Azure neural or Dragon HD voice identifier."
}

$voiceLocale = $selectedProfile.locale
$voiceStyle = $selectedProfile.style
$styleDegree = [double]$selectedProfile.degree
$ratePercent = [int]$selectedProfile.rate
$sentencePauseMs = [int]$selectedProfile.pauseMs
if ($voiceLocale -notmatch "^[a-z]{2}-[A-Z]{2}$" -or $voiceStyle -notmatch "^(auto|[a-z][a-z0-9-]{0,39})$" -or $styleDegree -lt 0.01 -or $styleDegree -gt 2 -or $ratePercent -lt -20 -or $ratePercent -gt 20 -or $sentencePauseMs -lt 0 -or $sentencePauseMs -gt 1000) {
  throw "Narration voice settings are invalid."
}

$outputDirectory = Split-Path -Parent $ManifestPath
$serviceUri = "https://$speechRegion.tts.speech.microsoft.com/cognitiveservices/v1"
$headers = @{
  "Ocp-Apim-Subscription-Key" = $speechKey
  "X-Microsoft-OutputFormat" = $manifest.outputFormat
  "User-Agent" = "Skills-Orchestrator-Demo-Narration"
}

if ($Audition) {
  $sampleText = (($manifest.scenes[0].text -split "(?<=[.!?])\s+" | Select-Object -First 3) -join " ")
  $sampleDirectory = Join-Path $outputDirectory "voice-samples"
  if ((Test-Path -LiteralPath $sampleDirectory) -and -not $Force) {
    throw "Voice samples already exist. Use -Force only after replacement approval."
  }
  if (Test-Path -LiteralPath $sampleDirectory) {
    Remove-Item -LiteralPath $sampleDirectory -Recurse -Force
  }
  New-Item -ItemType Directory -Path $sampleDirectory -Force | Out-Null
  $results = @()
  foreach ($profile in $profiles) {
    $target = Join-Path $sampleDirectory "$($profile.id).mp3"
    $ssml = New-SpeechSsml -Text $sampleText -Name $profile.name -Locale $profile.locale -Style $profile.style -Degree $profile.degree -Rate $profile.rate -PauseMs $profile.pauseMs
    $hash = Write-SpeechAudio -Uri $serviceUri -Headers $headers -Ssml $ssml -Target $target -Label $profile.id
    $results += [ordered]@{ id = $profile.id; slot = $profile.slot; label = $profile.label; file = (Split-Path -Leaf $target); voice = $profile.name; style = $profile.style; styleDegree = $profile.degree; ratePercent = $profile.rate; sentencePauseMs = $profile.pauseMs; sha256 = $hash }
    Write-Host "Generated voice sample $($profile.id) sha256:$hash"
  }
  [ordered]@{ schemaVersion = "1.0.0"; generatedAt = (Get-Date).ToUniversalTime().ToString("o"); recommended = "ava-hd-warm"; sampleText = $sampleText; samples = $results } |
    ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $sampleDirectory "voice-samples.json") -Encoding utf8
  $players = ($results | ForEach-Object { "<section><h2>$(ConvertTo-XmlText -Text $_.label)</h2><p>$(ConvertTo-XmlText -Text $_.voice) | $(ConvertTo-XmlText -Text $_.style)</p><audio controls preload=`"metadata`" src=`"$(ConvertTo-XmlText -Text $_.file)`"></audio></section>" }) -join "`n"
  $auditionPage = "<!doctype html><html lang=`"en`"><head><meta charset=`"utf-8`"><meta name=`"viewport`" content=`"width=device-width,initial-scale=1`"><title>Voice Audition</title><style>body{max-width:800px;margin:40px auto;padding:0 20px;font:16px/1.5 Segoe UI,sans-serif;background:#f5f2ea;color:#132129}h1,h2{font-family:Bahnschrift,Segoe UI,sans-serif}section{padding:20px 0;border-top:1px solid #bbc5c3}audio{width:100%}.passage{padding:18px;background:#fffdf8;border-left:5px solid #f05d3d}</style></head><body><h1>Choose the human voice</h1><div class=`"passage`">$(ConvertTo-XmlText -Text $sampleText)</div>$players<p>Listen to A, B, and C, then record an explicit selection.</p></body></html>"
  Set-Content -LiteralPath (Join-Path $sampleDirectory "index.html") -Value $auditionPage -Encoding utf8
  Write-Host "Voice audition complete: $sampleDirectory"
  return
}

foreach ($scene in $manifest.scenes) {
  if ($scene.file -notmatch "^scene-[0-9]{2}\.mp3$") {
    throw "Invalid narration filename in scene $($scene.id)."
  }

  $target = Join-Path $outputDirectory $scene.file
  if ((Test-Path -LiteralPath $target) -and -not $Force) {
    Write-Host "Skipping existing $($scene.file). Use -Force to regenerate it."
    continue
  }

  $ssml = New-SpeechSsml -Text $scene.text -Name $VoiceName -Locale $voiceLocale -Style $voiceStyle -Degree $styleDegree -Rate $ratePercent -PauseMs $sentencePauseMs
  $hash = Write-SpeechAudio -Uri $serviceUri -Headers $headers -Ssml $ssml -Target $target -Label "scene $($scene.id)"
  Write-Host "Generated $($scene.file) sha256:$hash"
}

Write-Host "Narration generation complete using profile $VoiceProfile and voice $VoiceName."