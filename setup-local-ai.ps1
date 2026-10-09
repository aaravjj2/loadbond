param([string]$Model = 'qwen3:4b', [string]$RuntimeRoot = (Join-Path $PSScriptRoot '..\..\work\ollama-runtime'))
$ErrorActionPreference = 'Stop'
if ($Model -match 'cloud|[/\\]' -or $Model -notmatch '^[A-Za-z0-9_.:-]+$') { throw 'Only local model identifiers are supported.' }
if ((Get-PSDrive -Name C).Free -lt 10GB) { throw 'Reserve at least 10 GB for the runtime and initial model.' }
$runtimePath = [IO.Path]::GetFullPath($RuntimeRoot)
New-Item -ItemType Directory -Force -Path $runtimePath | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $runtimePath 'ollama.exe'))) {
    $archivePath = Join-Path (Split-Path $runtimePath) 'ollama-runtime.zip'
    Invoke-WebRequest 'https://ollama.com/download/ollama-windows-amd64.zip' -OutFile $archivePath
    Expand-Archive -LiteralPath $archivePath -DestinationPath $runtimePath -Force
}
Write-Host 'Runtime available. In another terminal run .\start-local-ai.ps1, then rerun this script to download the model.'
try { Invoke-RestMethod 'http://127.0.0.1:11434/api/version' -TimeoutSec 2 | Out-Null } catch { exit 0 }
& (Join-Path $runtimePath 'ollama.exe') pull $Model
if ($LASTEXITCODE -ne 0) { throw 'Model download failed.' }
Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' | ConvertTo-Json -Depth 4
