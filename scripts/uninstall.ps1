# dsh-calculator 卸载脚本（由「点我一键卸载.bat」调用）
$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "  $m" -ForegroundColor Gray }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Bad($m)  { Write-Host "  [X]  $m" -ForegroundColor Red }

$dshHome = Join-Path $env:USERPROFILE ".dsh"
$profileDir = Join-Path $dshHome "profiles\desktop"
$manifestPath = Join-Path $profileDir "package.json"
$linkPath = Join-Path $profileDir "node_modules\dsh-calculator"

Write-Host ""
Write-Host "  DSH 计算器 · 卸载" -ForegroundColor Cyan
Write-Host "  ----------------------------------------"

if (-not (Test-Path $manifestPath)) { Bad "找不到 profile 清单：$manifestPath"; exit 1 }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item $manifestPath "$manifestPath.bak-calc-un-$stamp" -Force
Ok "已备份 profile 清单"

$json = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($json.dependencies -and $json.dependencies.PSObject.Properties.Name -contains "dsh-calculator") {
    $json.dependencies.PSObject.Properties.Remove("dsh-calculator")
    Ok "dependencies 已移除"
}
if ($json.dsh -and $json.dsh.profile -and $json.dsh.profile.bundles) {
    $kept = @($json.dsh.profile.bundles | Where-Object { $_ -ne "dsh-calculator" })
    $json.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $kept -Force
    Ok "bundles 已移除（剩 $($kept.Count) 项）"
}
$text = $json | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($manifestPath, $text, (New-Object System.Text.UTF8Encoding($false)))
Ok "profile 清单已写回"

if (Test-Path $linkPath) {
    # 只删联接本身，绝不递归删除（会顺着链接把源目录删掉）
    cmd /c rmdir "$linkPath" | Out-Null
    Ok "已删除 node_modules 联接"
} else {
    Info "没有 node_modules 联接，跳过"
}

Write-Host "  ----------------------------------------"
Write-Host "  卸载完成。完全退出 DSH Desktop 再重开即可。" -ForegroundColor Yellow
Write-Host ""
