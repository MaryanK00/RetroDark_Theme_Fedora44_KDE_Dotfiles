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

Despues hay que **reiniciar OpenCode** (cerrar y abrir el TUI, no vale con
`opencode reload`): el proceso del servicio ya tiene su entorno fijado, y
solo lo cambia al arrancar de nuevo.

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
"plugins": ["@tarquinen/opencode-dcp@latest", "@upstash/context7-opencode"]
```

---

## Voz

OpenCode no tiene voz propia (los issues de transcripcion y de voz en el
repositorio siguen abiertos sin planes). La voz se construye con tres piezas,
todas locales:

| Pieza | Que hace |
|---|---|
| `@juliuskb/opencode-voice` | **Dictado**: pulsas F9, hablas, y el texto aparece como borrador editable. Whisper local via `sherpa-onnx`. |
| `opencode-voice-tts` (este repo) | **Locucion**: al terminar una respuesta, la sintetiza y la reproduce. |
| `gemma4:12b` (ollama) | **Resumen**: si la respuesta es larga, se resume a una o dos frases antes de hablar. |

### Instalacion

El binario de piper y los modelos **no se versionan**. Se instalan con un
script idempotente:

```bash
./scripts/install-voice.sh          # piper + voz es_ES-davefx-medium
./scripts/install-voice.sh --force  # reinstala todo
```

El script deja:

```
~/.local/share/piper/                      # binario + librerias (26 MB)
~/.local/bin/piper                         # wrapper (exporta LD_LIBRARY_PATH)
~/.local/share/piper-voices/es_ES-davefx-medium.onnx
```

> El wrapper no es opcional: el tarball de piper no es autocontenido. Sin
> `LD_LIBRARY_PATH` y `ESPEAK_DATA_PATH` el binario falla con
> `error while loading shared libraries: libpiper_phonemize.so.1`.

### El plugin de locucion

`files/config/opencode/plugins/opencode-voice-tts/` es un plugin **local**, sin
dependencias: solo modulos nativos de Node.

En `opencode.json.tmpl` aparece como ruta de directorio:

```jsonc
"plugins": [
  "@tarquinen/opencode-dcp@latest",
  "@upstash/context7-opencode",
  "@juliuskb/opencode-voice",
  "__HOME__/.config/opencode/plugins/opencode-voice-tts"
]
```

**La ruta tiene que ser un directorio, no un fichero.** El cargador rechaza
`.../index.js` con un aviso y, si la ruta no existe, la salta en silencio.

Y el directorio tiene que ser un **symlink real** al directorio del repo: el
cargador comprueba que el `realpath` del entrypoint cae **dentro** del
directorio del plugin. Por eso en `manifest.txt` va una sola entrada de
directorio, no una por fichero:

```
config/opencode/plugins/opencode-voice-tts	.config/opencode/plugins/opencode-voice-tts	link
```

### Presets de voz

La voz sale de piper (castellano, `es_ES-davefx-medium`) y se le pasa por una
cadena de filtros de ffmpeg. Hay cuatro presets:

| Preset | Cadena | Como suena |
|---|---|---|
| `k2` | metalico, con eco de vocoder | **el que esta puesto por defecto** |
| `e4` | robot clasico, un poco mas grave | |
| `j1` | mas rapido y con mas presencia | |
| `plain` | sin filtros | la voz tal cual |

Se cambian en caliente:

```
/voice            # rota al siguiente preset
/voice k2         # va directo a uno
/voice-test       # dice una frase de prueba
/speak            # silencia o activa la voz
```

El estado se guarda en el almacenamiento del plugin, asi que sobrevive a las
reinstalaciones.

### Como funciona

```
session.execution.succeeded
  -> ctx.session.context({ sessionID })
  -> ultimo mensaje de tipo "assistant"
  -> markdown -> texto plano
  -> si es largo: resumen con gemma4 (1-2 frases)
  -> recorte por frases (nunca a mitad)
  -> piper --output_raw   (s16le, mono, 22050 Hz)
  -> ffmpeg -af <cadena del preset>
  -> pw-play
```

### Cuanto se dice

Una respuesta larga dictada entera es eterna, y un recorte a pelo deja la
frase a medias. Las dos cosas se resuelven antes de sintetizar:

1. **Resumen.** Si el texto limpio pasa de **300 caracteres**, se pide un
   resumen a `gemma4:12b` por su endpoint **nativo** (`/api/chat`), con
   `think: false` obligatorio. Sale en 1-4 s y suele dejar el texto entre 250 y
   350 caracteres, unos 15-18 segundos de audio.
2. **Recorte por frases.** El resultado se corta **siempre en frontera de
   frase**: se busca el ultimo final de frase antes del limite. Si el texto no
   termina en frase completa (puede pasar si el modelo agota el limite de
   tokens), se descarta la ultima frase a medias.

El limite duro son 900 caracteres, y es un **guardarrail**, no lo normal: con
el resumen activado nunca se llega.

> La llamada al modelo usa `/api/chat` y **no** `/v1/chat/completions`: el
> endpoint compatible con OpenAI **ignora el parametro `think`**, y con el
> razonamiento por defecto gemma4 tarda 37 segundos y genera 1133 tokens en
> lugar de 77.

Para desactivarlo:

```bash
OPENCODE_VOICE_SUMMARY=0    # no resume, solo recorta por frases
```

Detalles que no son evidentes:

- **`piper -f` no funciona**: escribe a stdout. La forma correcta es
  `piper -m modelo --output_raw < entrada.txt > salida.raw`.
- **La cadena termina en `alimiter=limit=0.98:level=false`**. Sin ese
  guardarrail, `volume` despues del `alimiter` puede pasarse de 1,0 y
  recortar muestras (distorsion). El `level=false` es imprescindible: con
  `level` (que es lo por defecto) el filtro renormaliza y baja el nivel.
- **El markdown se limpia antes de hablar**: se eliminan bloques de codigo,
  codigo en linea, enlaces, tablas y emojis. Un bloque de codigo se sustituye
  por "bloque de codigo".
- **Solo se locuciona un mensaje una vez**: se deduplica por
  `sessionID + messageID`.
- **El plugin se carga mas de una vez** en el mismo proceso (el vigilante de
  ficheros reimporta el modulo y cada recarga de configuracion lo carga dos
  veces). Como comparten `globalThis`, hay un relevo: la instancia mas
  reciente se queda con el turno y las demas se callan. Si la titular deja de
  dar señales, otra la recoge para que la voz no se apague sola.
- **`ctx.session.synthetic()` no sirve para dar avisos**: no es un canal de
  feedback, inyecta un mensaje en la sesion **y el modelo lo responde**. Como
  el TTS lee el ultimo mensaje del asistente, la voz leia en voz alta la
  respuesta del modelo al propio aviso del plugin. Por eso los comandos se
  confirman **por audio**.
- **Si el modelo no devuelve texto, no se dice nada**: el plugin solo escucha
  `session.execution.succeeded`, que no se emite cuando la ejecucion no
  produce una respuesta final. Una traza vacia en
  `~/.local/share/opencode/voice-tts.log` significa eso, no un fallo del
  plugin.
- **La cola tiene un watchdog de 300 s**: si un `pw-play` se queda colgado, se
  libera la cola en vez de bloquear todas las locuciones siguientes. Cada
  subproceso (piper, ffmpeg, pw-play) tiene ademas su propio tiempo limite.
- **Si el resumen falla**, se cae al recorte por frases: la voz nunca se
  queda muda por un fallo del LLM local.

### Dictado

El dictado lo aporta `@juliuskb/opencode-voice`: el motor Whisper y el
microfono. **Su atajo no llega** (ver "Por que los atajos del keymap no
disparaban" mas abajo), asi que el atajo lo pone **nuestro propio plugin**
(`opencode-voice-tts`, mitad TUI), que habla con el motor de Whisper a
traves del RPC `voice` del otro plugin.

| Tecla | Que hace |
|---|---|
| `ctrl+space` | Dictar: pulsa para empezar, pulsa otra vez para parar |
| `alt+d` | Lo mismo, por si `ctrl+space` no te llega (en KDE suele estar asignada a "cambiar metodo de entrada") |
| `ctrl+alt+m` | Silenciar o activar la voz de las respuestas |
| `ctrl+alt+t` | Cambiar de timbre (rota `k2` -> `e4` -> `j1` -> `plain`) |

Los atajos viven en `~/.local/share/opencode/voice-tts.json`. El plugin crea ese
fichero con estos valores si no existe y **lo relee cuando cambia**, asi que
cambiar una tecla es editar un JSON: se aplica al instante, sin reiniciar.

```json
{
  "dictate": ["ctrl+space", "alt+d"],
  "mute": ["ctrl+alt+m"],
  "preset": ["ctrl+alt+t"]
}
```

Cada accion admite una o varias teclas. Los nombres son los de OpenTUI:
`f1`..`f12`, `space`, `escape`, `enter`, `tab`, `up`, `down`, `left`, `right`,
`home`, `end`, `pageup`, `pagedown`, mas los modificadores `ctrl`, `alt` y
`shift`.

En la paleta de comandos (`ctrl+p`) estan los mismos comandos: "Voz: dictar"
(tambien `/dictar`), "Voz: silenciar" (tambien `/silenciar`) y "Voz: cambiar de
timbre".

El micro **no esta abierto nunca**: solo se abre entre dos pulsaciones. El
plugin de Whisper lo ejecuta bajo un watchdog que lo mata si OpenCode muere, y
barre grabadores huerfanos al arrancar. Al terminar, se abre un **borrador
editable** con lo que dijo el micro: `Enter` lo envia, `Esc` lo descarta.

#### El panel lateral de voz

En la barra lateral (a la derecha) aparece nuestro propio panel:

```
voz: k2
```

y mientras se graba, en su lugar:

```
grabando 3s ▁▂▃▅▇▅▃▂▁
```

El medidor se alimenta del RPC `level` del plugin de Whisper (nivel RMS de los
ultimos ~100 ms de audio). Se consulta cada 200 ms mientras hay grabacion y
cada 1 s en reposo, asi que **tambien se enciende si grabas con el atajo del
otro plugin**, no solo con el nuestro.

El panel es un slot en `sidebar.content` que devuelve **texto plano**: un
`JSX.Element` de Solid admite un `string`, asi que no hace falta importar el
runtime de Solid (que un plugin local no puede resolver). Como no hay
reactividad sin Solid, cuando el texto cambia se **vuelve a registrar** el slot
(`context.ui.slot` devuelve la funcion para desregistrar).

#### La custodia del audio (y por que se trababa el dictado)

El motor de Whisper guarda en disco el audio de la ultima transcripcion, por
si el texto se pierde. A cambio, **bloquea el siguiente dictado** hasta que el
cliente confirma que el borrador ya esta a salvo. Ese aviso llega en el evento
RPC `result` como un token `take`, y se devuelve con `draftSave({text, take})`.

Si esa confirmacion se pierde (el TUI se reinicio a medias, el dialogo se
cerro de golpe, ...), el token se queda en memoria del servidor y el siguiente
dictado falla con:

```
The previous take is not in a draft yet - press the restore key to recover it
```

Nuestro plugin lo evita guardando el `take` de cada transcripcion y soltando
la custodia en cuanto el borrador se envia o se descarta. Si aun asi se traba
(el token se perdio al reiniciar el TUI), hay un comando de rescate:

```
/voice-reset
```

Desactiva y vuelve a activar la red de seguridad, que es la unica forma de
liberar el token sin tenerlo delante. Ojo: eso borra el audio y el borrador de
recuperacion que hubiera guardados.

Mientras el borrador esta en el dialogo de revision, la tecla de dictado no
hace nada (avisa de que hay un dictado pendiente): el servidor rechazaria una
grabacion nueva.

#### Por que los atajos del keymap no disparaban

Ni `F9` ni el resto de atajos del keymap llegaban a ejecutarse. Es un fallo en
el reparto de teclado de OpenTUI 2.1.1: **la capa se registra** (se ve en la
traza) **pero la pulsacion nunca llega a ejecutarla**. Lo delata que el
comando existe en el keymap pero su `run` no se invoca nunca.

Hay ademas una segunda capa rota: la mitad de terminal de
`@juliuskb/opencode-voice` **aborta antes de registrar su capa** (el
`context.ui.router.register(...)` va antes del `context.keymap.layer(...)`),
asi que su comando `voice.record.toggle` no existe. Sin errores en el log:
simplemente no esta. Comprobable:
`context.keymap.shortcuts("voice.record.toggle")` devuelve `[]`.

Que la tecla no fuera el problema tambien se comprobo en el binario: OpenTUI si
decodifica `F9` (mapa `20 -> f9` y `[20~ -> f9`). El atajo estaba bien
escrito; lo que no funcionaba era el camino.

Por eso las teclas se escuchan **directamente del renderizador**
(`context.renderer.keyInput`, evento `"keypress"`), que si funciona, y la capa
del keymap se queda **solo para la paleta** (comandos con `bind: false`).

#### Si los atajos no aparecen: mira la traza

En opencode 2.1.1 la mitad de terminal se reimporta sola cuando cambia un
fichero dentro del directorio del plugin (hay un *watcher* que reconcilia).
Comprueba que esta viva con:

```bash
tail -f ~/.local/share/opencode/voice-tui.log
# debe aparecer: "captura directa ACTIVADA: {...}"
```

Ojo: en 2.1.1 el TUI **descarta en silencio** cualquier mitad de terminal que
no cargue (ni error en el log). Si no aparece esa linea, la mitad no se ha
importado; entonces toca cualquier fichero del plugin para disparar la
reimportacion:

```bash
touch ~/.config/opencode/plugins/opencode-voice-tts/tui.js
```

Y un detalle sutil del `install.sh`: antes recreaba los symlinks con
`ln -sfn` **aunque ya apuntaran al repo**. Eso cambia el inode y **mata el
watcher**, con lo que la mitad de terminal dejaba de recargarse sola. Ahora
`install.sh` comprueba el enlace antes de tocarlo, asi que instalarlo ya no
rompe nada.

#### Limitacion: `context.storage` en la mitad TUI

El namespace de storage se deriva del ID del plugin, y el de la mitad TUI de
un plugin local es `<directorio>/tui`, con barra. OpenCode lo rechaza con
`Invalid storage segment: plugin.<id>/tui.<clave>` **y aborta el setup
entero** (con lo que los atajos se quedan sin registrar).

Por eso la mitad TUI **no usa `context.storage`**: el estado vive en variables
del modulo y se refleja en la traza. El estado persistente de la voz
(silenciada o no, y el timbre) lo guarda **la mitad servidor**, que si tiene
un ID de plugin valido.

Por la misma razon **no hay indicador en la barra inferior** (el pie de la
terminal): ahi el texto plano descuadraba el ancho de la barra. El estado se ve
en los avisos (toast) que salen al pulsar los atajos y en el **panel lateral**
(ver "El panel lateral de voz").

#### Cambiar la mitad TUI: hay que reiniciar el terminal

El watcher de OpenCode vigila el **entrypoint** del plugin (`index.js`), no el
fichero `tui.js`. Ademas, una "reconciliacion" solo vuelve a importar el
plugin si su entrypoint ha cambiado. Traducido: **cambiar `tui.js` no se ve
hasta que se reinicia el terminal** (o hasta que se toca `index.js` *y* cambia
la configuracion renderizada).

Instalar los dotfiles (`./install.sh`) reescribe siempre la configuracion
renderizada, asi que a veces basta con eso, pero no es fiable: si el contenido
no cambia, no hay evento y la mitad TUI se queda vieja.

Los modelos se descargan de los releases de `k2-fsa/sherpa-onnx` y
se guardan en `~/.local/share/opencode-voice/models/`.

Se pueden dejar listos sin pasar por el menu:

```bash
# modelo multilingue (609 MB) + detector de silencios
RELEASE="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models"
D=~/.local/share/opencode-voice/models
mkdir -p "$D/sherpa-onnx-whisper-small"
curl -fL "$RELEASE/sherpa-onnx-whisper-small.tar.bz2" | tar xj -C "$D/sherpa-onnx-whisper-small" --strip-components=1
# el plugin solo necesita el encoder int8, el decoder int8 y los tokens
find "$D/sherpa-onnx-whisper-small" -maxdepth 1 -type f ! -name '*.int8.onnx' ! -name '*-tokens.txt' -delete
curl -fL -o "$D/silero_vad.onnx" "$RELEASE/silero_vad.onnx"
```

Los ajustes viven en `~/.local/share/opencode-voice/settings.json`. Para
castellano, cambia el modelo a `small` (multilingue) y el idioma a `es`:

```json
{ "model": "small", "language": "es" }
```

> `small.en` es el valor por defecto y es **solo ingles**. Para dictar en
> castellano hace falta `small` (609 MB) o `turbo` (537 MB, `large-v3`
> destilado).

El microfono se elige en el menu (`device`): en esta maquina el de los
auriculares USB es `alsa_input.usb-Jieli_Technology_picun_G2_...`.

### Normalizacion con ollama (opcional)

`gemma4:12b` puede limpiar el texto dictado (quitar muletillas, arreglar
homofonos, poner puntuacion) antes de mandarlo al modelo. Se llama por la API
nativa de ollama:

```bash
curl -s http://localhost:11434/api/chat -d '{
  "model": "gemma4:12b",
  "think": false,
  "stream": false,
  "messages": [{"role":"user","content":"<transcripcion>"}]
}'
```

Dos detalles que cuestan un disgusto si se ignoran:

- **`think: false` es obligatorio.** Con el razonamiento por defecto, gemma4
  gasta 1133 tokens y tarda 37 segundos; sin el, 77 tokens y 2,9.
- **Hay que usar `/api/chat`, no `/v1/chat/completions`.** El endpoint
  OpenAI-compatible **ignora** el parametro `think`, asi que ahi no hay forma
  de desactivarlo.

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
opencode reload          # recarga la configuracion
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
tail -f ~/.local/share/opencode/voice-tts.log           # traza del plugin
```

En la interfaz: `/voice-test` tiene que oirse. Si no se oye, mira la traza:
ahí queda escrito si fallo piper, ffmpeg o el reproductor.

#### Comprobar el dictado sin pulsar nada

`/voice-capture-test` es el comando de diagnostico del microfono y de Whisper:
graba tres segundos, los transcribe y deja el resultado escrito en la traza.
No necesita ninguna tecla.

```bash
tail -f ~/.local/share/opencode/voice-tts.log
```

Y en otra terminal (o desde la propia interfaz con `/voice-capture-test`):

```bash
# 1. crear una sesion
SID=$(opencode api post /api/session --data '{"title":"micro"}' | jq -r '.data.id')

# 2. probar micro + Whisper de verdad
opencode api post "/api/session/$SID/command" \
  --data '{"name":"voice-capture-test","text":""}'
```

En la traza tiene que aparecer:

```
capture test: grabador {"recorder":"pw-record"}
capture test: OK -> {"wav":".../last-take.wav","seconds":2.98}
capture test: resultado -> {"client":"test-capture","text":"...","loadMs":1134,"transcribeMs":2346}
```

El texto vacio significa que en esos tres segundos no hablo nadie (Whisper no
inventa voz a partir de ruido). Para comprobar el motor con algo **seguro**,
pasa un audio ya grabado:

```bash
opencode api post "/api/session/$SID/command" \
  --data '{"name":"voice-capture-test","text":"/ruta/al/audio.wav"}'
```

El fichero tiene que ser WAV 16 kHz, mono, PCM s16. Si el motor no esta
cargado, la primera transcripcion tarda un segundo mas (es la carga del modelo).
