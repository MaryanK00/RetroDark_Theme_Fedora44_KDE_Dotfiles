#!/usr/bin/env bash
# Enlaza el runtime de Solid al plugin local opencode-voice-tts.
#
# El panel lateral se dibuja con el runtime de Solid (@opentui/solid), igual
# que hace el plugin de Whisper. Para que funcione, el plugin tiene que
# importar LA MISMA instancia que usa el TUI: si importa otra copia, su
# contexto de Solid es otro distinto y el <text> revienta al dibujarse
# ("No renderer found" -> "opencode-voice-tts/tui crashed in slot sidebar").
#
# La copia buena es la que instala el plugin de Whisper en la cache de npm de
# OpenCode. Se enlaza al node_modules del plugin local para que el
# especificador "@opentui/solid" resuelva a ESA misma ruta (y Bun reutilice la
# instancia ya cargada por el TUI).
#
# Idempotente: se puede llamar las veces que haga falta.
set -uo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="$RAIZ/files/config/opencode/plugins/opencode-voice-tts/node_modules"
CACHE="$HOME/.cache/opencode/npm"

log() { printf '  %s\n' "$*"; }

RUTA_SOLID=""
RUTA_ALT=""

buscar_solid() {
    local dir="$1" profundidad="$2" sub candidato
    [ "$profundidad" -gt 5 ] && return 1
    for sub in "$dir"/*/; do
        [ -d "$sub" ] || continue
        candidato="$sub/node_modules/@opentui/solid"
        if [ -d "$candidato" ]; then
            # Se prefiere la copia del plugin de Whisper: es la que usa el TUI.
            case "$candidato" in
                *@juliuskb*) RUTA_SOLID="$candidato" ;;
                *) [ -n "$RUTA_ALT" ] || RUTA_ALT="$candidato" ;;
            esac
            [ -n "$RUTA_SOLID" ] && return 0
        fi
        if buscar_solid "$sub" $((profundidad + 1)); then
            return 0
        fi
    done
    return 1
}

if [ ! -d "$CACHE" ]; then
    log "no hay cache de npm de OpenCode ($CACHE); el panel lateral no se dibujara"
    exit 0
fi

buscar_solid "$CACHE" 0 || true
[ -n "$RUTA_SOLID" ] || RUTA_SOLID="$RUTA_ALT"

if [ -z "$RUTA_SOLID" ]; then
    log "no se encontro @opentui/solid en la cache de npm"
    exit 0
fi

# <raiz>/node_modules/@opentui/solid -> <raiz>/node_modules
RAIZ_MODULES="$(dirname "$(dirname "$RUTA_SOLID")")"

mkdir -p "$DESTINO/@opentui" || exit 1
for pkg in solid core; do
    if [ -d "$RAIZ_MODULES/@opentui/$pkg" ]; then
        ln -sfn "$RAIZ_MODULES/@opentui/$pkg" "$DESTINO/@opentui/$pkg"
        log "enlazado @opentui/$pkg"
    fi
done
if [ -d "$RAIZ_MODULES/solid-js" ]; then
    ln -sfn "$RAIZ_MODULES/solid-js" "$DESTINO/solid-js"
    log "enlazado solid-js"
fi

exit 0
