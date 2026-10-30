#!/usr/bin/env bash
# Servidor MCP de GitHub (stdio) para OpenCode.
#
# El token se saca del keyring de `gh auth login` en cada arranque: no se
# escribe en ningun fichero de configuracion, ni en el repo, ni en disco.
#
# Se usa el paquete de npm en vez del binario oficial porque su catalogo de
# herramientas ocupa 4.2k tokens de contexto, frente a los 15k del binario
# oficial en modo solo-lectura y 30k con escritura. Con los modelos gratuitos
# la diferencia se nota. Para cambiar: docs/opencode.md
set -euo pipefail

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh"; fi

# Version fijada a proposito: `npx -y paquete` sin version descarga la ultima
# publicada en cada arranque, y a este proceso se le pasa un token de GitHub.
# Un paquete comprometido se lo llevaria. Al actualizar, cambiar la version
# aqui de forma consciente.
#
# El token se saca del keyring de `gh auth login` (scopes amplios: repo,
# workflow, gist, read:org). Si algun dia quieres limitarlo, crea un PAT
# fine-grained y exporta GITHUB_MCP_TOKEN en ~/.config/opencode/secrets.env:
# este script lo prefiere y solo cae a `gh auth token` si no existe.
export GITHUB_PERSONAL_ACCESS_TOKEN="${GITHUB_MCP_TOKEN:-$(gh auth token)}"

exec npx -y @modelcontextprotocol/server-github@2025.4.8
