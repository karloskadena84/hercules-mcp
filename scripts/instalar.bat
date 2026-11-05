@echo off
chcp 65001 >nul
title Hércules - Instalador
color 0B
echo.
echo   ╔════════════════════════════════════════════╗
echo   ║         HÉRCULES - INSTALADOR              ║
echo   ║     Optimizador de rendimiento             ║
echo   ╚════════════════════════════════════════════╝
echo.
echo   Este programa configurará Hércules en tu PC.
echo   Si falta algo necesario, intentará instalarlo solo.
echo.
echo   No cierres esta ventana hasta que termine.
echo.
pause
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
echo   ────────────────────────────────────────
echo   Si la instalación terminó bien:
echo.
echo   1. Cierra Claude Desktop completamente
echo   2. Vuelve a abrirlo
echo   3. Escribe:  optimiza mi sistema
echo   ────────────────────────────────────────
echo.
pause
