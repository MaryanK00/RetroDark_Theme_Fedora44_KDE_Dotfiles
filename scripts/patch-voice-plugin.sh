#!/usr/bin/env bash
# Desactiva la mitad de TERMINAL del plugin de dictado @juliuskb/opencode-voice.
#
# POR QUE
#   Ese plugin trae su propia interfaz de terminal: un panel lateral con el
#   medidor de microfono y su propio atajo de grabacion. Eso duplicaba lo que
#   ya hace el plugin opencode-voice-tts (que ademas es el que funciona: el
#   atajo del otro no llegaba al keymap de OpenTUI).
#
# QUE NO SE TOCA
#   Su mitad SERVIDORA, que es el motor de Whisper (modelo, captura, VAD y
#   transcripcion). Esa vive en src/index.ts y se importa con el export ".",
#   asi que sigue intacta: opencode-voice-tts habla con ella por su RPC "voice".
#
# COMO
#   Se sustituye dist/tui.js por un stub sin hacer nada, en vez de quitar el
#   export "./tui" del package.json. Asi el plugin sigue anunciando que tiene
#   mitad de terminal (features.tui = true) y el cargador no protesta, pero su
#   panel y su atajo desaparecen.
#
# USO
#   scripts/patch-voice-plugin.sh
#   (es idempotente: si ya esta aplicado, no toca nada)
set -euo pipefail

CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/opencode/npm"
STUB_MARKER="tui-disabled"
ENCONTRADO=0

for pkg in "$CACHE"/@juliuskb/opencode-voice@*/*/node_modules/@juliuskb/opencode-voice; do
    [ -d "$pkg" ] || continue
    [ -f "$pkg/dist/tui.js" ] || continue
    ENCONTRADO=1

    if grep -q "$STUB_MARKER" "$pkg/dist/tui.js"; then
        echo "  $pkg: la mitad de terminal ya estaba desactivada"
        continue
    fi

    if [ ! -f "$pkg/dist/tui.js.orig" ]; then
        cp "$pkg/dist/tui.js" "$pkg/dist/tui.js.orig"
        echo "  $pkg: copia del original en dist/tui.js.orig"
    fi

    cat > "$pkg/dist/tui.js" <<'STUB'
/**
 * Mitad de TERMINAL desactivada a proposito (stub).
 *
 * Este plugin es el motor de Whisper: su mitad SERVIDORA (src/index.ts) sigue
 * intacta y es la que aporta captura, VAD y transcripcion. Lo que se apaga es
 * su interfaz de terminal, que duplicaba el atajo y el panel lateral del
 * plugin opencode-voice-tts.
 *
 * Se regenera con: scripts/patch-voice-plugin.sh
 */

/** @type {import("@opencode/plugin/tui").Plugin} */
const VoiceTuiDisabled = {
  id: "@juliuskb/opencode-voice/tui-disabled",
  setup() {
    return () => {}
  },
}

export default VoiceTuiDisabled
STUB
    echo "  $pkg: mitad de terminal desactivada"
done

if [ "$ENCONTRADO" = "0" ]; then
    echo "  no se encontro @juliuskb/opencode-voice instalado (se instalara solo al abrir opencode)"
    exit 0
fi

echo
echo "  Hecho. Reinicia el terminal de opencode para que desaparezca su panel."
echo "  Su motor de Whisper sigue funcionando: es el que transcribe."
