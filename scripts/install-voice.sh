#!/usr/bin/env bash
# Instala lo que necesita el plugin de voz de OpenCode:
#
#   1. piper       -> ~/.local/share/piper/   (+ wrapper en ~/.local/bin/piper)
#   2. la voz      -> ~/.local/share/piper-voices/es_ES-davefx-medium.onnx
#   3. whisper     -> ~/.local/share/opencode-voice/models/  (dictado, multilingue)
#
# Ni el binario ni los modelos se versionan en este repo: son descargas
# grandes y de terceros. Este script los deja listos de forma idempotente.
#
#   uso:  bash scripts/install-voice.sh [--force] [--sin-dictado]
#
# Requiere: curl, tar
set -euo pipefail

PIPER_VERSION="2023.11.14-2"
PIPER_TARBALL="piper_linux_x86_64.tar.gz"
PIPER_URL="https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/${PIPER_TARBALL}"

VOICE_NAME="es_ES-davefx-medium"
VOICE_URL="https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/${VOICE_NAME}.onnx"
VOICE_CFG_URL="${VOICE_URL}.json"

PIPER_DIR="${HOME}/.local/share/piper"
PIPER_BIN="${HOME}/.local/bin/piper"
VOICE_DIR="${HOME}/.local/share/piper-voices"
VOICE_FILE="${VOICE_DIR}/${VOICE_NAME}.onnx"

# Modelo de dictado (whisper via sherpa-onnx). "small" es multilingue:
# el que trae el plugin por defecto, "small.en", es solo ingles.
ASR_RELEASE="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"
ASR_NAME="small"
ASR_DIR="${HOME}/.local/share/opencode-voice/models"
ASR_MODEL_DIR="${ASR_DIR}/sherpa-onnx-whisper-${ASR_NAME}"

log()  { printf '  %s\n' "$*"; }
warn() { printf '  AVISO: %s\n' "$*" >&2; }
die()  { printf '  ERROR: %s\n' "$*" >&2; exit 1; }

FORCE=0
WITH_ASR=1
for arg in "$@"; do
    case "$arg" in
        --force)        FORCE=1 ;;
        --sin-dictado)  WITH_ASR=0 ;;
        *) die "opcion desconocida: $arg" ;;
    esac
done

command -v curl >/dev/null || die "falta curl"
command -v tar  >/dev/null || die "falta tar"

# ---------------------------------------------------------------- piper
if [ "$FORCE" = 1 ] || [ ! -x "${PIPER_DIR}/piper" ]; then
    log "descargando piper ${PIPER_VERSION}..."
    tmp="$(mktemp -d)"
    trap 'rm -rf "$tmp"' EXIT
    curl -fL --progress-bar -o "${tmp}/${PIPER_TARBALL}" "$PIPER_URL" \
        || die "no se pudo descargar piper"
    log "extrayendo..."
    rm -rf "$PIPER_DIR"
    mkdir -p "$PIPER_DIR"
    tar -xzf "${tmp}/${PIPER_TARBALL}" -C "$PIPER_DIR"
    [ -x "${PIPER_DIR}/piper" ] || die "el tarball no contiene el binario piper"
else
    log "piper ya esta instalado en ${PIPER_DIR} (usa --force para reinstalarlo)"
fi

# El tarball NO es autocontenido: sin estas libs piper no arranca
# ("error while loading shared libraries: libpiper_phonemize.so.1").
mkdir -p "$(dirname "$PIPER_BIN")"
cat > "$PIPER_BIN" <<'WRAPPER'
#!/bin/sh
PIPER_DIR="${PIPER_HOME:-$HOME/.local/share/piper}"
export LD_LIBRARY_PATH="$PIPER_DIR${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export ESPEAK_DATA_PATH="$PIPER_DIR"
exec "$PIPER_DIR/piper" "$@"
WRAPPER
chmod +x "$PIPER_BIN"
log "wrapper: ${PIPER_BIN}"

# ---------------------------------------------------------------- voz
mkdir -p "$VOICE_DIR"
download_voice() {
    url="$1"; dest="$2"
    if [ "$FORCE" = 1 ] || [ ! -s "$dest" ]; then
        log "descargando $(basename "$dest")..."
        curl -fL --progress-bar -o "$dest.part" "$url" || die "no se pudo descargar $(basename "$dest")"
        mv "$dest.part" "$dest"
    else
        log "$(basename "$dest") ya esta"
    fi
}
download_voice "$VOICE_URL"   "$VOICE_FILE"
download_voice "$VOICE_CFG_URL" "${VOICE_FILE}.json"

# ------------------------------------------------------- modelo de dictado
# Lo usa el plugin @juliuskb/opencode-voice (whisper local via sherpa-onnx).
# Los releases de sherpa-onnx traen el modelo en un tar.bz2 con la estructura
# <modelo>/<ficheros>; el plugin solo necesita el encoder int8, el decoder
# int8 y la tabla de tokens.
if [ "$WITH_ASR" = 1 ]; then
    mkdir -p "$ASR_DIR"
    if [ "$FORCE" = 1 ] || [ ! -s "${ASR_MODEL_DIR}/${ASR_NAME}-encoder.int8.onnx" ]; then
        log "descargando whisper ${ASR_NAME} (multilingue, ~609 MB)..."
        tmp="$(mktemp -d)"
        trap 'rm -rf "$tmp"' EXIT
        curl -fL --progress-bar -o "${tmp}/asr.tar.bz2" \
            "${ASR_RELEASE}/sherpa-onnx-whisper-${ASR_NAME}.tar.bz2" \
            || die "no se pudo descargar el modelo de dictado"
        stage="${tmp}/stage"
        mkdir -p "$stage"
        tar -xjf "${tmp}/asr.tar.bz2" -C "$stage" --strip-components=1
        find "$stage" -maxdepth 1 -type f \
            ! -name '*.int8.onnx' ! -name '*-tokens.txt' -delete
        # el tarball trae tambien test_wavs/, que no hace falta
        rm -rf "$stage/test_wavs"
        for f in "${ASR_NAME}-encoder.int8.onnx" "${ASR_NAME}-decoder.int8.onnx" "${ASR_NAME}-tokens.txt"; do
            [ -s "${stage}/${f}" ] || die "el modelo descargado esta incompleto: falta ${f}"
        done
        rm -rf "$ASR_MODEL_DIR"
        mkdir -p "$ASR_MODEL_DIR"
        mv "$stage"/* "$ASR_MODEL_DIR"/
    else
        log "modelo de dictado ya esta en ${ASR_MODEL_DIR}"
    fi

    # Detector de pausas (VAD). El plugin lo usa para cortar los silencios.
    if [ "$FORCE" = 1 ] || [ ! -s "${ASR_DIR}/silero_vad.onnx" ]; then
        log "descargando silero_vad.onnx..."
        curl -fL --progress-bar -o "${ASR_DIR}/silero_vad.onnx.part" \
            "${ASR_RELEASE}/silero_vad.onnx" || die "no se pudo descargar el VAD"
        mv "${ASR_DIR}/silero_vad.onnx.part" "${ASR_DIR}/silero_vad.onnx"
    else
        log "VAD ya esta"
    fi

    # Ajustes del plugin: "small.en" (el valor por defecto) es SOLO ingles.
    SETTINGS="${HOME}/.local/share/opencode-voice/settings.json"
    if [ ! -f "$SETTINGS" ]; then
        log "creando ${SETTINGS} (modelo multilingue, idioma es)"
        mkdir -p "$(dirname "$SETTINGS")"
        cat > "$SETTINGS" <<'JSON'
{
  "model": "small",
  "language": "es"
}
JSON
    else
        log "ajustes de dictado ya existen (no se tocan): ${SETTINGS}"
    fi
fi

# ------------------------------------- mitad de terminal del plugin de voz
# El plugin @juliuskb/opencode-voice trae su propia interfaz de terminal: un
# panel lateral con el medidor de microfono y su propio atajo de grabacion.
# Eso duplicaba lo que ya hace el plugin opencode-voice-tts (que ademas es el
# que funciona: el atajo del otro no llegaba al keymap de OpenTUI).
#
# Se le apaga SOLO esa mitad de terminal. Su motor de Whisper (la mitad
# servidor: modelo, captura, VAD y transcripcion) sigue intacto, que es
# justamente el que usa opencode-voice-tts por su RPC "voice".
#
# Se re-aplica en cada instalacion porque OpenCode reinstala el plugin con un
# hash nuevo y suelta el parche.
log "desactivando la mitad de terminal del plugin de Whisper..."
if bash "$(dirname "$0")/patch-voice-plugin.sh" 2>&1 | sed "s/^/  /"; then
    :
else
    log "  no se pudo aplicar ahora; se reintentara en la proxima instalacion"
fi

# ---------------------------------------------------------------- prueba
log "probando..."
if ! echo "prueba de voz" | "$PIPER_BIN" -m "$VOICE_FILE" --output_raw > /dev/null 2>&1; then
    die "piper no funciona con el modelo instalado"
fi

log "listo."
log "  piper : ${PIPER_BIN}"
log "  voz   : ${VOICE_FILE}"
[ "$WITH_ASR" = 1 ] && log "  dictado: ${ASR_MODEL_DIR}"
log ""
log "El plugin de TTS de OpenCode ya esta enlazado en ~/.config/opencode/plugins."
log "Prueba el sonido con:  /voice-test"
log "Dicta con: ctrl+space (o alt+d). Silencia la voz con ctrl+alt+m."
