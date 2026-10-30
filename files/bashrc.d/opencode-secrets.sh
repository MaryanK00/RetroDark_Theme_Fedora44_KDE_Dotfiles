# Credenciales locales de OpenCode.
#
# Este fragmento lo carga ~/.bashrc a traves del bucle ~/.bashrc.d/.
# El fichero que carga (secrets.env) NO se versiona: contiene claves y solo
# existe en este equipo.
#
# Sin secrets.env, OpenCode sigue funcionando: todo lo que dependa de una
# clave cae al modo anonimo o se desactiva.
#
# `set -a` (allexport) es imprescindible: hace que TODA variable asignada
# en el fichero quede exportada al entorno. Sin el, `CONTEXT7_API_KEY=valor`
# seria solo una variable de shell y los procesos hijos —el TUI de opencode
# y el servicio que este lanza— NO la heredarian: la clave llegaria al
# fichero pero nunca a donde se usa.

if [ -f "$HOME/.config/opencode/secrets.env" ]; then
    set -a
    . "$HOME/.config/opencode/secrets.env"
    set +a
fi
