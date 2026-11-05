# Hércules MCP - Instalador automático para Windows
# No requiere que el usuario sepa qué es Node.js
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host "       HÉRCULES - Instalador" -ForegroundColor Cyan
Write-Host "  ========================================" -ForegroundColor Cyan
Write-Host ""

function Test-NodeOk {
    try {
        $v = (node -v) -replace 'v',''
        $major = [int]($v.Split('.')[0])
        return $major -ge 20
    } catch { return $false }
}

# ---------- 1. Asegurar Node.js ----------
if (Test-NodeOk) {
    Write-Host "  [OK] Entorno listo" -ForegroundColor Green
} else {
    Write-Host "  [..] Preparando el entorno (solo la primera vez)..." -ForegroundColor Yellow
    Write-Host "      Esto puede tardar 1-3 minutos. No cierres la ventana." -ForegroundColor Gray
    Write-Host ""

    $installed = $false

    # Intento 1: winget (Windows 10/11 moderno)
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "  [..] Descargando componentes necesarios..." -ForegroundColor Yellow
        try {
            winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent 2>$null | Out-Null
            # Refrescar PATH en esta sesión
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            Start-Sleep -Seconds 2
            if (Test-NodeOk) { $installed = $true }
        } catch { }
    }

    # Intento 2: chocolatey si existe
    if (-not $installed -and (Get-Command choco -ErrorAction SilentlyContinue)) {
        try {
            choco install nodejs-lts -y 2>$null | Out-Null
            $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
            if (Test-NodeOk) { $installed = $true }
        } catch { }
    }

    if (-not (Test-NodeOk)) {
        Write-Host ""
        Write-Host "  [!] No se pudo instalar automáticamente." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Haz esto una sola vez:" -ForegroundColor White
        Write-Host "  1. Abre este enlace:  https://nodejs.org" -ForegroundColor Cyan
        Write-Host "  2. Descarga la versión LTS e instálala (Siguiente, Siguiente...)" -ForegroundColor White
        Write-Host "  3. Vuelve a hacer doble clic en instalar.bat" -ForegroundColor White
        Write-Host ""
        Write-Host "  Pulsa una tecla para abrir la página de descarga..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Start-Process "https://nodejs.org"
        exit 1
    }

    Write-Host "  [OK] Entorno preparado correctamente" -ForegroundColor Green
}

# ---------- 2. Dependencias del proyecto ----------
if (Test-Path (Join-Path $ProjectRoot "package.json")) {
    Write-Host "  [..] Instalando Hércules..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    npm install --no-audit --no-fund 2>$null | Out-Null
    Pop-Location
    Write-Host "  [OK] Hércules instalado" -ForegroundColor Green
}

$IndexPath = Join-Path $ProjectRoot "src\index.ts"

# ---------- 3. Configurar Claude Desktop y Cursor ----------
function Set-HerculesConfig {
    param([string]$ConfigPath, [string]$Name)

    $dir = Split-Path $ConfigPath -Parent
    if (-not (Test-Path $dir)) {
        try { New-Item -ItemType Directory -Force -Path $dir | Out-Null } catch { return }
    }

    $herculesEntry = @{
        command = "npx"
        args = @("tsx", $IndexPath)
    }

    try {
        if (Test-Path $ConfigPath) {
            $raw = Get-Content $ConfigPath -Raw -ErrorAction SilentlyContinue
            if ([string]::IsNullOrWhiteSpace($raw)) { $raw = "{}" }
            $json = $raw | ConvertFrom-Json
            if ($null -eq $json.mcpServers) {
                $json | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([PSCustomObject]@{}) -Force
            }
            $json.mcpServers | Add-Member -NotePropertyName "hercules" -NotePropertyValue ([PSCustomObject]$herculesEntry) -Force
            $json | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8
        } else {
            @{ mcpServers = @{ hercules = $herculesEntry } } | ConvertTo-Json -Depth 5 |
                Set-Content -Path $ConfigPath -Encoding UTF8
        }
        Write-Host "  [OK] Conectado a $Name" -ForegroundColor Green
    } catch {
        Write-Host "  [!] No se pudo conectar automáticamente a $Name" -ForegroundColor Yellow
    }
}

$claudeConfigs = @(
    (Join-Path $env:APPDATA "Claude\claude_desktop_config.json"),
    (Join-Path $env:LOCALAPPDATA "Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json")
)
foreach ($cfg in $claudeConfigs) {
    $parent = Split-Path $cfg -Parent
    if ((Test-Path $parent) -or ($cfg -eq $claudeConfigs[0])) {
        Set-HerculesConfig -ConfigPath $cfg -Name "Claude Desktop"
    }
}

$cursorCfg = Join-Path $env:USERPROFILE ".cursor\mcp.json"
if (Test-Path (Split-Path $cursorCfg -Parent)) {
    Set-HerculesConfig -ConfigPath $cursorCfg -Name "Cursor"
}

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Green
Write-Host "       Instalación completada" -ForegroundColor Green
Write-Host "  ========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  AHORA SOLO HAZ ESTO:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Cierra Claude Desktop por completo" -ForegroundColor Yellow
Write-Host "     (incluido el icono de la bandeja del sistema)" -ForegroundColor Gray
Write-Host "  2. Abre Claude Desktop de nuevo" -ForegroundColor Yellow
Write-Host "  3. Escribe en el chat:" -ForegroundColor Yellow
Write-Host ""
Write-Host "        optimiza mi sistema" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Hércules se activará y te guiará." -ForegroundColor Green
Write-Host ""
