param([switch]$Execute, [Parameter(Mandatory=$true)][string]$PreviewEnvFile)
if($Execute){throw 'Superseded: use deploy-preview-rest-parent.mjs. CLI skip-domain rejects Preview before transmission.'}
# Parent operator only. Preparation/default execution never deploys.
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$out = Join-Path $repo 'outputs/raid-step6'
$manifest = Get-Content -LiteralPath (Join-Path $out 'stage-manifest.json') -Raw | ConvertFrom-Json
$sourceSha = '2d2d2b1563e92f1471f9c86fa8a7cc59040ec726'
if ($manifest.sourceSha -ne $sourceSha) { throw 'Source SHA mismatch' }
$stage = $manifest.stage
if ((Resolve-Path -LiteralPath $stage).Path -ne (Join-Path $out 'source-2d2d2b1')) { throw 'Unexpected staging directory' }
foreach($file in $manifest.files) {
  if ((Get-FileHash -LiteralPath (Join-Path $stage $file.path) -Algorithm SHA256).Hash.ToLower() -ne $file.sha256) { throw "Staging drift: $($file.path)" }
}
$extra = Get-ChildItem -LiteralPath $stage -File -Recurse | Where-Object {$_.FullName.Substring($stage.Length+1).Replace('\','/') -notin $manifest.files.path}
if ($extra) { throw 'Unexpected staged files' }
$values=@{}
Get-Content -LiteralPath $PreviewEnvFile | ForEach-Object { if($_ -match '^([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]]=$Matches[2].Trim('"') } }
$expected=@{NEXT_PUBLIC_SUPABASE_URL='https://sufvuqdnqohpfzkwxohq.supabase.co';NEXT_PUBLIC_APP_ENV='preview';NEXT_PUBLIC_USE_MOCK_DB='false';NEXT_PUBLIC_RAID_ROOM_UI_ENABLED='true'}
foreach($key in $expected.Keys){if($values[$key] -ne $expected[$key]){throw "Preview env mismatch: $key"}}
$publicKey=$values.NEXT_PUBLIC_SUPABASE_ANON_KEY
if(-not $publicKey){throw 'Preview public key missing'}
if($publicKey.StartsWith('eyJ')) {
  $part=$publicKey.Split('.')[1].Replace('-','+').Replace('_','/'); $part=$part.PadRight($part.Length+(4-$part.Length%4)%4,'=')
  $claims=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($part)) | ConvertFrom-Json
  if($claims.ref -ne 'sufvuqdnqohpfzkwxohq' -or $claims.role -ne 'anon'){throw 'Preview key identity mismatch'}
} else { throw 'Review public-key format before deploying' }
if(-not $Execute){Write-Output 'Validated exact staging and Preview environment. Parent must pass -Execute after SQL postflight.'; exit 0}
# No .git directory and no branch metadata: never assign a shared branch alias.
$arguments=@('--yes','vercel@59.13.1','deploy',$stage,'--yes','--scope','kiyoshi-kitamura','--project','prj_He8QAAwvfwm74FWq2Vb8BFHCbEXb','--target','preview','--skip-domain','--meta',"raidSourceSha=$sourceSha",'--meta',"gitCommitSha=$sourceSha",'--no-wait','--json')
foreach($key in @('NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_APP_ENV','NEXT_PUBLIC_USE_MOCK_DB','NEXT_PUBLIC_RAID_ROOM_UI_ENABLED','NEXT_PUBLIC_SUPABASE_ANON_KEY')){$arguments+=@('--build-env',"$key=$($values[$key])",'--env',"$key=$($values[$key])")}
$oldCeiling=$env:GIT_CEILING_DIRECTORIES
try {
  $env:GIT_CEILING_DIRECTORIES=(Resolve-Path -LiteralPath $out).Path
  Push-Location -LiteralPath $stage
  $ErrorActionPreference='Continue'
  $gitProbe = & git rev-parse --show-toplevel 2>$null
  $ErrorActionPreference='Stop'
  if($LASTEXITCODE -eq 0){throw 'Staging unexpectedly resolves an enclosing Git repository'}
  $ErrorActionPreference='Continue'
  $result = & npx.cmd @arguments 2>&1
  $exitCode=$LASTEXITCODE
  $ErrorActionPreference='Stop'
} finally {
  Pop-Location
  $env:GIT_CEILING_DIRECTORIES=$oldCeiling
}
$clean=($result -join "`n").Replace($publicKey,'[PUBLIC_KEY_REDACTED]')
$clean=$clean -replace 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+','[JWT_REDACTED]'
$clean | Set-Content -LiteralPath (Join-Path $out 'deploy-result.log') -Encoding utf8
Write-Output $clean
exit $exitCode
