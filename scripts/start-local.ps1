$ErrorActionPreference = 'Stop'
$taskProjectPath = Split-Path -Parent $PSScriptRoot
$taskUrl = 'http://127.0.0.1:5173/'
$taskListener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue

if ($taskListener) {
    $taskExistingResponse = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 5
    if (-not $taskExistingResponse.Content.Contains('Nexus VA')) {
        throw 'Port 5173 is already used by another application.'
    }
    Write-Output "Nexus VA is already running: $taskUrl"
    exit 0
}

$taskVitePath = Join-Path $taskProjectPath 'node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $taskVitePath)) {
    throw 'Dependencies are missing. Run npm install first.'
}

$taskLogDirectory = Join-Path $taskProjectPath '.local'
New-Item -ItemType Directory -Path $taskLogDirectory -Force | Out-Null
$taskNodePath = (Get-Command node -ErrorAction Stop).Source
$taskServerEntry = Join-Path $taskProjectPath 'scripts/local-server.mjs'
# WMI starts the server outside the calling terminal's process tree. It remains
# available when that terminal or the assistant's command session closes.
$taskStartup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0 }
$taskStarted = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine = ('"{0}" "{1}"' -f $taskNodePath, $taskServerEntry)
    CurrentDirectory = $taskProjectPath
    ProcessStartupInformation = $taskStartup
}
if ($taskStarted.ReturnValue -ne 0) {
    throw "Windows could not start the background server (code $($taskStarted.ReturnValue))."
}
$taskServerId = $taskStarted.ProcessId

for ($taskAttempt = 0; $taskAttempt -lt 20; $taskAttempt++) {
    if (-not (Get-Process -Id $taskServerId -ErrorAction SilentlyContinue)) {
        throw 'The server could not start. See .local/local-server.log.'
    }
    try {
        $taskResponse = Invoke-WebRequest -Uri $taskUrl -UseBasicParsing -TimeoutSec 1
        if ($taskResponse.StatusCode -eq 200 -and $taskResponse.Content.Contains('Nexus VA')) {
            Write-Output "Nexus VA is running in the background: $taskUrl"
            exit 0
        }
    } catch {
        # A refused connection is expected while Vite starts.
    }
    Start-Sleep -Milliseconds 250
}
throw 'The server did not become ready. See .local/local-server.log.'
