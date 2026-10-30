@echo off
chcp 936 >nul
setlocal
cd /d "%~dp0"

echo.
echo   ============================================
echo     DSH 计算器  ·  一键卸载
echo   ============================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\uninstall.ps1"
set RC=%ERRORLEVEL%

echo.
if "%RC%"=="0" (
  echo   卸完了。完全退出 DSH Desktop 再重开即可。
) else (
  echo   [X] 卸载出错，退出码 %RC%。
)
echo.
pause
exit /b %RC%
