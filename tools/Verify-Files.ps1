[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$packageRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifestPath = Join-Path $packageRoot 'manifest.sha256'
if (-not [System.IO.File]::Exists($manifestPath)) {
    throw "校验清单缺失：$manifestPath"
}

$rootPrefix = $packageRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$checked = 0
$failures = [System.Collections.Generic.List[string]]::new()
$expectedPaths = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($line in [System.IO.File]::ReadAllLines($manifestPath)) {
    if ([string]::IsNullOrWhiteSpace($line)) {
        continue
    }
    if ($line -notmatch '^([a-f0-9]{64})  (.+)$') {
        $failures.Add("清单格式错误：$line")
        continue
    }

    $expectedHash = $Matches[1]
    $relativePath = $Matches[2].Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    if (-not $expectedPaths.Add($relativePath)) {
        $failures.Add("清单路径重复：$relativePath")
        continue
    }
    $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $packageRoot $relativePath))
    if (-not $candidatePath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        $failures.Add("路径越界：$relativePath")
        continue
    }
    if (-not [System.IO.File]::Exists($candidatePath)) {
        $failures.Add("文件缺失：$relativePath")
        continue
    }

    $actualHash = (Get-FileHash -LiteralPath $candidatePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        $failures.Add("哈希不一致：$relativePath")
    }
    $checked += 1
}

foreach ($file in Get-ChildItem -LiteralPath $packageRoot -File -Recurse) {
    if ($file.FullName.Equals($manifestPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        continue
    }
    $relativePath = $file.FullName.Substring($packageRoot.Length + 1)
    if (-not $expectedPaths.Contains($relativePath)) {
        $failures.Add("清单外文件：$relativePath")
    }
}

if ($failures.Count -gt 0) {
    Write-Host '便携包完整性校验失败：' -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host " - $failure"
    }
    throw "便携包完整性校验失败，共 $($failures.Count) 项。"
}

Write-Host "便携包完整性校验通过：$checked 个文件。" -ForegroundColor Green
Write-Host '注意：完整性校验不证明上游数据、模型判断或策略收益。'
