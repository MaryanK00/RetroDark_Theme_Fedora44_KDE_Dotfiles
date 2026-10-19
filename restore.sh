#!/usr/bin/env bash
# Revierte la instalacion: quita los symlinks y restaura las copias de seguridad.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${HOME}"
BASE="${HOME}/.dotfiles-backup"

log() { printf '  %s\n' "$*"; }

if [[ ! -d "$BASE" ]]; then
    echo "No hay copias de seguridad en ${BASE}"
    echo "Solo se quitan los enlaces; los ficheros originales no se tocan."
else
    echo "==> Copias de seguridad disponibles:"
    for d in "$BASE"/*/; do
        [[ -d "$d" ]] && echo "    $(basename "$d")  ($(find "$d" -type f | wc -l) ficheros)"
    done
fi

echo
read -r -p "¿Quitar los symlinks de los dotfiles? [s/N] " ans
if [[ "${ans,,}" != "s" && "${ans,,}" != "si" && "${ans,,}" != "y" ]]; then
    echo "Cancelado."; exit 0
fi

removed=0
if [[ -f "${REPO}/manifest.txt" ]]; then
    while IFS=$'\t' read -r src dest mode; do
        [[ -z "${src}" || "${src}" == \#* ]] && continue
        dest_path="${HOME_DIR}/${dest}"
        if [[ -L "$dest_path" ]]; then
            rm -f "$dest_path"
            removed=$((removed+1))
        fi
    done < "${REPO}/manifest.txt"
fi
log "${removed} symlinks eliminados"

last="$(ls -1d "$BASE"/*/ 2>/dev/null | sort | tail -1 || true)"
if [[ -n "$last" && -d "$last" ]]; then
    read -r -p "¿Restaurar las copias de $(basename "$last")? [s/N] " ans
    if [[ "${ans,,}" == "s" || "${ans,,}" == "si" || "${ans,,}" == "y" ]]; then
        restored=0
        while IFS= read -r -d '' f; do
            rel="${f#"$last"}"
            mkdir -p "$(dirname "${HOME_DIR}${rel}")"
            cp -a "$f" "${HOME_DIR}${rel}"
            restored=$((restored+1))
        done < <(find "$last" -type f -print0)
        log "${restored} ficheros restaurados"
    fi
fi

rm -rf "${REPO}/rendered"
echo "Hecho."
