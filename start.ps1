param([string]$Python = 'python', [string]$PackageManager = 'pnpm', [int]$FrontendPort = 3001, [int]$BackendPort = 8000, [switch]$Production, [switch]$SmokeTest)
$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
if ($FrontendPort -eq $BackendPort -or $FrontendPort -lt 1024 -or $FrontendPort -gt 65535 -or $BackendPort -lt 1024 -or $BackendPort -gt 65535) { throw 'Choose distinct ports between 1024 and 65535.' }
foreach ($port in @($FrontendPort, $BackendPort)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is occupied. Choose another port; existing processes will not be stopped." }
}
if (-not (Test-Path -LiteralPath "$projectPath\.venv\Scripts\python.exe")) {
    & $Python -m venv "$projectPath\.venv"
    if ($LASTEXITCODE -ne 0) { throw 'Python environment creation failed.' }
    & "$projectPath\.venv\Scripts\python.exe" -m pip install -r "$projectPath\backend\requirements.lock.txt"
    if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
}
if (-not (Test-Path -LiteralPath "$projectPath\frontend\node_modules")) {
    Push-Location "$projectPath\frontend"
    & $PackageManager install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
    Pop-Location
}
function Stop-OwnedTree([int]$rootId) {
    $allProcesses = Get-CimInstance Win32_Process
    $ownedIds = [System.Collections.Generic.List[int]]::new()
    $ownedIds.Add($rootId)
    for ($index = 0; $index -lt $ownedIds.Count; $index++) {
        foreach ($child in ($allProcesses | Where-Object ParentProcessId -eq $ownedIds[$index])) { $ownedIds.Add([int]$child.ProcessId) }
    }
    for ($index = $ownedIds.Count - 1; $index -ge 0; $index--) { Stop-Process -Id $ownedIds[$index] -ErrorAction SilentlyContinue }
}
$backendProcess = $null
$frontendProcess = $null
$priorApiUrl = $env:LOADBOND_API_URL
try {
    $backendProcess = Start-Process -FilePath "$projectPath\.venv\Scripts\python.exe" -ArgumentList '-m','uvicorn','backend.main:app','--host','127.0.0.1','--port',"$BackendPort" -WorkingDirectory $projectPath -WindowStyle Hidden -PassThru
    $healthy = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if ($backendProcess.HasExited) { throw 'Backend exited during startup.' }
        try { $healthy = (Invoke-RestMethod "http://127.0.0.1:$BackendPort/health" -TimeoutSec 1).status -eq 'ok' } catch {}
        if ($healthy) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $healthy) { throw 'Backend readiness check failed.' }
    $env:LOADBOND_API_URL = "http://127.0.0.1:$BackendPort"
    $nextMode = if ($Production) { 'start' } else { 'dev' }
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $frontendProcess = Start-Process -FilePath $nodePath -ArgumentList 'node_modules/next/dist/bin/next', $nextMode, '--hostname','127.0.0.1','--port',"$FrontendPort" -WorkingDirectory "$projectPath\frontend" -WindowStyle Hidden -PassThru
    $frontendReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($frontendProcess.HasExited) { throw 'Frontend exited during startup.' }
        try { $frontendReady = (Invoke-WebRequest "http://127.0.0.1:$FrontendPort" -TimeoutSec 2).StatusCode -eq 200 } catch {}
        if ($frontendReady) { break }
        Start-Sleep -Milliseconds 250
    }
    if (-not $frontendReady) { throw 'Frontend readiness check failed.' }
    Write-Host "LoadBond ready: http://127.0.0.1:$FrontendPort — local demo token: local-demo"
    if ($SmokeTest) { return }
    Write-Host 'Leave this terminal running. Ctrl+C stops only the application processes started here.'
    while (-not $frontendProcess.HasExited -and -not $backendProcess.HasExited) { Start-Sleep -Seconds 1 }
} finally {
    if ($frontendProcess) { Stop-OwnedTree $frontendProcess.Id }
    if ($backendProcess) { Stop-OwnedTree $backendProcess.Id }
    $env:LOADBOND_API_URL = $priorApiUrl
}
