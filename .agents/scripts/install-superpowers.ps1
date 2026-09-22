# Instala el plugin "superpowers" de Claude Code (marketplace obra/superpowers) en esta máquina.
# Uso: powershell -ExecutionPolicy Bypass -File .agents\scripts\install-superpowers.ps1

$ErrorActionPreference = "Stop"

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Error "No se encontró el comando 'claude' en el PATH. Instala Claude Code CLI primero: https://claude.com/claude-code"
    exit 1
}

Write-Host "Verificando marketplaces configurados..."
$marketplaces = claude plugin marketplace list 2>&1 | Out-String
if ($marketplaces -match "superpowers-dev") {
    Write-Host "Marketplace 'superpowers-dev' ya está configurado."
} else {
    Write-Host "Agregando marketplace 'superpowers-dev' (obra/superpowers)..."
    claude plugin marketplace add obra/superpowers
}

Write-Host "Verificando plugins instalados..."
$installed = claude plugin list 2>&1 | Out-String
if ($installed -match "superpowers@superpowers-dev") {
    Write-Host "El plugin 'superpowers' ya está instalado."
} else {
    Write-Host "Instalando plugin 'superpowers'..."
    claude plugin install superpowers@superpowers-dev -y
}

Write-Host ""
Write-Host "Listo. Reinicia Claude Code CLI para que las skills carguen (instalación de scope 'user': aplica a todos los proyectos en esta máquina)."
