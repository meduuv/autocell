@echo off
setlocal
title Autocell Agent (Dev Mode) - MEDU
cd /d "%~dp0"

echo Starting Autocell in Development Mode...
call npm run dev
pause
