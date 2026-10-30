#!/usr/bin/env bash
# Genera los WAV de OpenCode a partir del tema de sonido de Nier: Automata
# instalado en el sistema.
#
# Los clips son propiedad de sus autores originales, asi que NO se
# distribuyen con el repo: este script los prepara en local a partir de
# la copia ya instalada en el sistema.
#
#   uso:  bash scripts/make-sounds.sh [directorio-del-tema-de-nier]
#
# Salida: files/config/opencode/sounds/*.wav
#        (16 bit PCM, 48 kHz, estereo, normalizado a -3 dBFS)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${REPO}/files/config/opencode/sounds"
THEME="${1:-${HOME}/.local/share/sounds/nier-automata-sound-theme/stereo}"

log()  { printf '  %s\n' "$*"; }
warn() { printf '  AVISO: %s\n' "$*" >&2; }

# evento -> fichero de origen
declare -A MAP=(
    [default]="message"
    [question]="dialog-question"
    [permission]="bell-window-system"
    [error]="dialog-error-serious"
    [done]="desktop-login"
    [subagent_done]="device-added"
)

if [[ ! -d "$THEME" ]]; then
    warn "no encuentro el tema de sonido en: ${THEME}"
    warn "descargar el tema desde https://github.com/Zam7am/nier-automata-sound-theme"
    warn "y reejecutar este script con la ruta de la carpeta 'stereo'."
    exit 1
fi

command -v ffmpeg >/dev/null || { warn "se requiere ffmpeg"; exit 1; }

mkdir -p "$OUT"
echo "==> Generando sonidos en ${OUT}"

for event in default question permission error done subagent_done; do
    src="${THEME}/${MAP[$event]}.ogg"
    if [[ ! -f "$src" ]]; then
        warn "falta ${src}, se omite '${event}'"
        continue
    fi
    tmp="$(mktemp -t opencode-sound-XXXXXX.wav)"
    # conversion a WAV 16 bit / 48 kHz estereo
    ffmpeg -y -loglevel error -i "$src" -ac 2 -ar 48000 -c:a pcm_s16le "$tmp"
    # normalizacion de pico a -3 dBFS para que attention.volume sea coherente
    peak="$(ffmpeg -i "$tmp" -af volumedetect -f null - 2>&1 \
             | sed -n 's/.*max_volume: \([-0-9.]*\) dB.*/\1/p' | head -1)"
    [[ -z "$peak" ]] && peak="-20"
    gain="$(awk -v p="${peak}" 'BEGIN {printf "%.2f", -3.0 - (p < 0 ? p : -p)}')"
    ffmpeg -y -loglevel error -i "$tmp" -af "volume=${gain}dB" -c:a pcm_s16le "${OUT}/${event}.wav"
    rm -f "$tmp"
    log "$(printf '%-14s' "$event")  <- ${MAP[$event]}.ogg  (pico ${peak} dB -> -3 dBFS)"
done

echo
echo "==> Listo. Los WAV no se versionan (estan en .gitignore)."
