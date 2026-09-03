@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js and npm were not found. Install Node.js 20.19 or newer first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [ERROR] Dependencies are not installed. Run npm install in this directory first.
  pause
  exit /b 1
)

echo Starting Schema-Driven Robot Log Workbench...
echo Keep this window open while using the application.
call npm run dev -- --host 127.0.0.1 --port 5173 --open

if errorlevel 1 (
  echo.
  echo The development server stopped with an error.
  pause
)
