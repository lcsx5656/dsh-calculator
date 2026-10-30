<#
.SYNOPSIS
  一键把 dsh-calculator 推到 GitHub（不需要 gh CLI，自带代理支持）。

.DESCRIPTION
  用 GitHub REST API 建仓库，再用 git 推送。Token 需要 repo 权限（classic）
  或 Repository: Read and write（fine-grained）。

  Token 四种给法，任选其一：
    1) 仓库根目录 .github-token 文件（已写好在 .gitignore 里，不会上传）
    2) 环境变量      $env:GITHUB_TOKEN = "ghp_xxx"
    3) 命令行        .\push-to-github.ps1 -Token "ghp_xxx" -Owner "yourname"
    4) 已登录的 gh   gh auth token

  网络：直连 github.com 被卡时，脚本会自动嗅探本机代理（默认试 7897 / 8080）。

.EXAMPLE
  .\push-to-github.ps1
  .\push-to-github.ps1 -Owner lcsx5656 -ProxyUrl http://127.0.0.1:7897
#>
[CmdletBinding()]
param(
  [string]$Owner,
  [string]$Repo = "dsh-calculator",
  [string]$Token,
  [ValidateSet("public", "private")][string]$Visibility = "public",
  [string]$Description = "DSH 计算器：Ctrl+Q 唤出，支持表达式计算、变量存储、秒/分/小时与时分秒互转",
  [string]$Branch = "main",
  [string]$ProxyUrl,
  [string]$CommitMessage = "chore: 更新 dsh-calculator"
)

$ErrorActionPreference = "Stop"
$repoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $repoDir

function Find-Proxy {
  foreach ($port in 7897, 7890, 7891, 10809, 1080, 8080) {
    $open = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue
    if ($open) { return "http://127.0.0.1:$port" }
  }
  return $null
}

try {
  # ---------- 1. Token ----------
  if (-not $Token -and (Test-Path ".github-token")) {
    $Token = (Get-Content ".github-token" -Raw).Trim()
  }
  if (-not $Token -and $env:GITHUB_TOKEN) { $Token = $env:GITHUB_TOKEN }
  if (-not $Token) {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) { try { $Token = (& $gh.Source auth token 2>$null) } catch { } }
  }
  if (-not $Token) {
    Write-Host "[!] 没有 Token。任选一种给法：" -ForegroundColor Yellow
    Write-Host "    仓库根目录建 .github-token（一行 token） / `$env:GITHUB_TOKEN / -Token ghp_xxx" -ForegroundColor Yellow
    throw "missing token"
  }

  # ---------- 2. 代理 ----------
  if (-not $ProxyUrl) {
    $probe = $null
    try { $probe = (Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings").ProxyServer } catch { }
    if ($probe -match '^(https?://)?([\w\.]+):(\d+)$') { $ProxyUrl = if ($Matches[1]) { $Matches[2..3] -join ':' } else { "http://$($Matches[2]):$($Matches[3])" } }
  }
  if (-not $ProxyUrl) { $ProxyUrl = Find-Proxy }
  $apiArgs = @{}
  if ($ProxyUrl) {
    $apiArgs.Proxy = $ProxyUrl
    Write-Host "[+] 走代理：$ProxyUrl" -ForegroundColor Cyan
    $env:NO_PROXY = ""; $env:no_proxy = ""
    $env:HTTPS_PROXY = $ProxyUrl; $env:HTTP_PROXY = $ProxyUrl
  }

  $headers = @{
    Authorization          = "Bearer $Token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent"           = "dsh-calculator-push"
  }

  # ---------- 3. 身份 ----------
  $me = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers -Method Get @apiArgs
  if (-not $Owner) { $Owner = $me.login }
  Write-Host "[+] 已认证：$($me.login) → $Owner/$Repo" -ForegroundColor Green

  # ---------- 4. 建仓库（存在则跳过） ----------
  $exists = $null
  try {
    $exists = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo" -Headers $headers -Method Get @apiArgs
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
  }
  if ($exists) {
    Write-Host "[=] 仓库已存在：$($exists.html_url)" -ForegroundColor Cyan
  } else {
    $body = @{
      name        = $Repo
      description = $Description
      private     = ($Visibility -eq "private")
      has_issues  = $true
      has_wiki    = $false
      auto_init   = $false
    } | ConvertTo-Json -Depth 5
    $created = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Headers $headers -Method Post `
      -Body ([Text.Encoding]::UTF8.GetBytes($body)) -ContentType "application/json; charset=utf-8" @apiArgs
    Write-Host "[+] 仓库已创建：$($created.html_url)" -ForegroundColor Green
  }

  # ---------- 5. commit ----------
  if (-not (Test-Path ".git")) { git init -b $Branch | Out-Null; Write-Host "[+] git init -b $Branch" -ForegroundColor Green }
  git add -A
  if (git status --porcelain) {
    git -c user.name="$Owner" -c user.email="$Owner@users.noreply.github.com" commit -m $CommitMessage | Out-Null
    Write-Host "[+] 已提交" -ForegroundColor Green
  } else {
    Write-Host "[=] 无新改动" -ForegroundColor Cyan
  }

  # ---------- 6. push（令牌只进内存，不落 .git/config）----------
  $cleanUrl = "https://github.com/$Owner/$Repo.git"
  if ((git remote) -contains "origin") { git remote remove origin | Out-Null }
  git remote add origin $cleanUrl
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$Owner`:$Token"))
  $gitProxy = @()
  if ($ProxyUrl) { $gitProxy = @("-c", "http.proxy=$ProxyUrl") }
  git @gitProxy -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $basic" push -u origin $Branch 2>&1 |
    ForEach-Object { Write-Host "    $_" }
  if ($LASTEXITCODE -ne 0) { throw "git push 失败（退出码 $LASTEXITCODE）" }

  Write-Host ""
  Write-Host "=== 完成 ===" -ForegroundColor Green
  Write-Host "仓库： https://github.com/$Owner/$Repo" -ForegroundColor Green
} finally {
  Pop-Location
  $Token = $null
  $basic = $null
  Remove-Variable Token, basic -ErrorAction SilentlyContinue
}
