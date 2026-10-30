# El escritorio: KDE Plasma, Kitty y compañía

Esta guía cubre la parte del repositorio que no es de OpenCode: el tema del
escritorio, el terminal y el pequeño utilaje que los rodea — Cava, tmux, Kate,
GTK 3, OpenRGB y Ardour.

Todo se instala con `./install.sh` a partir de `manifest.txt`:

| Origen en `files/` | Destino en `~` | Modo |
|---|---|---|
| `config/kitty/kitty.conf` | `.config/kitty/kitty.conf` | link |
| `config/kitty/current-theme.conf` | `.config/kitty/current-theme.conf` | link |
| `config/kdedefaults/*` | `.config/kdedefaults/*` | link |
| `config/cava/*` | `.config/cava/*` | link |
| `tmux.conf` | `.tmux.conf` | link |
| `config/kate/externaltools/*` | `.config/kate/externaltools/*` | link |
| `config/gtk-3.0/*` | `.config/gtk-3.0/*` | link |
| `config/OpenRGB/*` | `.config/OpenRGB/*` | link |
| `config/ardour9/*.tmpl` | `.config/ardour9/*` | template |

---

## Kitty

Dos ficheros: la configuración y el tema.

`kitty.conf` es el fichero de Kitty con su documentación original; lo único
relevante son las opciones activas:

```
include current-theme.conf
kitty_mod ctrl+shift
font_family Cascadia Code NF
font_size 12
background_opacity 0.4
background_blur 3
window_padding_width 10
```

> La opción `enabled_keyboard_protocols` se puso aquí en su día para
> arreglar un problema con tmux, pero **no existe en kitty** (en ninguna
> versión): kitty avisaba en cada recarga con `Ignoring unknown config
> key`. El protocolo de teclado de kitty se negocia solo con cada
> aplicación, y tmux 3.4 o posterior lo entiende sin configuración
> extra, así que la opción se eliminó.

### El tema Hachiko

`current-theme.conf` define la paleta *Hachiko* (de Mert18): fondo `#181818`,
rojo de acento `#960042` y bordes claros. `kitty.conf` la incluye con
`include current-theme.conf`, así que el color vive en un fichero aparte y
cambiar de paleta no obliga a tocar la configuración.

El acento `#FF2044` de esa paleta es el mismo que usa el tema `retro-dark`
de OpenCode: los dos terminales hablan el mismo idioma.

### La fuente: Cascadia Code NF

Kitty **no admite listas de fuentes separadas por comas** en `font_family`:
trata la cadena entera como un único nombre de familia. Si no la encuentra,
cae al monoespaciado por defecto (Noto Sans Mono en Fedora) y todos los
iconos y los glifos de powerline se ven como cajas vacías.

Por eso el repositorio pide la familia **exacta**: `Cascadia Code NF`, que es
como se registra el paquete `cascadia-code-nf-fonts` de Fedora.

```bash
sudo dnf install cascadia-code-nf-fonts
```

Sin permisos de administrador, en el home del usuario:

```bash
mkdir -p ~/.local/share/fonts/cascadia-code-nf
cp /usr/share/fonts/cascadia-code-nf-fonts/*.otf ~/.local/share/fonts/cascadia-code-nf/
fc-cache -f
```

Comprobar qué fuente resuelve Kitty de verdad:

```bash
kitty --debug-font-fallback 2>&1 | head -1
```

Debe salir `Normal=CascadiaCodeNF-Regular`. Si sale `NotoSansMono-Regular`,
la fuente no está instalada o el nombre no coincide.

Para recargar la configuración sin cerrar la ventana: `Ctrl+Shift+F5`.

---

## Cava

El visualizador de audio lleva su configuración en tres sitios:

- `config`: el fichero de Cava propiamente dicho. Está **todo comentado**, así
  que Cava usa sus valores por defecto (60 fps, `autosens`, barras de 20 px).
  Cada opción viene documentada en el propio fichero con su valor de
  fábrica: descomentar una línea es cambiar una cosa concreta.
- `settings.json`: el esquema de color que Cava lee de la carpeta de
  configuración.
- `shaders/`: `pass_through.vert` (vértices), `bar_spectrum.frag` (barras con
  espectro) y `northern_lights.frag` (auroras). Para cambiar de shader:

  ```ini
  [output]
  vertex_shader = pass_through.vert
  fragment_shader = northern_lights.frag
  ```

---

## tmux

`~/.tmux.conf` monta un *dashboard* de tres paneles cada vez que se arranca
tmux: `fastfetch` a la izquierda, `cava` a la derecha y `bash` debajo.

Comprobar la sintaxis sin abrir ninguna sesión:

```bash
tmux -f ~/.tmux.conf -C && echo TMUX_OK
```

---

## Kate

El repositorio instala 18 herramientas externas (`externaltools`): formateo de
C, C++, Go, Rust, JSON, XML y QML; `git blame`, `gitk` y `git-cola`;inserción de
UUID; búsqueda de la API de KDE y de Qt; y ejecución de scripts.

Cada una es un `.ini` independiente con la definición de Kate:

```
[Name]
Name=Go Fmt Full File

[Action]
Command=go fmt %f
```

Las herramientas que dependan de un programa externo (`go`, `rustfmt`,
`prettier`, `clang-format`) necesitan ese programa instalado; si no, Kate
simplemente no puede ejecutarlas.

---

## GTK 3

`~/.config/gtk-3.0/` lleva el tema de GTK 3: `colors.css` y `gtk.css` con la
paleta, `settings.ini` con las opciones del tema y 22 iconos SVG en `assets/`
(botones de minimizar, maximizar y cerrar, en sus variantes normal, hover,
active y backdrop).

---

## Plasma: la capa `kdedefaults`

Plasma lee `~/.config/kdedefaults/` como una **capa de valores por defecto**,
que se aplica por debajo de la configuración del usuario. Es la forma
correcta de distribuir un aspecto sin pisar lo que cada usuario haya
cambiado a mano.

| Fichero | Qué fija |
|---|---|
| `kdeglobals` | esquema de color (`Darkly2`), iconos (`Simply-Red-Circles`), estilo de los widgets (`Darkly`) |
| `kwinrc` | decoración de ventanas (`org.kde.darkly`) y disposición del `TabBox` |
| `plasmarc` | tema del plasma (`darkly`) |
| `ksplashrc` | pantalla de bienvenida (`RetroRed-Dark`) |
| `kcminputrc` | tema del cursor |
| `package` | el paquete de aspecto (`RetroRed-Dark`) |

Comprobar qué está leyendo realmente Plasma:

```bash
kreadconfig6 --file ~/.config/kdedefaults/kdeglobals --group General --key ColorScheme
kreadconfig6 --file ~/.config/kdedefaults/kwinrc --group org.kde.kdecoration2 --key library
```

### Aviso: lo que NO está versionado

El repositorio gestiona **solo** la capa `kdedefaults`. Los ficheros reales
del usuario —`~/.config/kdeglobals`, `~/.config/kwinrc`,
`~/.config/plasmarc`, `~/.config/ksplashrc` y `~/.config/kcminputrc`— se
quedan fuera del repositorio, y eso tiene dos consecuencias concretas:

- una **instalación limpia no reproduce el aspecto actual al completo**: el
  nombre del esquema de color y el tema de Plasma sí vienen de `kdedefaults`,
  pero la paleta fina y los colores de las decoraciones son los que el
  usuario tenga guardados en su `~/.config/kdeglobals` y `~/.config/kwinrc`
- el repositorio **no puede re-aplicar** esa paleta, porque no la conoce

Es una decisión consciente —el repositorio pone la base y el usuario
conserva el ajuste fino—, pero quien quiera una instalación reproducible
tiene que copiar esos ficheros al repositorio y añadirlos a `manifest.txt`
como `link`.

---

## OpenRGB

Tres ficheros:

- `1.orp`: el perfil con el estado de cada dispositivo (efectos, colores,
  dispositivos que ganan el control)
- `OpenRGB.json`: la lista de dispositivos que esta versión de OpenRGB
  reconoce
- `sizes.ors`: los tamaños de las tiras de LED

### El perfil ata cada dispositivo a un `hidraw`

Un `.orp` guarda, para cada dispositivo, la ruta HID con la que se encontró
(`/dev/hidrawN`). Esos números **cambian** cuando se conecta o desconecta un
teclado, un ratón o un receptor USB: el mismo ratón puede pasar de
`/dev/hidraw2` a `/dev/hidraw4` según el orden de enumeración del kernel.

No todos los dispositivos se comportan igual:

- **ASUS Aura y Keychron** se guardan como `HID: /dev/hidrawN`. OpenRGB los
  empareja por **GUID**, así que OpenRGB los reasigna solos en cada arranque:
  el perfil no se rompe aunque el número cambie.
- **Ratón y receptor EVGA** se guardan como `/dev/hidrawN` a secas. OpenRGB los
  empareja por **ruta exacta**, así que en cuanto el ratón se duerme y se
  reconecta sus números se desplazan y su perfil deja de cargar. En el log
  sale `Profile loading: FAILED! for EVGA ...`.

Si el perfil queda desfasado, OpenRGB aplica el efecto al dispositivo
equivocado —o no lo aplica—. El log del arranque dice exactamente qué pasó
con cada dispositivo:

```bash
grep "Profile loading" ~/.config/OpenRGB/logs/$(ls -t ~/.config/OpenRGB/logs/ | head -1)
```

Comprobar el perfil guardado:

```bash
strings ~/.config/OpenRGB/1.orp | grep -E "hidraw"
```

Comprobar los dispositivos que detecta ahora mismo:

```bash
openrgb --list-devices
```

Si no coinciden, hay que re-guardar el perfil.

### Re-guardar el perfil (⚠️ solo desde la GUI)

> **Nunca guardes el perfil con `openrgb -sp`.** Esa orden arranca una
> instancia **sin interfaz y sin cargar ningún perfil**, así que todos los LED
> se guardan en **negro (`0x00`)** en lugar de su color real. El fallo es
> silencioso: OpenRGB responde `Profile saved successfully` y el fichero sale
> perfectamente válido, pero la placa se queda apagada. Por eso el perfil de
> este repo se versiona a mano y se revisa con `hexdump` (abajo).

La forma correcta es desde la GUI:

1. Abrir OpenRGB (icono en la bandeja) y **comprobar que las luces están
   encendidas**.
2. *Devices* → botón **Save profile** → guardar con el nombre `1`.
3. Comprobar que el fichero se actualizó:

```bash
ls -l --time-style=full-iso ~/.config/OpenRGB/1.orp
```

Antes de darlo por bueno, comprobar que los colores **no** están en negro.
El array de color por LED de la ASUS Aura (94 LED) está en el offset 3935 del
perfil actual:

```bash
hexdump -C -s 3935 -n 16 ~/.config/OpenRGB/1.orp
```

Salida correcta: `5e 00` (nº de LED) seguido de `ff ff ff 00` repetido.
Si sale `00 00 00 00`, el perfil está apagado y hay que rehacerlo.

Después, al repo y a reiniciar:

```bash
cp ~/.config/OpenRGB/1.orp ~/dotfiles/files/config/OpenRGB/1.orp
systemctl --user restart 'app-OpenRGB@autostart.service'
```

### El servicio de systemd

OpenRGB trae una unidad de sistema (`/etc/systemd/system/openrgb.service`)
que arranca el servidor SDK en el puerto 6742. En esta máquina **no se usa**:
la GUI ya arranca con el perfil 1 al iniciar sesión, desde
`~/.config/autostart/OpenRGB.desktop`, y las dos instancias competirían por
los mismos dispositivos HID.

Si la unidad está instalada y falla, lo correcto es apagarla:

```bash
sudo systemctl mask openrgb.service
sudo systemctl disable openrgb.service
```

### Servicios de usuario que solo hacen ruido

Dos unidades de autostart fallan porque el programa está instalado pero no
tiene nada que hacer (un método de entrada sin configurar, un
`input-remapper` sin mapa). Enmascararlas:

```bash
systemctl --user mask 'app-imsettings\x2dstart@autostart.service'
systemctl --user mask 'app-input\x2dremapper\x2dautoload@autostart.service'
```

> **Ojo con el nombre**: contiene la secuencia literal `\x2d` —así escapa
> systemd el guion— y hay que entrecomillarlo para que el shell no se coma el
> backslash. Sin comillas se crea un symlink con el nombre equivocado y la
> unidad sigue fallando.

---

## Ardour 9

`config` y `ui_config` son plantillas: se renderizan con `__HOME__` al
instalar. Son ficheros XML de Ardour (sesión, ventanas y disposición) y no
dependen de ninguna ruta de la máquina.

---

## Comprobar que todo funciona

```bash
# terminal
kitty --debug-font-fallback 2>&1 | head -1       # -> CascadiaCodeNF-Regular

# tmux
tmux -f ~/.tmux.conf -C && echo TMUX_OK

# Plasma
kreadconfig6 --file ~/.config/kdedefaults/kdeglobals --group General --key ColorScheme

# OpenRGB
systemctl --user is-active 'app-OpenRGB@autostart.service'   # -> active
strings ~/.config/OpenRGB/1.orp | grep -E "hidraw"

# servicios
systemctl --failed            # solo el sistema
systemctl --user --failed     # debe estar vacío
```
