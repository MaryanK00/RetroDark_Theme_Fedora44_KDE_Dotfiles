#!/usr/bin/env bash
# Servidor MCP de GitHub (stdio) para OpenCode.
#
# El token se saca del keyring de `gh auth login` en cada arranque: no se
# escribe en ningun fichero de configuracion, ni en el repo, ni en disco.
#
# Se usa el paquete de npm en vez del binario oficial porque su catalogo de
# herramientas ocupa 4.2k tokens de contexto, frente a los 15k del binario
# oficial en modo solo-lectura y 30k con escritura. Con los modelos gratuitos
# la diferencia se nota. Para cambiar: docs/instalacion-guia.md
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; fi

export GITHUB_PERSONAL_ACCESS_TOKEN="$(gh auth token)"

exec npx -y @modelcontextprotocol/server-github
