# RetroDark Theme — Fedora 44 · KDE Plasma 6

Dotfiles de un escritorio **KDE Plasma 6 sobre Fedora 44**: tema oscuro
cyberpunk, terminal Kitty con translúcido real, y un tema propio para
OpenCode con acento `#FF2044`.

Todo el contenido es **configuración declarativa**: no hay scripts de
arranque ni daemons, solo ficheros de configuración enlazados al home.
Para excluir algo basta con quitar su línea de `manifest.txt`.

---

## Requisitos

| | |
|---|---|
| Sistema | Fedora 44 (compatible con otras versiones de Fedora y KDE) |
| Escritorio | KDE Plasma 6 |
| Herramientas | `bash`, `git` |
| Opcionales | `kitty`, `opencode`, `cava`, `OpenRGB`, `ardour9`, `kate` |

Ninguno es obligatorio: `manifest.txt` determina qué se instala, y las
líneas que no interesen pueden comentarse.

## Instalación

```bash
git clone https://github.com/MaryanK00/RetroDark_Theme_Fedora44_KDE_Dotfiles.git ~/dotfiles
cd ~/dotfiles
./install.sh
```

`install.sh`:

- crea **symlinks** desde el home hacia `files/`
- deja una **copia de seguridad** de cada fichero sustituido en
  `~/.dotfiles-backup/<fecha>/`
- renderiza las plantillas (`.tmpl`) sustituyendo los marcadores
- regenera los sonidos de OpenCode si localiza el tema de Nier instalado

Para instalarlo en otro equipo: clonar y ejecutar `./install.sh` allí.
Las rutas absolutas se resuelven solas.

## Qué se instala

| Destino | Contenido |
|---|---|
| `~/.bashrc` | shell: añade `~/.opencode/bin` al `PATH` |
| `~/.bash_profile`, `~/.bash_logout` | shell |
| `~/.gitconfig` | git con LFS y el helper de credenciales de `gh` |
| `~/.tmux.conf` | tmux |
| `~/.gtkrc-2.0` | GTK 2 |
| `~/.config/kitty/` | terminal: tema *Hachiko*, opacidad 0.4, blur 3, FiraCode Nerd Font |
| `~/.config/kdedefaults/` | configuración de Plasma (kwinrc, plasmarc, kdeglobals…) |
| `~/.config/plasma-org.kde.plasma.desktop-appletsrc` | paneles, widgets, fondos de pantalla y konsole |
| `~/.config/opencode/` | tema `retro-dark`, sonidos, `cli.json`, `opencode.json`, `AGENTS.md`, el arranque del MCP de GitHub y el plugin de voz |
| `~/.config/opencode/plugins/opencode-voice-tts/` | plugin local que locuciona las respuestas (piper + ffmpeg) |
| `~/.config/cava/` | visualizador de audio |
| `~/.config/OpenRGB/` | control de RGB |
| `~/.config/kate/` | editor Kate |
| `~/.config/gtk-3.0/` | tema GTK 3 |
| `~/.config/ardour9/` | configuración de Ardour |

## Qué no se incluye

El repositorio **no contiene credenciales ni datos personales**. Quedan
fuera de forma deliberada:

- claves GPG (`~/.gnupg/`), keyring de GNOME, tokens de sesión de
  Electron y de aplicaciones
- la base de datos de OpenCode, donde se almacenan las claves de los
  proveedores de IA
- perfiles de navegador y de aplicaciones, historiales de shell, cachés
  y datos de Flatpak
- las rutas absolutas del home: en las plantillas se emplea el marcador
  `__HOME__`

El repositorio pesa **~400 KB**. El material de mayor tamaño (1,4 MB de
sonidos) tampoco se distribuye, por el motivo que se explica en
[Sonidos](#sonidos).

## El tema de OpenCode: `retro-dark`

`files/config/opencode/themes/retro-dark.json` es un tema del formato V2
de OpenCode (`base` + `light` + `dark`):

- **gris industrial cyberpunk**: los neutros se sitúan en matiz OKLCh 235
  (acero frío) y las superficies son carbón azulado sobre el fondo
  transparente del terminal
- **acento `#FF2044`** —el `color4` del tema *Hachiko* de Kitty— en
  palabras clave, títulos, separadores y barra de scroll
- **borde `#862626`** en ventanas y diálogos
- el lienzo es **transparente**: se aprecia el fondo real de Kitty,
  con su opacidad y su desenfoque

Se activa desde `~/.config/opencode/cli.json`:

```json
{ "theme": { "name": "retro-dark", "mode": "system" } }
```

`mode: "system"` hace que el tema siga al modo claro/oscuro del terminal.

### Modificar los colores

Todo el color procede de la rampa `purple` (la familia roja del acento) y
de la rampa `gray` (los neutros). Ambas se editan en el fichero del tema,
en `base` y en las secciones `light` / `dark`.

Las superficies se controlan con `background.raised` y el borde con
`border.base`. El acento se modifica en un único punto:

```jsonc
"purple": {
  "200": "#FF2044",   // el acento (texto, títulos, scroll)
  "400": "#b1003c"    // la marca
}
```

## Sonidos

OpenCode puede emitir avisos sonoros al pedir permiso, al terminar una
tarea o al formular una pregunta. La configuración de `cli.json` asocia
cada evento a un fichero:

| Evento | Sonido |
|---|---|
| `default` | blip de mensaje |
| `question` | pregunta de diálogo |
| `permission` | campana de sistema |
| `error` | error serio |
| `done` | jingle de entrada |
| `subagent_done` | dispositivo añadido |

Los ficheros **no se distribuyen en este repositorio**: son clips del
juego *NieR: Automata*, propiedad de sus autores originales, así lo
reconoce el propio tema del que proceden. Lo que sí se incluye es el
script que los prepara:

```bash
bash scripts/make-sounds.sh
```

Convierte los OGG del tema de sonido de Nier (si está instalado en
`~/.local/share/sounds/nier-automata-sound-theme/`) a WAV de 16 bit /
48 kHz estéreo, y los normaliza a −3 dBFS para que `attention.volume`
sea un control coherente entre todos ellos. `install.sh` lo invoca
automáticamente; cuando el tema no está presente, avisa y OpenCode
utiliza sus sonidos por defecto.

El resto de la configuración de sonido sí se incluye:

```json
"attention": {
  "notifications": true,
  "sound": true,
  "volume": 0.4,
  "sounds": { "done": "__HOME__/.config/opencode/sounds/done.wav" }
}
```

## OpenCode: comportamiento, herramientas y agentes

`cli.json` gobierna el **aspecto** de OpenCode. El resto de su
configuración vive en `opencode.json`, que este repo también instala:

| Fichero | Qué hace |
|---|---|
| `~/.config/opencode/opencode.json` | permisos, servidores MCP, referencias, plugin y calentamiento de caché |
| `~/.config/opencode/AGENTS.md` | instrucciones globales, cargadas en todas las sesiones |
| `~/.config/opencode/bin/github-mcp.sh` | arranque del servidor MCP de GitHub, con el token del keyring de `gh` |
| `~/.config/opencode/secrets.env` | claves locales (no se versiona, permisos `600`) |

Lo esencial:

- **Permisos.** La política por defecto de OpenCode es permitir todo. Aquí se
  añaden solo las guardas que importan: editar `.env` pregunta, editar
  claves privadas se bloquea, y `sudo`, `rm -rf`, `git push` y `curl \| sh`
  piden confirmación. Nada más genera ruido.
- **MCP.** `context7` (documentación de librerías), `github` (repos, issues y
  PRs) y `playwright` (navegador real). El token de GitHub se lee del
  keyring de `gh auth login` en cada arranque: no se escribe en ningún
  fichero.
- **Plugin.** `@tarquinen/opencode-dcp` recorta del historial las salidas de
  herramientas que ya no sirven, sin tocar la sesión. Y
  `@upstash/context7-opencode` añade la skill `context7-mcp`, que busca
  documentación de librerías por su cuenta.
- **References.** El repositorio de dotfiles queda accesible para el agente
  con el alias `dotfiles`, sin cargarlo en el contexto.
- **`AGENTS.md` global.** Deliberadamente corto: solo restricciones duras
  que apliquen al 100 % de las peticiones.
- **Claves.** `~/.config/opencode/secrets.env` guarda las claves locales
  (permisos `600`, nunca versionadas). Un fragmento de `~/.bashrc.d/` las
  carga al arrancar con `set -a`, así que OpenCode las encuentra sin
  guardarlas en la configuración.
- **Voz.** Dictado con whisper local (sin nube) y locución de las
  respuestas con piper + una cadena de filtros de ffmpeg. Todo en castellano
  y sin salir de la máquina. Atajos: `ctrl+space` o `alt+d` para dictar,
  `ctrl+alt+m` para silenciar la lectura y `ctrl+alt+t` para cambiar de
  timbre. Comandos: `/speak` (silencia o activa), `/voice` (cambia el preset:
  `k2`, `e4`, `j1`, `plain`), `/voice-test`, `/voice-capture-test` (prueba
  del micro y de Whisper), `/voice-reset` (libera un dictado atascado) y
  `/voice-cancel` (corta una grabacion que se haya quedado colgada). El
  binario y los modelos no se versionan: `./scripts/install-voice.sh` los
  deja listos.

El detalle completo —incluido el coste en contexto de cada servidor MCP, por
qué se usa el paquete de npm en lugar del binario oficial de GitHub, y cómo
desactivar o cambiar cada pieza— está en
[`docs/instalacion-guia.md`](docs/instalacion-guia.md).

## Personalización

### Plantillas

Los ficheros con sufijo `.tmpl` se renderizan durante la instalación:

| Marcador | Sustituye a |
|---|---|
| `__HOME__` | el directorio home del usuario |
| `__GIT_NAME__` | `git config --global user.name` |
| `__GIT_EMAIL__` | `git config --global user.email` |

### Añadir o retirar configuración

`manifest.txt` es la lista blanca: una línea por fichero, con el origen
dentro de `files/`, el destino dentro de `~` y el modo.

```
# | origen en files/ | destino en ~ | modo |
bashrc.tmpl	.bashrc	template
config/kitty/kitty.conf	.config/kitty/kitty.conf	link
```

- `link` — symlink directo al fichero del repositorio
- `template` — se renderiza a `rendered/` y se enlaza la copia

Para retirar una entrada basta con comentar su línea y volver a ejecutar
`./install.sh`.

## Desinstalar

```bash
./restore.sh
```

Retira los symlinks y, de forma opcional, restaura las copias de
seguridad de la última instalación. También es posible hacerlo de forma
manual: los ficheros originales quedan en `~/.dotfiles-backup/<fecha>/`.

## Verificar la ausencia de secretos

El hook `pre-commit` protege a quien haga un fork y modifique el
repositorio:

- **gitleaks** bloquea el commit si detecta credenciales
- `scripts/scan-secrets.sh` aplica patrones adicionales a los de gitleaks
- se rechazan los ficheros de más de 1 MB
- se rechazan las rutas `/home/<usuario>`: debe usarse el marcador
  `__HOME__`

Auditoría completa del repositorio:

```bash
gitleaks detect --source . --redact
bash scripts/scan-secrets.sh .
```

## Estructura

```
├── install.sh              instala (symlinks + backup + render)
├── restore.sh              revierte
├── manifest.txt            lista blanca: lo único que se instala
├── files/                  la configuración, en su estructura de destino
├── scripts/
│   ├── make-sounds.sh      genera los WAV desde el tema de Nier
│   └── scan-secrets.sh     escáner de credenciales propio
├── docs/
│   └── instalacion-guia.md guía de la parte de OpenCode que no es estética
├── hooks/pre-commit        gitleaks + límites de tamaño
└── rendered/               copias renderizadas (no se versionan)
```

## Notas por aplicación

Tras la instalación, algunas aplicaciones requieren recargarse:

- **Kitty**: `Ctrl+Shift+F5` recarga la configuración; `Ctrl+Shift+F6`
  muestra la vigente
- **KDE Plasma**: cerrar la sesión y volver a entrar, o
  `plasmashell --replace` para recargar los paneles
- **OpenCode**: reiniciar la TUI, los temas se leen al arrancar
- **mpv**: la configuración se lee al abrir cada vídeo

## Créditos

- [kitty](https://sw.kovidgoyal.net/kitty/) — terminal
- Tema *Hachiko* para kitty, de Mert18
- [OpenCode](https://opencode.ai) — terminal de IA y su formato de temas
- [Ardour](https://ardour.org), [Cava](https://github.com/DeepChandrash/cava),
  [OpenRGB](https://openrgb.org), [Kate](https://kate.kde.org)
- Los sonidos de Nier: Automata pertenecen a sus autores originales; aquí
  solo se incluye el script que los prepara a partir del tema instalado
  en el sistema

KDE Plasma 6 · Fedora 44 · Kitty · OpenCode
