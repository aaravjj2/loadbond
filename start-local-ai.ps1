param([string]$RuntimeRoot = (Join-Path $PSScriptRoot '..\..\work\ollama-runtime'), [string]$ModelRoot = (Join-Path $PSScriptRoot '..\..\work\ollama-models'))
$ErrorActionPreference = 'Stop'
if (Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue) { throw 'Port 11434 is occupied. Existing model services will not be stopped.' }
$runtimeExecutable = Join-Path ([IO.Path]::GetFullPath($RuntimeRoot)) 'ollama.exe'
if (-not (Test-Path -LiteralPath $runtimeExecutable)) { throw 'Run setup-local-ai.ps1 first.' }
$priorModels = $env:OLLAMA_MODELS
$priorHost = $env:OLLAMA_HOST
$priorCloud = $env:OLLAMA_NO_CLOUD
try {
    $env:OLLAMA_MODELS = [IO.Path]::GetFullPath($ModelRoot)
    $env:OLLAMA_HOST = '127.0.0.1:11434'
    $env:OLLAMA_NO_CLOUD = '1'
    & $runtimeExecutable serve
} finally {
    $env:OLLAMA_MODELS = $priorModels
    $env:OLLAMA_HOST = $priorHost
    $env:OLLAMA_NO_CLOUD = $priorCloud
}
