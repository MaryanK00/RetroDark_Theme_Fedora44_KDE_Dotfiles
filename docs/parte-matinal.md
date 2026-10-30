# Parte matinal — el saludo con voz

`scripts/morning-briefing` saluda con voz al iniciar la sesión en Plasma.
Dice el día y la hora, el tiempo de tu zona, cómo han cerrado los
principales índices y un resumen de las noticias.

La voz es la **misma que usa el plugin de voz de OpenCode**: piper con el
modelo `es_ES-davefx-medium` y la cadena de filtros de `ffmpeg` del preset
*K2*. El plugin no se toca; el script lleva su propia copia de la cadena.

```
morning-briefing [--autostart] [--now] [--dry-run] [--reset] [--ayuda]
```

> Resumen operativo (comandos, mapa de ficheros y diagnóstico) en
> `~/.config/opencode/morning-briefing.md`, que es un enlace a
> `files/config/opencode/morning-briefing.md`.

| Opción | Qué hace |
|---|---|
| *(ninguna)* | Parte manual: habla ahora y **no** sella el día |
| `--autostart` | Lo usa el arranque de sesión: es el único modo que sella el día |
| `--now` | Habla aunque hoy ya se haya hablado, y sin esperar |
| `--dry-run` | Imprime el texto en el terminal y **no** suena |
| `--reset` | Borra el sello del día, para que el próximo arranque vuelva a hablar |
| `--ayuda` | La ayuda |

---

## Instalación

`install.sh` hace dos cosas:

1. deja el enlace del script en `~/.local/bin/morning-briefing`;
2. renderiza `files/config/autostart/morning-briefing.desktop.tmpl` a
   `~/.config/autostart/morning-briefing.desktop`, que es la entrada de
   autostart de Plasma.

```bash
cd ~/dotfiles && ./install.sh
```

Para quitarlo, `./restore.sh` (o borrar la entrada de autostart y el
enlace a mano).

### La entrada de autostart

```ini
[Desktop Entry]
Type=Application
Name=Parte matinal
Exec=__HOME__/.local/bin/morning-briefing --autostart
Terminal=false
X-KDE-autostart-phase=2
X-KDE-autostart-after=panel
```

`X-KDE-autostart-phase=2` la launches en la fase de **aplicaciones** del
arranque de Plasma, y `X-KDE-autostart-after=panel` espera a que el panel
esté listo. El script, además, espera 15 s por su cuenta (`DELAY`) para
que el audio y la red estén disponibles; si aun así no hay red, espera
otros 30 s y reintenta.

El `--autostart` no es decorativo: es lo que marca la ejecución como
automática, y **solo ese modo sella el día**.

---

## Dónde está cada cosa

El repo es la fuente de verdad; el home solo tiene enlaces a él. Si algo se
edita en el home se está editando el repo (y por tanto, git lo ve).

```
~/dotfiles/                                   REPO (git)
├── scripts/morning-briefing                  el programa
├── files/config/morning-briefing/config      la configuración
├── files/config/autostart/
│   └── morning-briefing.desktop.tmpl         la plantilla del autostart
├── rendered/<hash>/.config/autostart/
│   └── morning-briefing.desktop              la plantilla ya renderizada
├── manifest.txt                              qué se enlaza y dónde
└── docs/parte-matinal.md                     esta página
```

```
~/.local/bin/morning-briefing                 -> repo/scripts/morning-briefing
~/.config/morning-briefing/config             -> repo/files/config/…/config
~/.config/autostart/morning-briefing.desktop  -> repo/rendered/<hash>/…desktop
~/.local/state/morning-briefing/              datos de ejecución (no están en git)
├── briefing.log                              registro, con tope de 400 líneas
├── last-run                                  sello del día
└── last.txt                                  el último texto dicho
```

Para llegar a cada cosa, sin buscar:

| Quiero… | Voy a… |
|---|---|
| cambiar ciudad, espera, índices o fuentes | `~/.config/morning-briefing/config` |
| tocar lo que dice (frases, orden) | `~/dotfiles/scripts/morning-briefing` |
| que arranque de otra forma | `~/dotfiles/files/config/autostart/morning-briefing.desktop.tmpl` + `./install.sh` |
| ver por qué no habló | `tail -20 ~/.local/state/morning-briefing/briefing.log` |
| saber qué dijo el último día | `cat ~/.local/state/morning-briefing/last.txt` |
| forzar el saludo | `morning-briefing --now` |
| que vuelva a sonar al arrancar | `morning-briefing --reset` |
| leer el texto sin sonido | `morning-briefing --dry-run` |
| desinstalarlo | `~/dotfiles/restore.sh` |

El ejecutable está en el `PATH` (`~/.local/bin`), así que `morning-briefing`
funciona desde cualquier carpeta. `morning-briefing --ayuda` recuerda las
opciones y las dos rutas principales.

---

## Una vez al día

El sello del último parte está en:

```
~/.local/state/morning-briefing/last-run
```

Si el fichero contiene la fecha de hoy, el arranque automático sale sin
hacer nada. Por eso da igual que inicies sesión tres veces: solo habla la
primera.

**Solo el arranque automático escribe el sello.** Hablar a mano
(`morning-briefing` o `morning-briefing --now`) dice el parte, pero no
consume el saludo del día: así se puede probar el script sin que se gaste.
Para que el próximo arranque vuelva a hablar, `morning-briefing --reset`.

Si la voz falla (no hay modelo, no hay audio, piper peta), **no se sella**:
así el siguiente arranque lo vuelve a intentar. Si no hay salida de audio
en el equipo, se sella igualmente, porque no tiene sentido reintentar.

### Ficheros de estado

| Ruta | Contenido |
|---|---|
| `~/.local/state/morning-briefing/last-run` | Fecha del último parte hablado |
| `~/.local/state/morning-briefing/last.txt` | Texto del último parte |
| `~/.local/state/morning-briefing/briefing.log` | Registro de lo que pasó (se recorta solo a 400 líneas) |

---

## De dónde salen los datos

| Dato | Fuente | Notas |
|---|---|---|
| Ubicación | `wttr.in` (por IP) o `local.conf` | No versionada: `~/.config/morning-briefing/local.conf` |
| Tiempo | open-meteo | Sin clave; si falla, se intenta `wttr.in` |
| Índices | Yahoo Finance | Ibex 35, S&P 500, Dow Jones, Nasdaq y Bitcoin |
| Noticias | RSS de CNBC, Investing, BBC Business y El País | Se resumen con ollama |

El resumen de las noticias lo hace el **LLM local de ollama**
(`http://localhost:11434/api/chat`, modelo `gemma4:12b`): recibe los titulares
y devuelve un par de frases hablables. Si ollama no está o no responde, se
leen los titulares tal cual.

### Las variaciones de la bolsa

Yahoo devuelve la serie de cierres diarios y el precio actual por separado,
y no siempre cuadran (el Ibex, por ejemplo, entrega la barra del día con el
cierre a `null`). El script busca el **último cierre no nulo anterior a la
barra del precio** según su marca de tiempo, así que la variación que se
dice es siempre la de la última sesión, no la de dos sesiones.

---

## Configuración

Todo se ajusta en `~/.config/morning-briefing/config`, que el script carga
como si fuera un fragmento de shell. El fichero viene en el repo
(`files/config/morning-briefing/config`, enlazado al home) y solo lleva
ajustes que no importa que sean públicos: mercados, fuentes, tiempos.

**La ubicación va aparte**, en `~/.config/morning-briefing/local.conf`, que
no está versionado ni enlazado al repositorio (permisos `600`). El repo es
público y unas coordenadas exactas dicen dónde vives:

```bash
# ~/.config/morning-briefing/local.conf   (no versionado)

CIUDAD="tu-ciudad"       # como se dice en el parte
LAT="00.0000"            # coordenadas fijas: sin geocodificar
LON="0.00000"
```

El script lo carga justo después de `config`, así que manda sobre él. El
resto de ajustes sí vive en el repo:

```bash
# ~/.config/morning-briefing/config

DELAY=15                 # segundos de espera al arrancar
MAX_TITULARES=6          # titulares que se leen al LLM

MERCADOS=(
  "^IBEX|el Ibex 35"
  "^SPX|el S P 500"
  "^IXIC|el Nasdaq"
  "BTC-USD|el Bitcoin"
)

FUENTES=(
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664"
  "https://www.investing.com/rss/news_25.rss"
  "https://feeds.bbci.co.uk/news/business/rss.xml"
  "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada"
)
```

Si se quita `LAT` y `LON` y se deja solo `CIUDAD`, el script geocodifica el
nombre con open-meteo. Si se quita también `CIUDAD`, vuelve a detectar la
zona por IP.

También se puede cambiar con variables de entorno:

| Variable | Por defecto |
|---|---|
| `OPENCODE_VOICE_PIPER` | `~/.local/bin/piper` |
| `OPENCODE_VOICE_MODEL` | `~/.local/share/piper-voices/es_ES-davefx-medium.onnx` |
| `OPENCODE_VOICE_FFMPEG` | `ffmpeg` |
| `OPENCODE_VOICE_PLAYER` | `pw-play` |
| `OPENCODE_VOICE_LLM_URL` | `http://localhost:11434/api/chat` |
| `OPENCODE_VOICE_LLM_MODEL` | `gemma4:12b` |

---

## Dependencias

| Herramienta | Para qué |
|---|---|
| `piper` | La voz (`es_ES-davefx-medium`) |
| `ffmpeg` | La cadena de filtros (preset K2) |
| `pw-play` | La reproducción |
| `pactl` (PulseAudio o PipeWire) | Saber si hay audio y si está silenciado |
| `curl`, `jq` | Los datos |
| `python3` | El parser de los RSS (solo biblioteca estándar) |
| `notify-send` | El aviso en pantalla |
| `ollama` | El resumen de las noticias |

Si falta `piper` o `ffmpeg`, el script avisa por pantalla y no dice nada.

### Si la voz cambia en el plugin

La cadena K2 está duplicada: en el plugin, en `PRESETS.k2`
(`files/config/opencode/plugins/opencode-voice-tts/index.js`), y en el
script, en la variable `CADENA_K2`. Si se toca en el plugin, hay que
copiarla al script para que las dos voces suenen igual.
