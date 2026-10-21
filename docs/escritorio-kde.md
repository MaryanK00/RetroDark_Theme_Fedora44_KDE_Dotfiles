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
enabled_keyboard_protocols kitty,legacy
font_family Cascadia Code NF
font_size 12
background_opacity 0.4
background_blur 3
window_padding_width 10
```

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
  dispositivos queiganan el control)
- `OpenRGB.json`: la lista de dispositivos que esta versión de OpenRGB
  reconoce
- `sizes.ors`: los tamaños de las tiras de LED

### El perfil ata cada dispositivo a un `hidraw`

Un `.orp` guarda, para cada dispositivo, la ruta HID con la que se encontró
(`/dev/hidrawN`). Esos números **cambian** cuando se conecta o desconecta un
teclado, un ratón o un receptor USB: el mismo ratón puede pasar de
`/dev/hidraw2` a `/dev/hidraw4` según el orden de enumeración del kernel.

Si el perfil queda desfasado, OpenRGB aplica el efecto al dispositivo
equivocado —o no lo aplica—.

Comprobar el perfil guardado:

```bash
strings ~/.config/OpenRGB/1.orp | grep -E "hidraw"
```

Comprobar los dispositivos que detecta ahora mismo:

```bash
openrgb --list-devices
```

Si no coinciden, hay que re-guardar el perfil.

### Re-guardar el perfil

Cerrar la instancia que esté corriendo —la GUI de la bandeja es la misma— y
ejecutar:

```bash
openrgb -sp /tmp/1-nuevo
```

> **Ojo**: `-sp` **añade** la extensión `.orp`, así que el fichero acaba en
> `/tmp/1-nuevo.orp`, no en `/tmp/1-nuevo`.

Validarlo antes de copiarlo:

```bash
strings /tmp/1-nuevo.orp | grep -E "hidraw"
```

Y después:

```bash
cp /tmp/1-nuevo.orp ~/dotfiles/files/config/OpenRGB/1.orp
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
