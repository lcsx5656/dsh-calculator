@echo off
chcp 936 >nul
setlocal
cd /d "%~dp0"

echo.
echo   ============================================
echo     DSH 计算器  ·  一键安装
echo   ============================================
echo.

where powershell >nul 2>nul
if errorlevel 1 (
  echo   [X] 找不到 powershell，装不了。
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo   装好了。记得完全退出 DSH Desktop 再重开。
) else (
  echo   [X] 安装失败，退出码 %RC%。上面有具体原因。
)
echo.
pause
exit /b %RC%
