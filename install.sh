#!/usr/bin/env bash
# Instala los dotfiles: crea symlinks desde ~ hacia el repositorio.
# Los ficheros de tipo "template" se renderizan sustituyendo __HOME__.
# Nunca sobrescribe sin dejar copia de seguridad.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${HOME}"
BACKUP="${HOME}/.dotfiles-backup/$(date +%Y%m%d-%H%M%S)"
# Un subdirectorio por home: el mismo clon se puede instalar en varios
# equipos sin que una instalacion pise los symlinks de la otra.
RENDERED="${REPO}/rendered/$(printf '%s' "$HOME_DIR" | sha256sum | cut -c1-10)"

log()  { printf '  %s\n' "$*"; }
warn() { printf '  AVISO: %s\n' "$*" >&2; }

# Crea el symlink solo si falta o si apunta a otro sitio.
#
# Ojo: `ln -sfn` RECREA el enlace aunque ya sea correcto, y eso cambia el
# inode. Los procesos que lo tienen abierto (un file-watcher, por ejemplo)
# se quedan mirando el enlace viejo y dejan de recibir cambios: la mitad TUI
# de un plugin deja de recargarse sola. Por eso aqui se comprueba antes.
ensure_link() {
    local target="$1" dest="$2"
    if [[ -L "$dest" && "$(readlink "$dest")" == "$target" ]]; then
        return 0
    fi
    # Si el destino es un directorio de verdad, `ln` se colgaria DENTRO de el.
    # (El bloque de copia de seguridad de arriba ya lo ha guardado.)
    if [[ -d "$dest" && ! -L "$dest" ]]; then
        rm -rf "$dest"
    fi
    ln -sfn "$target" "$dest"
}

[[ -f "${REPO}/manifest.txt" ]] || { echo "ERROR: falta manifest.txt"; exit 1; }

echo "==> Instalando dotfiles desde ${REPO}"
mkdir -p "$RENDERED"

# --- sonidos de OpenCode: se generan antes de enlazarlos ---
# No se distribuyen con el repo (propiedad de sus autores originales);
# se preparan a partir del tema de Nier instalado en el sistema.
NIEr_THEME="${HOME}/.local/share/sounds/nier-automata-sound-theme/stereo"
if [[ -d "$NIEr_THEME" ]]; then
    echo "==> Generando los sonidos de OpenCode desde el tema de Nier instalado"
    bash "${REPO}/scripts/make-sounds.sh" "$NIEr_THEME" || true
    echo
else
    echo "==> No encuentro el tema de sonido de Nier en ${NIEr_THEME}"
    echo "    OpenCode usara sus sonidos por defecto. Para tenerlos:"
    echo "      bash ${REPO}/scripts/make-sounds.sh /ruta/al/tema/stereo"
    echo
fi

installed=0; skipped=0; backups=0

# La identidad git se lee ANTES de sustituir el .gitconfig, para no
# capturar los valores de una copia renderizada anterior.
GIT_NAME="$(git config --global user.name 2>/dev/null || true)"
GIT_EMAIL="$(git config --global user.email 2>/dev/null || true)"
[[ -z "$GIT_NAME" ]]  && GIT_NAME="user"
[[ -z "$GIT_EMAIL" ]] && GIT_EMAIL="user@example.com"

while IFS=$'\t' read -r src dest mode; do
    [[ -z "${src}" || "${src}" == \#* ]] && continue
    src_path="${REPO}/files/${src}"
    dest_path="${HOME_DIR}/${dest}"

    if [[ ! -e "$src_path" ]]; then
        if [[ "$mode" == "generated" ]]; then
            # lo produce un script: no es un error que falte
            log "generado  ~/${dest}  (lo crea un script, aun no esta)"
            skipped=$((skipped+1)); continue
        fi
        warn "falta el origen ${src}, se omite"
        skipped=$((skipped+1)); continue
    fi

    # copia de seguridad de lo que haya ahora, salvo que ya sea nuestro symlink
    if [[ -e "$dest_path" || -L "$dest_path" ]]; then
        if [[ -L "$dest_path" && "$(readlink -f "$dest_path" 2>/dev/null || true)" == "${REPO}"* ]]; then
            : # ya apunta al repo, se sobrescribe sin backup
        else
            mkdir -p "${BACKUP}/$(dirname "$dest")"
            cp -a "$dest_path" "${BACKUP}/${dest}" 2>/dev/null || true
            backups=$((backups+1))
        fi
    else
        mkdir -p "$(dirname "$dest_path")"
    fi

    if [[ "$mode" == "template" ]]; then
        out="${RENDERED}/${dest}"
        mkdir -p "$(dirname "$out")"
        sed -e "s|__HOME__|${HOME_DIR}|g" \
            -e "s|__GIT_NAME__|${GIT_NAME}|g" \
            -e "s|__GIT_EMAIL__|${GIT_EMAIL}|g" \
            "$src_path" > "$out"
        ensure_link "$out" "$dest_path"
        log "plantilla  ~/${dest}  ->  rendered/${dest}"
    else
        ensure_link "$src_path" "$dest_path"
        log "enlace     ~/${dest}  ->  files/${src}"
    fi
    installed=$((installed+1))
done < "${REPO}/manifest.txt"

echo
echo "==> ${installed} entradas instaladas, ${skipped} omitidas"
if [[ $backups -gt 0 ]]; then
    echo "==> ${backups} copias de seguridad en ${BACKUP}"
else
    echo "==> no hubo que respaldar nada"
fi

echo
echo "    Para revertir:  ${REPO}/restore.sh"
