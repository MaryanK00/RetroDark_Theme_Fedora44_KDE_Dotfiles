# Parte matinal con voz — manual de la función

`morning-briefing` saluda por voz la primera vez que inicias sesión en el día:
fecha, hora, el tiempo de tu ciudad, los índices y un resumen de las
noticias. Habla con la voz del preset **K2** (piper + `ffmpeg`).

No tiene nada que ver con el plugin `opencode-voice-tts`: son independientes y
solo comparten la voz. El script lleva su propia copia de la cadena de filtros.

---

## Comandos

```bash
morning-briefing             # habla ahora, sin esperar, y NO gasta el saludo del día
morning-briefing --autostart # modo del arranque de sesión: es el único que sella el día
morning-briefing --now       # habla aunque hoy ya haya hablado
morning-briefing --dry-run   # imprime el texto y no suena (para depurar)
morning-briefing --reset     # borra el sello: el próximo arranque vuelve a hablar
morning-briefing --ayuda     # resumen de las opciones
```

Está en el `PATH` (`~/.local/bin`), así que funciona desde cualquier carpeta.

---

## Mapa completo de ficheros

### En el repo (`~/dotfiles`, fuente de verdad, git)

| Ruta | Qué es |
|---|---|
| `scripts/morning-briefing` | El programa (bash, por secciones) |
| `files/config/morning-briefing/config` | La configuración |
| `files/config/autostart/morning-briefing.desktop.tmpl` | Plantilla del autostart (`__HOME__`) |
| `rendered/<hash>/.config/autostart/morning-briefing.desktop` | La plantilla ya renderizada |
| `docs/parte-matinal.md` | Documentación larga |
| `manifest.txt` | Registra los destinos (líneas del bloque `morning-briefing`) |
| `install.sh` / `restore.sh` | Instalan / quitan los enlaces (`for script in lanctl morning-briefing`) |

### En el home (enlaces al repo, no editar por otra vía)

| Ruta | Apunta a |
|---|---|
| `~/.local/bin/morning-briefing` | `scripts/morning-briefing` |
| `~/.config/morning-briefing/config` | `files/config/morning-briefing/config` |
| `~/.config/autostart/morning-briefing.desktop` | `rendered/<hash>/.config/autostart/morning-briefing.desktop` |

### Estado (datos de ejecución, NO están en git)

| Ruta | Contenido |
|---|---|
| `~/.local/state/morning-briefing/last-run` | Fecha del último parte automático (`2026-10-22`) |
| `~/.local/state/morning-briefing/last.txt` | Texto exacto del último parte |
| `~/.local/state/morning-briefing/briefing.log` | Registro; se recorta solo a 400 líneas |

El `.desktop` sí es un fichero renderizado: si se toca la plantilla hay que
volver a pasar `./install.sh`. La configuración y el script son enlaces
directos: se editan y el siguiente arranque ya los usa.

---

## Configuración: `~/.config/morning-briefing/config`

Se carga con `source` **después** de los valores por defecto del script, así
que lo que haya en el fichero manda. Solo lleva ajustes publicables: el repo
es público.

La ubicación vive fuera: `~/.config/morning-briefing/local.conf` (no
versionado, permisos `600`). El script lo carga justo después de `config`.

| Variable | Valor actual | Para qué |
|---|---|---|
| `CIUDAD` | en `local.conf` | Cómo se llama el sitio en el parte hablado |
| `LAT` / `LON` | en `local.conf` | Coordenadas fijas (la geo-IP se equivocaba) |
| `DELAY` | `15` | Segundos de espera al arrancar (audio y red) |
| `MAX_TITULARES` | `6` | Titulares que se pasan al resumen del LLM |
| `MERCADOS` | Ibex 35, S&P 500, Nasdaq, Bitcoin | Índices, con el nombre que se dice: `"^IBEX\|el Ibex 35"` |
| `FUENTES` | CNBC, Investing, BBC Business, El País | RSS de noticias, en orden de prioridad |

Si se vacían `LAT`/`LON` y se deja solo `CIUDAD`, se geocodifica con
open-meteo. Si también se vacía `CIUDAD`, se detecta la zona por IP.

Variables de entorno reconocidas: `OPENCODE_VOICE_PIPER`,
`OPENCODE_VOICE_MODEL`, `OPENCODE_VOICE_FFMPEG`, `OPENCODE_VOICE_PLAYER`,
`OPENCODE_VOICE_LLM_URL`, `OPENCODE_VOICE_LLM_MODEL`.

---

## El sello: una vez al día

`~/.local/state/morning-briefing/last-run` guarda la fecha del último parte
**automático**. Si contiene la fecha de hoy, el arranque sale en silencio.

- Solo `--autostart` escribe el sello.
- Una ejecución manual habla pero no lo gasta (así se puede probar sin perderlo).
- Si la voz falla, no se sella: el siguiente arranque lo reintenta.
- Si no hay salida de audio, se sella igual (no tiene sentido reintentar).

---

## De dónde salen los datos

| Dato | Fuente | Notas |
|---|---|---|
| Fecha y hora | Reloj local | `Europe/Madrid`, en español hablado |
| Tiempo | open-meteo | Sin clave; si falla, se intenta `wttr.in` |
| Índices | Yahoo Finance chart API | Variación contra el último cierre **no nulo** anterior |
| Noticias | RSS de CNBC, Investing, BBC, El País | Resumidas con ollama (`gemma4:12b`, `think:false`) |
| Voz | piper `es_ES-davefx-medium` | Cadena K2 en `CADENA_K2` |

Si no hay ni tiempo ni bolsa (típico al arrancar sin red), espera 30 s y
reintenta una vez; si sigue sin datos, dice solo fecha y hora.

---

## Diagnóstico rápido

| Síntoma | Qué mirar |
|---|---|
| No habló al arrancar | `cat ~/.local/state/morning-briefing/last-run` y `tail -20 …/briefing.log` |
| El log dice "ya se hablo hoy" | `morning-briefing --reset` o `morning-briefing --now` |
| El log no tiene ni una línea de ese arranque | El `.desktop` no se ejecutó: `ls -l ~/.config/autostart/morning-briefing.desktop` |
| "sin salida de audio" | `pactl info`, sink y mute |
| "piper no encontrado" / falla el modelo | `~/.local/bin/piper` y `~/.local/share/piper-voices/es_ES-davefx-medium.onnx` |
| Sin tiempo ni bolsa | Red/DNS al arrancar; sube `DELAY` |
| Noticias pobres o en inglés | `systemctl status ollama`; si está parado se leen los titulares tal cual |
| Habla demasiado tarde | Bajar `DELAY` (por debajo de ~8 s se arriesga a no tener red) |
| Quiero oírlo sin esperar al arranque | `morning-briefing --dry-run` (texto) / `morning-briefing` (voz) |

---

## Si cambia la voz en el plugin

La cadena K2 está duplicada a propósito:

- en el plugin: `PRESETS.k2` de `files/config/opencode/plugins/opencode-voice-tts/index.js`;
- en el script: variable `CADENA_K2` de `scripts/morning-briefing`.

Si se toca en uno, hay que copiarla al otro para que las dos voces suenen igual.
