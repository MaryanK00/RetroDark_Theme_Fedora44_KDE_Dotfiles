#!/usr/bin/env bash
# Escáner de secretos propio, sin dependencias externas.
# Complementa a gitleaks con patrones adicionales: los de gitleaks validan
# checksum de algunos formatos, estos cubren los que no lo hacen.
# Salida: 0 = limpio, 1 = se han encontrado coincidencias.
set -uo pipefail

TARGET="${1:-.}"
CASE_INSENSITIVE=1

declare -a PATTERNS=(
  'gh[pousr]_[A-Za-z0-9]{20,}'
  'github_pat_[A-Za-z0-9_]{20,}'
  '\bsk-[A-Za-z0-9_-]{20,}'
  '\bsk-proj-[A-Za-z0-9_-]{20,}'
  'AKIA[0-9A-Z]{16}'
  'xox[baprs]-[A-Za-z0-9-]{10,}'
  'AIza[0-9A-Za-z_-]{35}'
  'ya29\.[0-9A-Za-z_-]{20,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  '-----BEGIN OPENSSH PRIVATE KEY-----'
  'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}'
  '(?i)(api[_-]?key|secret[_-]?key|client[_-]?secret|access[_-]?token)["'"'"' ]*[:=]["'"'"' ]*[A-Za-z0-9_\-/.+=]{12,}'
  '(?i)(password|passwd|pass)["'"'"' ]*[:=]["'"'"' ]*[^[:space:]"'"'"']{6,}'
  '(?i)authorization["'"'"' ]*[:=]["'"'"' ]*(bearer|basic) [A-Za-z0-9+/=._-]{16,}'
  '[a-z][a-z0-9+.-]*://[^/[:space:]:"'"'"']+:[^/[:space:]:"'"'"']+@'
)

TOTAL=0
FOUND=0

for pat in "${PATTERNS[@]}"; do
    # se salta el propio escaner y los ficheros .git
    while IFS= read -r hit; do
        file="${hit%%:*}"
        [[ "$file" == "./scripts/scan-secrets.sh" ]] && continue
        [[ "$file" == *"/.git/"* ]] && continue
        line="${hit#*:}"
        lineno="${line%%:*}"
        content="${line#*:}"
        # solo el nombre del patron y el numero de linea: NUNCA el valor
        printf '  [POTENCIAL SECRETO] %s:%s  (patron: %s)\n' "$file" "$lineno" "$pat"
        FOUND=$((FOUND+1))
    done < <(grep -rInE "$pat" --exclude-dir=.git --exclude-dir=rendered "$TARGET" 2>/dev/null || true)
done

TOTAL=$FOUND
echo
if [[ $TOTAL -eq 0 ]]; then
    echo "  escaner propio: SIN coincidencias en ${TARGET}"
    exit 0
else
    echo "  escaner propio: ${TOTAL} coincidencia(s) REVISAR en ${TARGET}"
    exit 1
fi
