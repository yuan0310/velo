@echo off
echo ==========================================
echo   Velo Debug Launcher
echo ==========================================
echo.
echo [1/2] Checking environment...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is NOT installed! Please install it from nodejs.org
    pause
    exit /b
)

echo [2/2] Starting Next.js Dev Server...
echo.
call npm run dev
if %errorlevel% neq 0 (
    echo.
    echo [CRITICAL ERROR] The server failed to start.
    echo Please take a screenshot of the error above and send it to me.
)
echo.
pause
