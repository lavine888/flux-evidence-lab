[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$expectedNodePath = [System.IO.Path]::GetFullPath((Join-Path $packageRoot 'runtime\node.exe'))
$manifestPath = Join-Path $packageRoot 'manifest.sha256'
if (-not [System.IO.File]::Exists($manifestPath)) {
    throw '便携包校验清单缺失；为避免停止错误进程，本脚本未执行终止。'
}
$packageHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$packageId = $packageHash.Substring(0, 16)
$localAppData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
$statePath = Join-Path $localAppData "FluxEvidenceLab\$packageId\server-state.json"

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

if (-not [System.IO.File]::Exists($statePath)) {
    Write-Host '没有找到由本便携包启动的服务记录；未停止任何进程。'
    exit 0
}

try {
    $state = [System.IO.File]::ReadAllText($statePath) | ConvertFrom-Json
}
catch {
    throw '启动状态文件无法读取。为避免停止错误进程，请手动关闭对应的 node.exe。'
}

if ([string]$state.package_manifest_sha256 -ne $packageHash) {
    throw '启动状态与当前便携包哈希不一致；为避免停止错误进程，本脚本未执行终止。'
}

$processId = [int]$state.process_id
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
if ($null -eq $process) {
    [System.IO.File]::Delete($statePath)
    Write-Host '服务进程已经结束，已清理旧状态记录。'
    exit 0
}

$actualProcessPath = $null
try {
    $actualProcessPath = [System.IO.Path]::GetFullPath($process.Path)
}
catch {
    throw "无法确认 PID $processId 的可执行文件路径；为避免停止错误进程，本脚本未执行终止。"
}
if (-not $actualProcessPath.Equals($expectedNodePath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "PID $processId 不属于本便携包的内嵌 Node；本脚本未执行终止。"
}

$recordedStart = ConvertTo-UtcDateTime -Value $state.process_started_at_utc
$actualStart = $process.StartTime.ToUniversalTime()
if ([Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -gt 2) {
    throw "PID $processId 的启动时间与记录不一致；本脚本未执行终止。"
}

$processDetails = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction Stop
$commandLine = [string]$processDetails.CommandLine
if (-not $commandLine.Contains('server.js')) {
    throw "PID $processId 的命令行不包含本包服务入口；本脚本未执行终止。"
}

Stop-Process -Id $processId -Force
$process.WaitForExit(5000) | Out-Null
[System.IO.File]::Delete($statePath)
Write-Host 'Flux Evidence Lab 已停止。' -ForegroundColor Green
