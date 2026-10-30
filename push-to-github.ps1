<#
.SYNOPSIS
  一键把 dsh-calculator 推到 GitHub（不需要 gh CLI）。

.DESCRIPTION
  用 GitHub REST API 建仓库，再用 git 推送。Token 需要 repo 权限（classic）或
  Repository: Read and write（fine-grained）。

  三种给 Token 的方式，任选一个：
    1) 环境变量：  $env:GITHUB_TOKEN = "ghp_xxx"
    2) 命令行：    .\push-to-github.ps1 -Token "ghp_xxx" -Owner "yourname"
    3) 本地文件：  在仓库根目录建 .github-token，只写一行 token（已在 .gitignore 里）

.EXAMPLE
  .\push-to-github.ps1 -Owner "yourname" -Repo "dsh-calculator" -Visibility public -Description "DSH 计算器：Ctrl+Q 唤出，表达式计算 + 时间换算 + 变量存储"
#>
[CmdletBinding()]
param(
  [string]$Owner,
  [string]$Repo = "dsh-calculator",
  [string]$Token,
  [ValidateSet("public", "private")][string]$Visibility = "public",
  [string]$Description = "DSH 计算器：Ctrl+Q 唤出，支持表达式计算、变量存储、秒/分/小时与时分秒互转",
  [string]$Branch = "main",
  [string]$CommitMessage = "feat: dsh-calculator v1.0.0 — Ctrl+Q 浮动计算器（表达式引擎 + 时间换算 + 变量存储）"
)

$ErrorActionPreference = "Stop"
$repoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repoDir
try {
  # ---------- 1. 找 Token ----------
  if (-not $Token -and $env:GITHUB_TOKEN) { $Token = $env:GITHUB_TOKEN }
  if (-not $Token -and (Test-Path ".github-token")) {
    $Token = (Get-Content ".github-token" -Raw).Trim()
  }
  if (-not $Token) {
    Write-Host "[!] 没有 Token。三种给法任选其一：" -ForegroundColor Yellow
    Write-Host "    `$env:GITHUB_TOKEN = 'ghp_xxx' 后重跑；或 -Token ghp_xxx；或在仓库根目录建 .github-token" -ForegroundColor Yellow
    throw "missing token"
  }
  $headers = @{
    Authorization          = "Bearer $Token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"           = "dsh-calculator-push"
  }

  # ---------- 2. 确认身份 ----------
  $me = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method Get
  if (-not $Owner) { $Owner = $me.login }
  Write-Host "[+] 已认证：$($me.login) → 目标仓库 $Owner/$Repo" -ForegroundColor Green

  # ---------- 3. 建仓库（已存在则跳过） ----------
  $exists = $null
  try {
    $exists = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo" -Headers $headers -Method Get
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
  }

  if ($exists) {
    Write-Host "[=] 仓库已存在，直接推送：$($exists.html_url)" -ForegroundColor Cyan
  } else {
    $body = @{
      name        = $Repo
      description = $Description
      private     = ($Visibility -eq "private")
      has_issues  = $true
      has_wiki    = $false
      auto_init   = $false
    } | ConvertTo-Json -Depth 5
    $created = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post -Body $body -ContentType "application/json; charset=utf-8"
    Write-Host "[+] 仓库已创建：$($created.html_url)" -ForegroundColor Green
  }

  # ---------- 4. git init / commit / remote / push ----------
  if (-not (Test-Path ".git")) {
    git init -b $Branch | Out-Null
    Write-Host "[+] git init -b $Branch" -ForegroundColor Green
  }
  git add -A
  $staged = git status --porcelain
  if ($staged) {
    git -c user.name="$Owner" -c user.email="$Owner@users.noreply.github.com" commit -m $CommitMessage | Out-Null
    Write-Host "[+] 已提交" -ForegroundColor Green
  } else {
    Write-Host "[=] 没有新改动需要提交" -ForegroundColor Cyan
  }

  $remoteUrl = "https://$Owner`:$Token@github.com/$Owner/$Repo.git"
  $cleanUrl  = "https://github.com/$Owner/$Repo.git"
  if ((git remote) -contains "origin") { git remote remove origin | Out-Null }
  git remote add origin $cleanUrl

  # 用 -c http.extraheader 传令牌，避免 token 落进 .git/config
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$Owner`:$Token"))
  git -c http.extraheader="AUTHORIZATION: basic $basic" push -u origin $Branch 2>&1 | ForEach-Object { Write-Host "    $_" }

  if ($LASTEXITCODE -ne 0) { throw "git push 失败（退出码 $LASTEXITCODE）" }

  Write-Host ""
  Write-Host "=== 完成 ===" -ForegroundColor Green
  Write-Host "仓库： https://github.com/$Owner/$Repo" -ForegroundColor Green
  Write-Host "提交： $CommitMessage"
} finally {
  Pop-Location
  $Token = $null
  $basic = $null
}
