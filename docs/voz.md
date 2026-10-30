# Voz y dictado en OpenCode

OpenCode no trae voz propia. Este repositorio añade dos cosas sobre él:

- **Locución**: lee en alto la última respuesta del asistente cuando termina.
- **Dictado**: graba el micrófono, transcribe en local y deja el texto en un
  borrador editable antes de enviarlo.

Todo ocurre en la máquina: ni el audio ni el texto salen de ella. El único
servicio opcional es [ollama](https://ollama.com), que se usa para resumir
respuestas largas antes de leerlas.

La misma voz se reutiliza en los avisos sonoros de OpenCode y en el
[saludo matinal](parte-matinal.md).

---

## Qué piezas hay

| Pieza | Para qué | Dónde vive |
|---|---|---|
| Plugin local `opencode-voice-tts` | Locución, comandos `/voice*` y atajos de dictado | `~/.config/opencode/plugins/opencode-voice-tts/` |
| Plugin de npm `@juliuskb/opencode-voice` | Motor de dictado: captura, VAD y Whisper local | `~/.cache/opencode/npm/@juliuskb/` |
| `piper` + voz `es_ES-davefx-medium` | Síntesis de voz | `~/.local/share/piper/` y `~/.local/share/piper-voices/` |
| Modelos de Whisper y VAD | Transcripción local | `~/.local/share/opencode-voice/models/` |

El plugin local tiene dos mitades que corren en procesos distintos:

- `index.js` — lado del servidor: escucha el fin de cada respuesta, resume y
  sintetiza.
- `tui.js` — lado del terminal: escucha las teclas, abre el borrador y entrega
  el texto a la sesión que estás viendo.

Se hablan por RPC (`voice-tts` y `voice`), así que varias ventanas de OpenCode
no se pelean por el micrófono: el servidor es el único que manda.

---

## Instalación

Hace falta `ffmpeg` con `rubberband`, `loudnorm` y `deesser`, un servidor de
audio PipeWire (`pw-play`, `pw-record`) y, si quieres resúmenes, `ollama` con
algún modelo instalado.

```bash
cd ~/dotfiles
./scripts/install-voice.sh
```

El script es idempotente y hace todo esto:

1. Descarga `piper` y lo deja con su wrapper de bibliotecas.
2. Descarga la voz castellana `es_ES-davefx-medium`.
3. Descarga Whisper (por defecto `turbo`) y el detector de pausas Silero.
4. Escribe `~/.local/share/opencode-voice/settings.json` si no existe.
5. Apaga la mitad TUI del plugin ajeno (ver más abajo).
6. Termina con una prueba real de síntesis.

Opciones:

```bash
./scripts/install-voice.sh --force         # reinstala aunque ya esté
./scripts/install-voice.sh --sin-dictado   # solo la locución
ASR_NAME=small ./scripts/install-voice.sh  # otro modelo de Whisper
```

Los binarios y los modelos pesan más de un giga, así que **no se versionan**:
el script los descarga. Si ya has hecho `./install.sh`, el plugin y su
configuración ya están enlazados y no hay que hacer nada más.

### Por qué se apaga la TUI del plugin ajeno

El plugin de npm trae su propia interfaz de terminal, con sus atajos y sus
paneles; con las dos activas se graba y se transcribe dos veces. El script
sustituye `dist/tui.js` por un stub inerte y **conserva su motor de Whisper**,
que es el único que transcribe. Como OpenCode reinstala los plugins con un hash
nuevo, el parche se vuelve a aplicar en cada arranque.

---

## Uso diario

| Quiero… | Cómo |
|---|---|
| Dictar | `ctrl+space` o `alt+d`: pulsar, hablar, volver a pulsar para parar. `Enter` envía el borrador, `Esc` lo descarta |
| Silenciar o activar la lectura | `ctrl+alt+m` o `/speak` |
| Cambiar de timbre | `ctrl+alt+t` o `/voice` (`/voice e4` va directo a uno) |
| Comprobar que se oye | `/voice-test` |
| Probar el micrófono y la transcripción | `/voice-capture-test` (sin argumento graba 3 s) |
| Liberar un dictado atascado | `/voice-reset` |
| Cortar una grabación colgada | `/voice-cancel` |
| Abrir la paleta de voz | `ctrl+p` → «Voz: dictar / silenciar / cambiar de timbre» |

`ctrl+space` es el atajo principal, pero en KDE suele estar ocupado por el
cambio de método de entrada; de ahí que `alt+d` haga lo mismo.

### Timbre

El preset se cambia en caliente y se recuerda entre sesiones:

| Preset | Carácter |
|---|---|
| `k2` | metálico, grave, con eco de vocoder. Es el de por defecto |
| `e4` | robot clásico |
| `j1` | más rápido, con más presencia |
| `plain` | la voz de piper sin filtros |

Todos salen de piper y pasan por una cadena de `ffmpeg` (`aecho`,
`rubberband`, `equalizer`, `compressor`…). `k2` cierra con `loudnorm`, así que
el volumen es constante.

### Cómo se decide qué leer

1. Al terminar una respuesta, el plugin coge el último mensaje del asistente.
2. Quita el markdown: bloques de código, enlaces, tablas, URLs y emojis.
3. Si el texto limpio pasa de 300 caracteres, pide un resumen a ollama con un
   tope de 25 s (`gemma4:12b` por defecto, `temperature: 0`).
4. Si el resumen falla, recorta por frases: la voz nunca se queda muda.
5. Sintetiza con piper y reproduce con `pw-play`. Una locución cada vez, en
   cola, con un vigilante de 300 s por si el reproductor se cuelga.

Las respuestas de subagentes no se leen, solo las de la sesión principal.

---

## Configuración

| Fichero | Qué controla |
|---|---|
| `~/.local/share/opencode/voice-tts.json` | Atajos. Se relee al guardar, sin reiniciar |
| `~/.local/share/opencode-voice/settings.json` | Micrófono, modelo de Whisper, idioma, VAD |
| `~/.config/opencode/plugins/opencode-voice-tts/` | Código del plugin local (versionado) |

Atajos por defecto:

```json
{
  "dictate": ["ctrl+space", "alt+d"],
  "mute":    ["ctrl+alt+m"],
  "preset":  ["ctrl+alt+t"]
}
```

Ajustes del dictado que conviene conocer:

```json
{
  "model": "turbo",
  "language": "es",
  "device": "alsa_input.usb-...",
  "residency": "always loaded",
  "vadEnabled": true,
  "ceilingSec": 25,
  "deliveryMode": "queue"
}
```

- `model: turbo` es `large-v3` destilado y multilingüe. El modelo por defecto
  del plugin (`small.en`) solo entiende inglés.
- `device` debe coincidir con el nombre exacto que da
  `pactl list short sources`.
- `always loaded` mantiene el modelo en memoria (≈1 GB) para que el dictado
  empiece en un segundo.

Variables de entorno, todas opcionales:

| Variable | Por defecto |
|---|---|
| `OPENCODE_VOICE_PIPER` | `~/.local/bin/piper` |
| `OPENCODE_VOICE_MODEL` | `~/.local/share/piper-voices/es_ES-davefx-medium.onnx` |
| `OPENCODE_VOICE_FFMPEG` | `ffmpeg` |
| `OPENCODE_VOICE_PLAYER` | `pw-play` |
| `OPENCODE_VOICE_LLM_URL` | `http://localhost:11434/api/chat` |
| `OPENCODE_VOICE_LLM_MODEL` | `gemma4:12b` |
| `OPENCODE_VOICE_SUMMARY` | activado; `0` desactiva el resumen |
| `OPENCODE_VOICE_DEBUG` | desactivado; `1` traza teclas y secuencias |

---

## Cuando algo falla

Los dos registros que importan:

```bash
tail -f ~/.local/share/opencode/voice-tts.log   # eventos, resumen, piper
tail -f ~/.local/share/opencode/voice-tui.log   # teclas, dictado, RPC
```

| Síntoma | Causa habitual | Arreglo |
|---|---|---|
| No habla nada | La respuesta no dejó texto final, o la voz está silenciada | `/speak` y mirar `voice-tts.log` |
| Se corta a mitad | Normalmente no ocurre: el recorte es por frases | `OPENCODE_VOICE_SUMMARY=0` para saltar el resumen |
| «Already recording» | Dos instancias de `opencode` sobre la misma terminal | Cerrar la sobrante y `/voice-cancel` |
| «The previous take is not in a draft yet» | El audio no se liberó del borrador anterior | `/voice-reset` |
| Vuelve el panel del plugin ajeno | OpenCode reinstaló el plugin con otro hash | `bash scripts/patch-voice-plugin.sh` |
| Se congela al arrancar la TUI | «plugin operation stalled … stage=setup»: un RPC caído | Revisar `voice-tui.log` |
| Graba el micrófono equivocado | `device` no coincide con PipeWire | Corregir `settings.json` |
| Suena el saludo matinal pero no el TUI | Son cadenas distintas | Ver [parte-matinal.md](parte-matinal.md) |

Si el dictado llega duplicado, comprueba que no haya dos terminales con
OpenCode abierto:

```bash
ps -eo pid,ppid,tty,cmd | grep -E "opencode$" | grep -v grep
```

---

## Qué no se versiona

- Los binarios de `piper` y la voz (`~/.local/share/piper*`).
- Los modelos de Whisper y el VAD (`~/.local/share/opencode-voice/`).
- `settings.json`, `voice-tts.json` y los registros: son estado local.

Sí se versionan el código del plugin, su `package.json`, la configuración de
OpenCode y el script de instalación.

El test de humo del lado TUI, sin necesidad de micrófono:

```bash
node scripts/test-voice-tui.mjs
```
