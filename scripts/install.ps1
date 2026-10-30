# dsh-calculator 安装脚本（由「点我一键安装.bat」调用）
# 干三件事：备份 profile 清单 → 写依赖与 bundles → 在 node_modules 建目录联接
# 全程打印每一步；任何一步失败立刻停下并报错，绝不半装。

$ErrorActionPreference = "Stop"

function Info($m) { Write-Host "  $m" -ForegroundColor Gray }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Bad($m)  { Write-Host "  [X]  $m" -ForegroundColor Red }

$pluginDir = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $pluginDir "package.json"))) {
    Bad "找不到插件清单，脚本位置不对：$pluginDir"
    exit 1
}

$dshHome = Join-Path $env:USERPROFILE ".dsh"
$profileDir = Join-Path $dshHome "profiles\desktop"
$manifestPath = Join-Path $profileDir "package.json"
$nmDir = Join-Path $profileDir "node_modules"
$linkPath = Join-Path $nmDir "dsh-calculator"

Write-Host ""
Write-Host "  DSH 计算器 · 安装" -ForegroundColor Cyan
Write-Host "  ----------------------------------------"
Info "插件目录   $pluginDir"
Info "profile    $profileDir"

if (-not (Test-Path $manifestPath)) {
    Bad "找不到 $manifestPath —— 你的 DSH 可能不是 Desktop 版，或没跑过"
    exit 1
}

# ---- 1. 备份 ----
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = "$manifestPath.bak-calc-$stamp"
Copy-Item $manifestPath $backup -Force
Ok "已备份 profile 清单 → $(Split-Path -Leaf $backup)"

# ---- 2. 改清单 ----
$json = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $json.dependencies) {
    $json | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{}) -Force
}
$json.dependencies | Add-Member -NotePropertyName "dsh-calculator" -NotePropertyValue "file:../../plugins/dsh-calculator" -Force
Ok "dependencies 已写入 dsh-calculator"

if (-not $json.dsh) {
    $json | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{}) -Force
}
if (-not $json.dsh.profile) {
    $json.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{}) -Force
}
$bundles = @()
if ($json.dsh.profile.bundles) { $bundles = @($json.dsh.profile.bundles) }
if ($bundles -notcontains "dsh-calculator") {
    $bundles += "dsh-calculator"
    $json.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue $bundles -Force
    Ok "bundles 已追加 dsh-calculator（共 $($bundles.Count) 项）"
} else {
    Info "bundles 里已经有 dsh-calculator，跳过"
}

# 无 BOM UTF-8 写回，Node 的 JSON.parse 才不炸
$text = $json | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText($manifestPath, $text, (New-Object System.Text.UTF8Encoding($false)))
Ok "profile 清单已写回（无 BOM）"

# ---- 3. 目录联接 ----
if (-not (Test-Path $nmDir)) { New-Item -ItemType Directory -Force -Path $nmDir | Out-Null }

$existing = Get-Item $linkPath -Force -ErrorAction SilentlyContinue
if ($existing) {
    $target = $null
    if ($existing.LinkType -eq "Junction" -or $existing.LinkType -eq "SymbolicLink") { $target = $existing.Target }
    if ($target -and (@($target) -contains $pluginDir)) {
        Info "目录联接已存在且指向本插件，跳过"
    } else {
        cmd /c rmdir "$linkPath" 2>$null | Out-Null
        cmd /c mklink /J "$linkPath" "$pluginDir" | Out-Null
        Ok "已替换旧的 node_modules\dsh-calculator 联接"
    }
} else {
    cmd /c mklink /J "$linkPath" "$pluginDir" | Out-Null
    Ok "已建立 node_modules\dsh-calculator 联接"
}

if (-not (Test-Path (Join-Path $linkPath "client.js"))) {
    Bad "联接建好了但读不到 client.js，请检查权限"
    exit 1
}

Write-Host "  ----------------------------------------"
Write-Host "  装好了。现在【完全退出 DSH Desktop 再重开】" -ForegroundColor Yellow
Write-Host "  （关窗口不算，要退出进程 / 托盘退出）" -ForegroundColor Yellow
Write-Host "  重开后按 Ctrl+Q 唤出计算器。" -ForegroundColor Yellow
Write-Host ""
