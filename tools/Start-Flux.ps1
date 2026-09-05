[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8810,

    [ValidateRange(1, 65535)]
    [int]$LastPort = 8899,

    [switch]$NoBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($LastPort -lt $Port) {
    throw 'LastPort cannot be lower than Port.'
}

$packageRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodePath = Join-Path $packageRoot 'runtime\node.exe'
$appRoot = Join-Path $packageRoot 'app'
$serverPath = Join-Path $appRoot 'server.js'
$manifestPath = Join-Path $packageRoot 'manifest.sha256'
$verifyScriptPath = Join-Path $packageRoot 'tools\Verify-Files.ps1'

if (-not [System.IO.File]::Exists($nodePath)) {
    throw "内嵌 Node 运行时缺失：$nodePath"
}
if (-not [System.IO.File]::Exists($serverPath)) {
    throw "应用入口缺失：$serverPath"
}
if (-not [System.IO.File]::Exists($manifestPath)) {
    throw "便携包校验清单缺失：$manifestPath"
}
if (-not [System.IO.File]::Exists($verifyScriptPath)) {
    throw "便携包校验脚本缺失：$verifyScriptPath"
}

& $verifyScriptPath

$packageHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$packageId = $packageHash.Substring(0, 16)
$localAppData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
if ([string]::IsNullOrWhiteSpace($localAppData)) {
    throw '无法定位当前用户的 LocalAppData 目录。'
}
$stateRoot = Join-Path $localAppData "FluxEvidenceLab\$packageId"
$logRoot = Join-Path $stateRoot 'logs'
$statePath = Join-Path $stateRoot 'server-state.json'

function Get-FluxHealth {
    param([Parameter(Mandatory)][string]$Uri)

    try {
        $health = Invoke-RestMethod -UseBasicParsing -Uri $Uri -Method Get -TimeoutSec 1
        if ($health.ok -eq $true -and
            $health.status -eq 'ready' -and
            $health.service -eq 'flux-verifiable-btc-agent' -and
            $health.mode -eq 'PAPER_ONLY' -and
            $health.core -eq 'loaded' -and
            $health.verification -eq 'available') {
            return $health
        }
    }
    catch {
        return $null
    }
    return $null
}

function Test-HttpAsset {
    param([Parameter(Mandatory)][string]$Uri)

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method Get -TimeoutSec 2
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Test-TcpPortInUse {
    param([Parameter(Mandatory)][int]$TargetPort)

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $attempt = $client.BeginConnect('127.0.0.1', $TargetPort, $null, $null)
        if (-not $attempt.AsyncWaitHandle.WaitOne(250)) {
            return $false
        }
        $client.EndConnect($attempt)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function ConvertTo-UtcDateTime {
    param([Parameter(Mandatory)]$Value)

    if ($Value -is [DateTimeOffset]) {
        return $Value.UtcDateTime
    }
    if ($Value -is [DateTime]) {
        return $Value.ToUniversalTime()
    }
    return [DateTimeOffset]::Parse(
        [string]$Value,
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind
    ).UtcDateTime
}

if ([System.IO.File]::Exists($statePath)) {
    try {
        $existingState = [System.IO.File]::ReadAllText($statePath) | ConvertFrom-Json
        $existingProcess = Get-Process -Id ([int]$existingState.process_id) -ErrorAction Stop
        $existingPath = [System.IO.Path]::GetFullPath($existingProcess.Path)
        $existingStart = $existingProcess.StartTime.ToUniversalTime()
        $recordedStart = ConvertTo-UtcDateTime -Value $existingState.process_started_at_utc
        $existingPort = [int]$existingState.port
        if ([string]$existingState.package_manifest_sha256 -eq $packageHash -and
            $existingPath.Equals($nodePath, [System.StringComparison]::OrdinalIgnoreCase) -and
            [Math]::Abs(($existingStart - $recordedStart).TotalSeconds) -le 2 -and
            $null -ne (Get-FluxHealth -Uri "http://127.0.0.1:$existingPort/api/health")) {
            $existingUrl = "http://127.0.0.1:$existingPort/#decision-workspace"
            Write-Host "Flux Evidence Lab 已在 $existingUrl 运行。" -ForegroundColor Green
            if (-not $NoBrowser) {
                try {
                    Start-Process $existingUrl
                }
                catch {
                    Write-Warning "浏览器未能自动打开，请手动访问 $existingUrl"
                }
            }
            exit 0
        }
    }
    catch {
        # A stale or unrelated state record is ignored; no process is stopped here.
    }
}

[System.IO.Directory]::CreateDirectory($logRoot) | Out-Null
$oldLogs = @(Get-ChildItem -LiteralPath $logRoot -File -Filter 'server-*.log' | Sort-Object LastWriteTimeUtc -Descending)
foreach ($oldLog in @($oldLogs | Select-Object -Skip 20)) {
    [System.IO.File]::Delete($oldLog.FullName)
}

$previousNodeOptions = [System.Environment]::GetEnvironmentVariable('NODE_OPTIONS', 'Process')
$previousNodePath = [System.Environment]::GetEnvironmentVariable('NODE_PATH', 'Process')
$previousFluxPort = [System.Environment]::GetEnvironmentVariable('FLUX_AGENT_PORT', 'Process')
[System.Environment]::SetEnvironmentVariable('NODE_OPTIONS', $null, 'Process')
[System.Environment]::SetEnvironmentVariable('NODE_PATH', $null, 'Process')

try {
    $nodeVersion = (& $nodePath --version 2>&1 | Out-String).Trim()
    $nodeArchitecture = (& $nodePath -p 'process.arch' 2>&1 | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne 'v24.19.0' -or $nodeArchitecture -ne 'x64') {
        throw "内嵌 Node 运行时不符合预期：version=$nodeVersion, arch=$nodeArchitecture"
    }

    $serverProcess = $null
    $selectedPort = $null
    $stdoutPath = $null
    $stderrPath = $null
    $failureNotes = [System.Collections.Generic.List[string]]::new()

    foreach ($candidatePort in $Port..$LastPort) {
        if (Test-TcpPortInUse -TargetPort $candidatePort) {
            $failureNotes.Add("$candidatePort occupied")
            continue
        }

        $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss-fff')
        $candidateStdout = Join-Path $logRoot "server-$stamp-$candidatePort.stdout.log"
        $candidateStderr = Join-Path $logRoot "server-$stamp-$candidatePort.stderr.log"
        [System.Environment]::SetEnvironmentVariable('FLUX_AGENT_PORT', [string]$candidatePort, 'Process')

        try {
            $candidateProcess = Start-Process `
                -FilePath $nodePath `
                -ArgumentList @('server.js') `
                -WorkingDirectory $appRoot `
                -WindowStyle Hidden `
                -RedirectStandardOutput $candidateStdout `
                -RedirectStandardError $candidateStderr `
                -PassThru
        }
        catch {
            $failureNotes.Add("$candidatePort spawn failed")
            continue
        }

        $candidateReady = $false
        $candidateUrl = "http://127.0.0.1:$candidatePort"
        $lastReadiness = 'health pending'
        for ($attempt = 0; $attempt -lt 80; $attempt += 1) {
            Start-Sleep -Milliseconds 250
            $candidateProcess.Refresh()
            if ($candidateProcess.HasExited) {
                $lastReadiness = "process exited with code $($candidateProcess.ExitCode)"
                break
            }

            $health = Get-FluxHealth -Uri "$candidateUrl/api/health"
            if ($null -eq $health) {
                $lastReadiness = 'identity health check pending'
                continue
            }

            $assetsReady = (Test-HttpAsset -Uri "$candidateUrl/") -and
                (Test-HttpAsset -Uri "$candidateUrl/app.js") -and
                (Test-HttpAsset -Uri "$candidateUrl/style-05.css") -and
                (Test-HttpAsset -Uri "$candidateUrl/styles.css")
            if ($assetsReady) {
                $candidateReady = $true
                break
            }
            $lastReadiness = 'required UI assets pending'
        }

        if ($candidateReady) {
            $serverProcess = $candidateProcess
            $selectedPort = $candidatePort
            $stdoutPath = $candidateStdout
            $stderrPath = $candidateStderr
            break
        }

        if (-not $candidateProcess.HasExited) {
            Stop-Process -Id $candidateProcess.Id -Force -ErrorAction SilentlyContinue
        }
        $failureNotes.Add("$candidatePort did not become ready ($lastReadiness)")
    }
}
finally {
    [System.Environment]::SetEnvironmentVariable('NODE_OPTIONS', $previousNodeOptions, 'Process')
    [System.Environment]::SetEnvironmentVariable('NODE_PATH', $previousNodePath, 'Process')
    [System.Environment]::SetEnvironmentVariable('FLUX_AGENT_PORT', $previousFluxPort, 'Process')
}

if ($null -eq $serverProcess -or $null -eq $selectedPort) {
    $summary = ($failureNotes | Select-Object -Last 8) -join ', '
    throw "端口 $Port-$LastPort 均未能启动服务。最近状态：$summary。日志目录：$logRoot"
}

$url = "http://127.0.0.1:$selectedPort/#decision-workspace"
$state = [ordered]@{
    process_id = $serverProcess.Id
    process_started_at_utc = $serverProcess.StartTime.ToUniversalTime().ToString('o')
    port = $selectedPort
    url = $url
    node_path = $nodePath
    node_version = $nodeVersion
    package_manifest_sha256 = $packageHash
    stdout_log = $stdoutPath
    stderr_log = $stderrPath
    started_at_utc = (Get-Date).ToUniversalTime().ToString('o')
}
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
try {
    [System.IO.File]::WriteAllText(
        $statePath,
        ($state | ConvertTo-Json -Depth 3),
        $utf8WithoutBom
    )
}
catch {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    throw '服务已就绪，但无法保存安全停止所需的状态文件；服务已终止。'
}

Write-Host 'Flux Evidence Lab 已启动。' -ForegroundColor Green
Write-Host "地址：$url"
if ($selectedPort -ne $Port) {
    Write-Host "提示：端口 $Port 已占用，本次自动使用端口 $selectedPort。" -ForegroundColor Yellow
}
Write-Host '模式：PAPER_ONLY（不连接交易所、不连接钱包、不接触真实资金）'
Write-Host '停止：双击 STOP-FLUX.cmd'

if (-not $NoBrowser) {
    try {
        Start-Process $url
    }
    catch {
        Write-Warning "浏览器未能自动打开，请手动访问 $url"
    }
}
