param([switch]$ResumeExtracted)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$sourceSha = 'b7e523b7c4651a8682f5e182733604e5e463316d'
$out = Join-Path $repo 'outputs/raid-fixes-live'
$stage = Join-Path $out 'source-b7e523b'
if ((Test-Path -LiteralPath $stage) -and -not $ResumeExtracted) { throw 'Stage already exists; inspect it instead of overwriting.' }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
$archive = Join-Path $out 'source-b7e523b.tar'
& git -C $repo archive --format=tar -o $archive $sourceSha
if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }
& tar -xf $archive -C $stage
if ($LASTEXITCODE -ne 0) { throw 'archive extraction failed' }
$forbidden = Get-ChildItem -LiteralPath $stage -Force | Where-Object { $_.Name -in @('.git','node_modules','.next','outputs') -or ($_.Name -like '.env*' -and $_.Name -ne '.env.example') }
if ($forbidden) { throw 'Unexpected private/generated top-level file in source archive' }
$files = Get-ChildItem -LiteralPath $stage -File -Recurse | ForEach-Object {
  [pscustomobject]@{path=$_.FullName.Substring($stage.Length+1).Replace('\','/');sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower()}
}
@{sourceSha=$sourceSha;stage=$stage;archiveSha256=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower();files=$files} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $out 'stage-manifest.json') -Encoding utf8
Write-Output "Prepared exact source $sourceSha ($($files.Count) files). No deployment performed."
