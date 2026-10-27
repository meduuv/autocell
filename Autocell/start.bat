@echo off
setlocal
title Autocell Agent by MEDU

:: Change directory to script folder
cd /d "%~dp0"

echo ========================================================
echo   AUTOCELL - AI Spreadsheet Quality ^& Cleanup Agent
echo                    by MEDU
echo ========================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js version 18 or newer from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 2. Check root dependencies
if not exist "node_modules\" (
    echo [INFO] Installing server dependencies...
    call npm install --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install server dependencies.
        pause
        exit /b 1
    )
)

:: 3. Check client dependencies
if not exist "client\node_modules\" (
    echo [INFO] Installing client dependencies...
    call npm --prefix client install --no-audit --no-fund
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to install client dependencies.
        pause
        exit /b 1
    )
)

:: 4. Check client build
if not exist "client\dist\" (
    echo [INFO] Building frontend client...
    call npm --prefix client run build
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to build client application.
        pause
        exit /b 1
    )
)

:: 5. Check server build
if not exist "dist\server\index.js" (
    echo [INFO] Compiling backend server...
    call npm run build:server
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to build server.
        pause
        exit /b 1
    )
)

:: 6. Launch browser & start server
echo.
echo [INFO] Starting Autocell server at http://localhost:7777 ...
echo [INFO] Opening default browser...
start "" "http://localhost:7777"
echo.

node dist\server\index.js

if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] Server stopped with error code %ERRORLEVEL%.
    pause
)
