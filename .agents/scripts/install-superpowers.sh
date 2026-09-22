#!/usr/bin/env bash
# Instala el plugin "superpowers" de Claude Code (marketplace obra/superpowers) en esta máquina.
# Uso: bash .agents/scripts/install-superpowers.sh
set -euo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "No se encontró el comando 'claude' en el PATH. Instala Claude Code CLI primero: https://claude.com/claude-code" >&2
  exit 1
fi

echo "Verificando marketplaces configurados..."
if claude plugin marketplace list 2>&1 | grep -q "superpowers-dev"; then
  echo "Marketplace 'superpowers-dev' ya está configurado."
else
  echo "Agregando marketplace 'superpowers-dev' (obra/superpowers)..."
  claude plugin marketplace add obra/superpowers
fi

echo "Verificando plugins instalados..."
if claude plugin list 2>&1 | grep -q "superpowers@superpowers-dev"; then
  echo "El plugin 'superpowers' ya está instalado."
else
  echo "Instalando plugin 'superpowers'..."
  claude plugin install superpowers@superpowers-dev -y
fi

echo ""
echo "Listo. Reinicia Claude Code CLI para que las skills carguen (instalación de scope 'user': aplica a todos los proyectos en esta máquina)."
