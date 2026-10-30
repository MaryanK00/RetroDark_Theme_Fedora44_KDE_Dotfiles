# OpenCode: comportamiento, herramientas y agentes

Esta guía explica la parte de OpenCode que no es estética: el fichero de
configuración, las instrucciones globales, los servidores MCP, el plugin de
recorte de contexto y las skills instaladas.

Todo vive en el repositorio y se instala con `./install.sh`:

| Origen en `files/` | Destino en `~` | Modo |
|---|---|---|
| `config/opencode/opencode.json.tmpl` | `.config/opencode/opencode.json` | template |
| `config/opencode/AGENTS.md` | `.config/opencode/AGENTS.md` | link |
| `config/opencode/bin/github-mcp.sh` | `.config/opencode/bin/github-mcp.sh` | link |
| `config/opencode/secrets.env.example` | `.config/opencode/secrets.env.example` | link |
| `bashrc.d/opencode-secrets.sh` | `.bashrc.d/opencode-secrets.sh` | link |

Un fichero queda **fuera** del repositorio a proposito:
`~/.config/opencode/secrets.env` (permisos `600`). Es donde viven las
claves, y por eso `install.sh` no lo gestiona: no se sobrescribe ni se
versiona nunca.

Para la parte que no es de OpenCode —Plasma, Kitty, Cava, tmux, Kate,
GTK 3, OpenRGB y Ardour— ver [`escritorio-kde.md`](escritorio-kde.md).

---

## `opencode.json`: el fichero de comportamiento

`cli.json` (que ya existía) gobierna el **aspecto**: tema, sonidos, keybinds.
`opencode.json` gobierna el **comportamiento**: permisos, herramientas,
referencias, plugin y calentamiento de caché.

### Permisos

La política por defecto de OpenCode es permitir todo. Las reglas de este
repo añaden una red de seguridad sin añadir ruido: solo lo que de verdad
puede romper algo pregunta o se bloquea.

| Regla | Efecto | Por qué |
|---|---|---|
| editar `*.env` | `ask` | son credenciales: que las toque una persona |
| editar `*.key`, `id_rsa*`, `id_ed25519*` | `deny` | claves privadas: el agente no debe escribirlas nunca |
| `sudo *` | `ask` | cambia el sistema, no el proyecto |
| `rm -rf *` | `ask` | irreversible |
| `git push *` | `ask` | publica; conviene un segundo pulso humano |
| `curl *\|sh` | `ask` | ejecuta código remoto sin revisar |

Todo lo demás (leer, editar, `rg`, `git status`, `webfetch`…) sigue permitido
sin preguntar, porque la base ya lo permite.

En V2 los nombres de acción son `shell`, `read`, `edit`, `webfetch`… y el
patrón es "última regla que coincide gana".

### `warming`

```jsonc
"warming": true
```

Mantiene viva la caché de prompts del proveedor: cada 4 minutos de inactividad
manda una petición real que no entra en el historial. Con los modelos
gratuitos **cuenta como consumo de cuota**, así que conviene vigilarlo con
`opencode stats` y desactivarlo si el plan tiene límites estrictos.

### `references`

```jsonc
"references": {
  "dotfiles": { "path": "__HOME__/dotfiles", "description": "…" }
}
```

Da al agente un acceso con nombre al repositorio de dotfiles **fuera del
proyecto activo**, sin cargarlo en el contexto: solo entra en la conversación
cuando se adjunta. Es la alternativa nativa y ligera a meter la
documentación en el prompt.

---

## `AGENTS.md`: las instrucciones globales

V2 reconoce `AGENTS.md` (no `CLAUDE.md`). El global vive en
`~/.config/opencode/AGENTS.md` y se carga en **todas** las sesiones; el de
cada proyecto, en la raíz del repo, se añade al entrar en él.

El fichero global es deliberadamente corto: **solo lo que aplica al 100 % de
las peticiones** y **solo restricciones duras**. Contexto que se usa a
menudo y pesa mucho no va aquí, va en una skill, en una reference o en un
subagente.

Regla práctica:

| Pregunta | Dónde va |
|---|---|
| ¿Lo necesita el 100 % de los prompts? | `AGENTS.md` |
| ¿Lo necesita a veces y pesa mucho? | `references` o subagente |
| ¿Lo necesita a veces y pesa poco? | `AGENTS.md` o una skill |
| ¿Es un procedimiento repetido? | skill |

---

## Servidores MCP

```jsonc
"mcp": { "servers": { … } }
```

| Servidor | Tipo | Qué aporta | Coste en contexto |
|---|---|---|---|
| `context7` | remoto | documentación real de librerías | ~2 herramientas, mínimo |
| `github` | local (stdio) | repos, issues, PRs, busquedas | 26 herramientas, ~4,2k tokens |
| `playwright` | local (stdio) | navegador real: capturas, pruebas | 25 herramientas, ~5,3k tokens |

OpenCode agrupa las herramientas MCP bajo `execute` (Code Mode) y solo
muestra parte del catalogo en el prompt, asi que el coste real es menor que
la suma de los schemas.

### Por qué el MCP de GitHub es el paquete de npm y no el oficial

El servidor oficial (`github-mcp-server`) publica un schema por herramienta
mucho mas verboso. Medido en esta maquina:

| Variante | Herramientas | Tokens de schema |
|---|---|---|
| `@modelcontextprotocol/server-github` (npm) | 26 | **~4.200** |
| oficial, `--read-only --toolsets repos,issues,pull_requests` | 22 | ~15.300 |
| oficial, completo | 43 | ~30.200 |

Con los modelos gratuitos de OpenCode la diferencia se nota, asi que se usa
el de npm. Es un paquete marcado como deprecated por sus autores, pero
funciona contra la API actual de GitHub.

Para cambiar al oficial:

```bash
# binario oficial (verifica el checksum antes de instalar)
curl -sL -o /tmp/ghmcp.tar.gz \
  https://github.com/github/github-mcp-server/releases/download/v2.0.2/github-mcp-server_Linux_x86_64.tar.gz
install -Dm755 /tmp/ghmcp.tar.gz ~/.local/bin/github-mcp-server   # descomprimir antes
```

y en `opencode.json.tmpl`:

```jsonc
"github": {
  "type": "local",
  "command": ["__HOME__/.local/bin/github-mcp-server", "stdio", "--read-only"]
}
```

### El token de GitHub

`bin/github-mcp.sh` lo saca del keyring de `gh auth login` en cada arranque:

```bash
export GITHUB_PERSONAL_ACCESS_TOKEN="$(gh auth token)"
exec npx -y @modelcontextprotocol/server-github
```

El token **no** se escribe en ningun fichero de configuracion, ni en el
repo, ni en disco. Es la misma cuenta con la que ya trabajas
(`gh auth status`).

### Desactivar un servidor

No hace falta desinstalar nada: en `opencode.json.tmpl`, `"disabled": true`.
Un servidor desconectado sigue configurado, pero no consume contexto.

### La clave de `context7`

`context7` se configura con cabecera y sin OAuth:

```jsonc
"context7": {
  "type": "remote",
  "url": "https://mcp.context7.com/mcp",
  "oauth": false,
  "headers": {
    "CONTEXT7_API_KEY": "{env:CONTEXT7_API_KEY}"
  }
}
```

`{env:CONTEXT7_API_KEY}` se sustituye con el valor de esa variable en el
entorno del **servidor de OpenCode**. Si la variable no existe, la cabecera
se envia vacia y `context7` responde igual en modo anonimo: contesta con
datos reales, pero con menos peticiones disponibles. No se rompe nada en
ninguno de los dos casos.

#### Como llega la clave al servicio

El servidor de OpenCode no lo arranca systemd como una unit propia: lo
lanza el TUI dentro del scope de la terminal, asi que hereda el entorno del
shell que lo invoco. La cadena es:

```
~/.bash_profile  ->  ~/.bashrc  ->  ~/.bashrc.d/opencode-secrets.sh  ->  ~/.config/opencode/secrets.env
```

`~/.bashrc.d/opencode-secrets.sh` es un fragmento versionado (lo gestiona
`manifest.txt`) que carga `secrets.env` si existe.

#### Por que el fragmento usa `set -a`

```bash
if [ -f "$HOME/.config/opencode/secrets.env" ]; then
    set -a
    . "$HOME/.config/opencode/secrets.env"
    set +a
fi
```

Sin `set -a`, esto:

```bash
CONTEXT7_API_KEY=mi-clave
```

crea una **variable de shell**, no una variable de entorno. La shell la ve, pero
los procesos hijos no la heredan. Y los procesos hijos son justamente el TUI de
OpenCode y el servicio que este lanza: la clave llegaria al fichero, pero
nunca a donde se usa, y el servidor seguiria en modo anonimo sin que nada
fallara de forma visible.

`set -a` (allexport) exporta automaticamente todo lo que se asigne al
cargar el fichero. Por eso en `secrets.env` se escribe `CONTEXT7_API_KEY=...`
sin `export`: el fragmento se encarga.

Comprobacion rapida del mecanismo:

```bash
bash -lc 'printenv CONTEXT7_API_KEY'   # login shell
```

`secrets.env` **no se versiona**: vive en `~/.config/opencode/`, con permisos
`600`, y su formato esta documentado en
`~/.config/opencode/secrets.env.example` (este si se versiona).

Para anadir una clave:

```bash
$EDITOR ~/.config/opencode/secrets.env
```

```bash
CONTEXT7_API_KEY=tu-clave-de-context7
```

Despues hay que **reiniciar OpenCode**: el proceso del servicio ya tiene su
entorno fijado, asi que `/reload` no basta y hay que cerrar y volver a abrir
el TUI.

Comprobar que la clave ha llegado:

```bash
tr '\0' '\n' < /proc/$(pgrep -f "opencode serve --service" | head -1)/environ \
  | grep CONTEXT7_API_KEY
```

#### Volver a OAuth

Si prefieres autorizar con el navegador en lugar de usar una clave, quita
las lineas `"oauth": false` y `"headers"` del bloque de `context7` en
`opencode.json.tmpl` y autoriza desde la interfaz:

```
/mcps   ->  context7  ->  autorizar
```

Las credenciales se guardan fuera de la configuracion del proyecto.

---

## Plugins

### `@tarquinen/opencode-dcp`

Recorta del historial las salidas de herramientas que ya no sirven (un `ls`
de hace veinte mensajes, un `cat` de un fichero que ya no importa) y las
sustituye por un resumen. **No modifica la sesion**: solo cambia lo que se
manda al modelo. Con ventanas de contexto ajustadas es de las mejoras mas
notables.

Su configuracion vive en `~/.config/opencode/dcp.jsonc` y se crea sola la
primera vez. Si el modelo tiene ventana pequeña, conviene bajar
`compress.minContextLimit` y `compress.maxContextLimit` para que el recorte
se active antes.

### `@upstash/context7-opencode`

Plugin oficial de Context7 para OpenCode. Aporta una skill (`context7-mcp`)
que se activa sola cuando preguntas por una libreria o framework, para que
el agente busque la documentacion actual sin que se lo pidas.

```bash
opencode plugin add @upstash/context7-opencode
```

Usa OAuth por defecto (`opencode mcp auth context7`, o el navegador se abre
solo en la primera consulta) y tambien acepta `CONTEXT7_API_KEY` del entorno.

**No duplica el servidor MCP.** Si `opencode.json` ya define un servidor
llamado `context7`, el plugin lo deja intacto y solo añade la skill. En este
repo el servidor se configura a mano (con clave de API), asi que conviven
sin problema: las herramientas siguen siendo las 2 de siempre.

#### Cuidado con `opencode plugin add`

Ese comando escribe en `~/.config/opencode/opencode.json`. En este repo ese
fichero es un **symlink a la copia renderizada**, no a la plantilla:

```
~/.config/opencode/opencode.json -> ~/dotfiles/rendered/<hash>/.config/opencode/opencode.json
```

Ademas, al escribir, el CLI **sustituye el symlink por un fichero normal**.
Las dos cosas se arreglan solas con `./install.sh`, que vuelve a renderizar
y a recrear el enlace... pero **se pierde el plugin**, porque la plantilla
sigue sin mencionarlo.

La forma correcta es anadirlo a la plantilla y reinstallar:

```jsonc
// files/config/opencode/opencode.json.tmpl
"plugins": ["@tarquinen/opencode-dcp@3.2.0", "@upstash/context7-opencode@0.2.1"]
```

Las versiones van fijadas a propósito: con `@latest`, cada arranque puede
traer una versión distinta y el plugin recibe los permisos del agente.

---

## Voz

OpenCode no trae voz propia: aquí se añade **locución** (lee la respuesta), **dictado** (transcribe el micrófono en local) y **avisos sonoros**.

- Guía completa: [`docs/voz.md`](voz.md) — instalación, atajos, presets y diagnóstico.
- Instalación: `./scripts/install-voice.sh`.
- Atajos: `ctrl+space` o `alt+d` para dictar, `ctrl+alt+m` para silenciar, `ctrl+alt+t` para cambiar de timbre.

Todo el audio y el texto se quedan en la máquina; ollama solo se usa, si está disponible, para resumir respuestas largas antes de leerlas.

---

## Skills

Se instalan con la CLI de Vercel Labs, que las deja en `~/.agents/skills/`
(ruta que OpenCode ya descubre):

```bash
npx skills find                       # buscar en el catalogo
npx skills add <owner/repo@skill> -g -a opencode
npx skills list
npx skills check && npx skills update
```

Instalada: `bash-defensive-patterns` (escritura defensiva de Bash; encaja con
`install.sh` y `scripts/make-sounds.sh`).

El plugin de Context7 añade otra, `context7-mcp`, que se activa sola.

OpenCode solo anuncia al modelo el **titulo y la descripcion** de cada skill;
el cuerpo se carga solo cuando encaja. Installar muchas skills no encarece
el prompt.

---

## Comprobar que todo funciona

```bash
/reload                  # en la interfaz: recarga la configuracion
opencode mcp list        # los 3 servidores deberian salir como connected
opencode plugin list     # context7, opencode-dcp, juliuskb y el local de voz
opencode debug config    # fuentes de configuracion que se han leido
opencode api get /api/skill | jq -r '.data[].id'   # skills disponibles
opencode api get /api/command | jq -r '.data[].name' # speak, voice, voice-test
```

En la interfaz: `/mcps` para gestionar los servidores y sus autorizaciones.

### Comprobar la voz

```bash
opencode plugin list | grep voice-tts     # debe salir "local"
opencode api get /api/command | jq -r '.data[].name'   # speak, voice, voice-test
```

En la interfaz, `/voice-test` tiene que oírse. El diagnóstico completo —micro,
Whisper, custodia del audio y qué hacer cuando no suena— está en
[`docs/voz.md`](voz.md#cuando-algo-falla).
