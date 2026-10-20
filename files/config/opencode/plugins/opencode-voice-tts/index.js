/**
 * opencode-voice-tts
 *
 * Sintetiza en voz las respuestas del asistente usando piper + ffmpeg + pw-play.
 * Todo el proceso es local: no sale audio ni texto a ningun servicio externo.
 *
 * - Escucha `session.execution.succeeded` y habla el ultimo mensaje del asistente.
 * - Comandos: /speak (toggle), /voice (cambia de preset), /voice-test (prueba).
 *
 * Nota: los plugins de OpenCode corren sobre Bun, asi que este archivo solo
 * puede usar builtins de Node. No hay dependencias externas.
 */

import { spawn } from "node:child_process"
import { appendFileSync, mkdirSync } from "node:fs"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

const HOME = homedir()

/** Log de traza: el `console.log` del plugin no aparece en el log de opencode. */
const LOGFILE = join(HOME, ".local/share/opencode/voice-tts.log")
function trace(...args) {
  try {
    mkdirSync(join(HOME, ".local/share/opencode"), { recursive: true })
    appendFileSync(LOGFILE, new Date().toISOString() + " " + args.join(" ") + "\n")
  } catch {}
}

const PIPER = process.env.OPENCODE_VOICE_PIPER || join(HOME, ".local/bin/piper")
const MODEL = process.env.OPENCODE_VOICE_MODEL || join(HOME, ".local/share/piper-voices/es_ES-davefx-medium.onnx")
const FFMPEG = process.env.OPENCODE_VOICE_FFMPEG || "ffmpeg"
const PLAYER = process.env.OPENCODE_VOICE_PLAYER || "pw-play"

/**
 * Cadenas de filtros de ffmpeg. La base de voz es piper es_ES-davefx-medium (castellano).
 *
 * La ultima cadena `alimiter=limit=0.98:level=false` es un guardarrail de pico:
 * los limiters de la propia cadena actuan ANTES del `volume`, asi que la suma
 * puede pasar de 1.0 y recortar muestras. Con una entrada fuerte la cadena sin
 * ese filtro recortaba 19 muestras; con el, ninguna y el nivel medio no cambia.
 */
const GUARD = "alimiter=limit=0.98:level=false"

const PRESETS = {
  // K2 WhatIf: metalico, graves, con eco de vocoder. La elegida.
  k2: "rubberband=tempo=0.95:pitch=0.78:formant=preserved,aecho=0.9:0.65:22|44|70:0.42|0.3|0.2,equalizer=f=220:g=5,equalizer=f=900:g=5,equalizer=f=2400:g=5,equalizer=f=4200:g=3,lowpass=f=5200,tremolo=f=7:d=0.12,acompressor=threshold=-18dB:ratio=6,alimiter=limit=0.7,volume=1.7," + GUARD,
  // E4 robot clasico.
  e4: "rubberband=pitch=0.93:formant=preserved,aecho=0.9:0.55:18|36:0.45|0.3,equalizer=f=250:g=4,equalizer=f=900:g=5,equalizer=f=2200:g=4,equalizer=f=4000:g=2,lowpass=f=5200,acompressor=threshold=-18dB:ratio=5,alimiter=limit=0.9,volume=1.5," + GUARD,
  // J1 colega: mas rapido, mas presencia.
  j1: "rubberband=tempo=1.08:pitch=0.97:formant=preserved,aecho=0.9:0.5:16|32:0.4|0.25,equalizer=f=250:g=4,equalizer=f=900:g=5,equalizer=f=2200:g=4,equalizer=f=3200:g=4,lowpass=f=5600,acompressor=threshold=-12dB:ratio=3,alimiter=limit=0.9,volume=1.5," + GUARD,
  // Sin filtros: la voz tal cual sale de piper.
  plain: null,
}

const PRESET_ORDER = ["k2", "e4", "j1", "plain"]
const PRESET_LABEL = {
  k2: "K2 WhatIf, metalico",
  e4: "E4 robot clasico",
  j1: "J1 rapido y con presencia",
  plain: "voz sin filtros",
}

/**
 * Locucion resumida: la voz dice lo relevante, no el texto entero.
 *
 * - Por debajo de SUMMARY_THRESHOLD se dice tal cual (no hay nada que resumir
 *   y asi la respuesta es instantanea).
 * - Por encima, se pide un resumen al LLM local de ollama. Si no hay LLM, o
 *   falla, o tarda demasiado, se recurre al recorte por frases.
 */
const LLM_URL = process.env.OPENCODE_VOICE_LLM_URL || "http://localhost:11434/api/chat"
const LLM_MODEL = process.env.OPENCODE_VOICE_LLM_MODEL || "gemma4:12b"
const USE_SUMMARY = process.env.OPENCODE_VOICE_SUMMARY !== "0"
const SUMMARY_THRESHOLD = 300
const SUMMARY_TIMEOUT = 25000
/** Tope duro de la locucion. El recorte se hace SIEMPRE en frontera de frase. */
const MAX_CHARS = 900

const KEY_ENABLED = "voice-tts.enabled"
const KEY_PRESET = "voice-tts.preset"

/**
 * Limita la espera de una operacion.
 *
 * El `setup` de un plugin se espera al arrancar el servicio: si se queda
 * colgado, el plugin no llega a activarse y OpenCode avisa con "plugin
 * operation stalled ... stage=setup".
 */
function withTimeout(promise, ms, label) {
  let timer
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout esperando a " + label)), ms)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

/**
 * Contrato RPC de la voz (mitad servidor -> mitad TUI).
 *
 * El runtime solo necesita `id` y los nombres de los metodos; los esquemas
 * `input`/`output` se usan para el tipado del cliente.
 */
const TtsRpc = {
  id: "voice-tts",
  methods: {
    status: {
      input: { type: "object", additionalProperties: false },
      output: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          preset: { type: "string" },
          presetLabel: { type: "string" },
          presets: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
      errors: {},
    },
    setEnabled: {
      input: {
        type: "object",
        properties: { enabled: { type: "boolean" } },
        required: ["enabled"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: { enabled: { type: "boolean" }, preset: { type: "string" } },
        additionalProperties: false,
      },
      errors: {},
    },
    setPreset: {
      input: {
        type: "object",
        properties: { preset: { type: "string" } },
        required: ["preset"],
        additionalProperties: false,
      },
      output: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          preset: { type: "string" },
          error: { type: "string" },
        },
        additionalProperties: false,
      },
      errors: {},
    },
  },
  events: {},
}

/**
 * Estado compartido entre instancias.
 *
 * OpenCode puede cargar el mismo plugin mas de una vez en el mismo proceso
 * (la reconciliacion de plugins y el watcher de ficheros lo hacen por separado).
 * Cada carga crea su propio modulo, asi que un `let` a nivel de modulo no
 * basta: hace falta un unico objeto en `globalThis`. Ademas, cuando se
 * recarga la configuracion la instancia vieja puede quedarse viva, asi que la
 * instancia mas reciente se queda con el "turno" (`owner`) y la anterior lo
 * comprueba en cada evento y se apaga si ya no le toca.
 */
const GLOBAL = Symbol.for("opencode-voice-tts")
const g = (globalThis[GLOBAL] ??= {})
// OJO: no vale `??= { ... }` con el objeto entero. El objeto vive en
// globalThis, asi que sobrevive a las recargas del plugin; si una version
// anterior ya lo creo, `??=` no lo reemplazaria y los campos nuevos
// (queue, speaking...) se quedarian sin definir -> errores silenciosos.
g.owner ??= { token: null, at: 0 }
g.state ??= { enabled: true, preset: "k2" }
g.queue ??= []
g.speaking ??= false
g.speakingAt ??= 0
g.said ??= new Map()

/**
 * Encola una locucion. Una a la vez, pero con una cola propia en vez de una
 * cadena de promesas: si una locucion se cuelga, la promesa quedaria pendiente
 * y bloquearia todas las siguientes. Aqui, cada `speak` tiene su propio
 * timeout, asi que la cola siempre avanza.
 */
function enqueue(text, preset) {
  g.queue.push({ text, preset })
  // Si alguien se quedo hablando hace mucho, se le da por colgado y se
  // desbloquea la cola (su `speak` tiene timeout, asi que ya no va a volver).
  // El margen es amplio porque una locucion puede tardar: resumen con el LLM
  // (25 s) + piper (180 s) + ffmpeg (60 s).
  if (g.speaking && Date.now() - g.speakingAt > 300000) {
    trace("la locucion anterior se quedo colgada: libero la cola")
    g.speaking = false
  }
  if (g.speaking) return Promise.resolve(false)
  g.speaking = true
  g.speakingAt = Date.now()
  ;(async () => {
    try {
      while (g.queue.length > 0) {
        const item = g.queue.shift()
        try {
          await speak(item.text, item.preset)
        } catch (err) {
          trace("error al hablar:", err?.message ?? err)
        }
        g.speakingAt = Date.now()
      }
    } catch (err) {
      trace("la cola de voz ha fallado:", err?.message ?? err)
    } finally {
      g.speaking = false
    }
  })()
  return Promise.resolve(false)
}

/**
 * Ejecuta un comando y devuelve stdout como Buffer.
 */
function run(cmd, args, input, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] })
    const chunks = []
    let stderr = ""
    let settled = false
    // Ningun subproceso puede colgarse para siempre: si lo hace, la cola de
    // locucion se quedaria bloqueada y el plugin callaria.
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill("SIGKILL")
      } catch {}
      reject(new Error(`${cmd} no termino en ${timeoutMs} ms (se le ha matado)`))
    }, timeoutMs)
    child.stdout.on("data", (d) => chunks.push(d))
    child.stderr.on("data", (d) => (stderr += d.toString()))
    child.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`${cmd} salio con codigo ${code}: ${stderr.slice(-400)}`))
        return
      }
      resolve(Buffer.concat(chunks))
    })
    child.stdin.on("error", () => {})
    if (input === undefined) child.stdin.end()
    else child.stdin.end(input)
  })
}

/**
 * Convierte markdown a texto hablable.
 */
function mdToSpeech(md) {
  let t = md

  t = t.replace(/```[\s\S]*?```/g, " (bloque de codigo) ")
  t = t.replace(/~~~[\s\S]*?~~~/g, " (bloque de codigo) ")
  t = t.replace(/`([^`]+)`/g, "$1")
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  t = t.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")

  t = t.replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1")
  t = t.replace(/\*([^*\n]+)\*/g, "$1")
  t = t.replace(/__([^_]+)__/g, "$1")
  t = t.replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:!?])/g, "$1$2")

  t = t.replace(/^\s{0,3}#{1,6}\s*/gm, "")
  t = t.replace(/^\s{0,3}>\s?/gm, "")
  t = t.replace(/^\s*[-*+]\s+/gm, "")
  t = t.replace(/^\s*\d+[.)]\s+/gm, "")
  t = t.replace(/^\s*([-*_])\s*\1\s*\1[\s\S]*$/gm, "")

  // Tablas y separadores: se pierden.
  t = t
    .split("\n")
    .filter((line) => !/^\s*\|/.test(line))
    .join("\n")

  t = t.replace(/<\/?[a-zA-Z][^>]*>/g, " ")
  t = t.replace(/https?:\/\/\S+/g, " ")
  t = t.replace(/&[a-z]+;/gi, " ")

  // Emoji y simbolos que piper leeria en voz alta o saltaria.
  t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")

  t = t.replace(/[ \t]+/g, " ")
  t = t.replace(/\n{3,}/g, "\n\n")
  return t.trim()
}

/**
 * Recorta un texto SIN cortarlo a mitad de frase.
 *
 * Antes esto era un `slice(0, MAX_CHARS)` a pelo: si la respuesta era larga
 * la voz se callaba a mitad de una frase y encima le colgaba un "..." al
 * final. Ahora se busca la ultima frase completa antes del limite.
 */
function clipAtSentence(text, max) {
  if (!text || text.length <= max) return text
  const head = text.slice(0, max)
  // Ultimo final de frase antes del limite.
  const re = /[.!?…]["')\]]?(\s|$)/g
  let last = null
  let m
  while ((m = re.exec(head)) !== null) last = m
  if (last && last.index > 80) {
    return head.slice(0, last.index + last[0].length).trim()
  }
  // No hay ninguna frase completa: se corta por palabra y se marca el corte.
  const cut = head.replace(/\s+\S*$/, "").trim()
  return (cut || head.trim()) + "…"
}

/**
 * Si el texto no termina en frase completa, descarta la ultima parte.
 * El LLM puede agotar `num_predict` y devolver una frase a medias.
 */
function ensureEndsClean(text) {
  const t = String(text ?? "").trim()
  if (!t) return t
  if (/[.!?…:;"')\]]$/.test(t)) return t
  const re = /[.!?…]["')\]]?(\s|$)/g
  let last = null
  let m
  while ((m = re.exec(t)) !== null) last = m
  if (last) return t.slice(0, last.index + last[0].length).trim()
  return t
}

/**
 * Resume el texto con el LLM local de ollama.
 *
 * OJO con el endpoint: hay que usar el NATIVO `/api/chat`. El compatible
 * `/v1/chat/completions` IGNORA el parametro `think`, y sin `think: false`
 * el modelo se pasa medio minuto razonando y devuelve 1000 tokens de mas.
 *
 * Devuelve null si no se pudo resumir (el llamante recurre al recorte).
 */
async function summarize(text) {
  if (!USE_SUMMARY) return null
  if (!text || text.length <= SUMMARY_THRESHOLD) return null
  const prompt =
    "Resume este texto en una o dos frases breves con lo mas importante. " +
    "Sin explicaciones, sin listas, sin encabezados, sin comillas, sin repetir el original. " +
    "Responde solo con el resumen en español."
  try {
    const res = await fetch(LLM_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: text.slice(0, 4000) },
        ],
        stream: false,
        think: false,
        options: { temperature: 0, num_predict: 200 },
      }),
      signal: AbortSignal.timeout(SUMMARY_TIMEOUT),
    })
    if (!res.ok) {
      trace("resumen: HTTP", res.status)
      return null
    }
    const data = await res.json()
    const out = ensureEndsClean(String(data?.message?.content ?? "").trim())
    if (!out) {
      trace("resumen: vacio")
      return null
    }
    return out
  } catch (err) {
    trace("resumen fallo:", err?.message ?? err)
    return null
  }
}

/**
 * Sintetiza y reproduce un texto.
 */
async function speak(text, presetName) {
  g.speakingAt = Date.now()
  const spoken = mdToSpeech(text)
  if (!spoken) {
    trace("speak: texto vacio tras mdToSpeech")
    return false
  }

  // La voz dice lo relevante, no el texto entero.
  let body = spoken
  if (spoken.length > SUMMARY_THRESHOLD) {
    const resumen = await summarize(spoken)
    g.speakingAt = Date.now()
    if (resumen) {
      body = mdToSpeech(resumen) || resumen
      trace(`speak: resumen de ${spoken.length} a ${body.length} caracteres`)
    } else {
      trace("speak: sin resumen, recorto por frases")
    }
  }
  // Guardarrail final: nunca a mitad de frase.
  body = clipAtSentence(body, MAX_CHARS)

  const dir = join(tmpdir(), "opencode-voice-tts")
  await mkdir(dir, { recursive: true })
  // Nombre unico por locucion: dos voces simultaneas no se pisan.
  const tag = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const raw = join(dir, `voice-${tag}.raw`)
  const wav = join(dir, `voice-${tag}.wav`)

  try {
    trace("speak: piper ->", body.length, "caracteres, preset", presetName)
    const pcm = await run(PIPER, ["-m", MODEL, "--output_raw"], body + "\n", 180000)
    if (!pcm || pcm.length === 0) {
      trace("speak: piper devolvio 0 bytes")
      return false
    }
    await writeFile(raw, pcm)

    const filter = PRESETS[presetName]
    const args = ["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", "22050", "-ac", "1", "-i", raw]
    if (filter) args.push("-af", filter)
    args.push("-ar", "22050", "-ac", "1", wav)
    await run(FFMPEG, args, undefined, 60000)

    // El reproductor no puede quedarse colgado esperando: el margen es la
    // duracion del audio mas 15 s de sobra.
    const seconds = pcm.length / 2 / 22050
    trace("speak: reproduciendo", wav, `(${(seconds).toFixed(1)}s)`)
    await run(PLAYER, [wav], undefined, Math.ceil(seconds * 1000) + 15000)
    trace("speak: terminado")
    return true
  } finally {
    await rm(raw, { force: true })
    await rm(wav, { force: true })
  }
}

/**
 * Extrae el texto del ultimo mensaje del asistente.
 */
function extractText(message) {
  if (!message || message.type !== "assistant") return ""
  const content = message.content
  if (!Array.isArray(content)) return ""
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join(" ")
    .trim()
}

export const OpencodeVoiceTTS = {
  id: "opencode-voice-tts",

  async setup(ctx) {
    // Esta instancia se queda con el "turno": si OpenCode carga el plugin otra
    // vez (por ejemplo al recargar la configuracion), la anterior se apaga.
    const token = Symbol("voice-tts-instance")
    g.owner = { token, at: Date.now() }
    trace("setup: soy la instancia activa")

    // Estado persistente.
    try {
      const savedEnabled = await ctx.storage.get(KEY_ENABLED)
      if (typeof savedEnabled === "boolean") g.state.enabled = savedEnabled
      const savedPreset = await ctx.storage.get(KEY_PRESET)
      if (typeof savedPreset === "string" && PRESETS[savedPreset] !== undefined) g.state.preset = savedPreset
    } catch (err) {
      console.log("[voice-tts] no se pudo leer el estado guardado:", err?.message ?? err)
    }
    trace(`setup: enabled=${g.state.enabled} preset=${g.state.preset} piper=${PIPER} modelo=${MODEL}`)

    // Feedback de los comandos.
    //
    // OJO: NO se usa ctx.session.synthetic(). Esa API no es un canal de
    // feedback: inyecta un mensaje en la sesion y el MODELO lo responde. Como
    // el TTS lee el ultimo mensaje del asistente, la voz leia en voz alta la
    // respuesta del modelo a nuestro propio mensaje de confirmacion.
    // El aviso se hace por audio (que es justo lo que el usuario quiere
    // comprobar) y se deja en la traza para el log.
    const say = async (_sessionID, text) => {
      trace("aviso:", text)
    }

    // Comandos.
    await ctx.command.transform((editor) => {
      editor.add({
        name: "speak",
        description: "Activa o desactiva la voz de las respuestas",
        execute: async (input) => {
          g.state.enabled = !g.state.enabled
          try {
            await ctx.storage.set(KEY_ENABLED, g.state.enabled)
          } catch {}
          const msg = g.state.enabled ? "Voz activada." : "Voz silenciada."
          trace("comando /speak ->", msg)
          await say(input.sessionID, msg)
          // Si la acabamos de activar, que se oiga: asi se confirma que hay audio.
          if (g.state.enabled) await enqueue(msg, g.state.preset)
        },
      })

      editor.add({
        name: "voice",
        description: "Cambia el preset de voz: k2, e4, j1, plain",
        execute: async (input) => {
          const explicit = String(input.prompt?.text ?? "").trim().toLowerCase()
          if (explicit && PRESETS[explicit] !== undefined) {
            g.state.preset = explicit
          } else {
            const idx = PRESET_ORDER.indexOf(g.state.preset)
            g.state.preset = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length]
          }
          try {
            await ctx.storage.set(KEY_PRESET, g.state.preset)
          } catch {}
          const msg = `Voz: ${PRESET_LABEL[g.state.preset]}.`
          trace("comando /voice ->", g.state.preset)
          await say(input.sessionID, msg)
          await enqueue(msg, g.state.preset)
        },
      })

      editor.add({
        name: "voice-test",
        description: "Reproduce una frase de prueba con la voz actual",
        execute: async (input) => {
          const msg = "Prueba de voz. Si me oyes, todo funciona."
          trace("comando /voice-test ->", g.state.preset)
          await say(input.sessionID, msg)
          await enqueue(msg, g.state.preset)
        },
      })

      // Diagnostico: comprueba el microfono y el motor de dictado sin
      // necesidad de pulsar ninguna tecla. Con una ruta de audio transcribe
      // ese fichero; sin ella, graba 3 segundos del microfono.
      editor.add({
        name: "voice-capture-test",
        description: "Prueba del microfono y de la transcripcion (diagnostico)",
        execute: async (input) => {
          const VoiceRpc = {
            id: "voice",
            methods: {
              recordStart: { input: { type: "object", additionalProperties: false } },
              recordStop: { input: { type: "object", additionalProperties: false } },
              transcribe: { input: { type: "object", additionalProperties: false } },
              draftSave: { input: { type: "object", additionalProperties: false } },
              level: {
                input: { type: "object", additionalProperties: false },
                output: {
                  type: "object",
                  properties: { level: { type: "number" }, recording: { type: "boolean" } },
                  required: ["level", "recording"],
                  additionalProperties: false,
                },
                errors: {},
              },
            },
            events: { result: {} },
          }
          try {
            const off = ctx.rpc(VoiceRpc).events.on("result", (ev) => {
              const d = ev?.data ?? {}
              trace("capture test: resultado ->", JSON.stringify(d).slice(0, 400))
              // Suelta la custodia del audio: si no, el siguiente dictado
              // queda bloqueado con "the previous take is not in a draft yet".
              const take = typeof d.take === "string" ? d.take : ""
              if (take) {
                ctx.rpc(VoiceRpc)
                  .draftSave({ text: String(d.text ?? ""), take })
                  .then(() => trace("capture test: custodia liberada"))
                  .catch((e) => trace("capture test: no se pudo liberar la custodia:", e?.message ?? e))
              }
            })
            // Si se pasa una ruta, se transcribe esa; si no, se graba el micro.
            const given = String(input?.prompt?.text ?? "").trim()
            let wavToTranscribe = given
            if (!wavToTranscribe) {
              trace("capture test: grabando...")
              const start = await withTimeout(ctx.rpc(VoiceRpc).recordStart({}), 10000, "recordStart")
              trace("capture test: grabador", JSON.stringify(start))
              // Mientras graba, el nivel de audio en vivo (lo usa el panel lateral).
              for (let i = 0; i < 5; i++) {
                await new Promise((r) => setTimeout(r, 500))
                try {
                  const lv = await withTimeout(ctx.rpc(VoiceRpc).level({}), 5000, "level")
                  trace("capture test: nivel ->", JSON.stringify(lv))
                } catch (e) {
                  trace("capture test: nivel fallo ->", e?.message ?? e)
                }
              }
              const stop = await withTimeout(ctx.rpc(VoiceRpc).recordStop({}), 20000, "recordStop")
              trace("capture test: OK ->", JSON.stringify(stop))
              wavToTranscribe = stop.wav
            }
            trace("capture test: transcribiendo", wavToTranscribe)
            await withTimeout(ctx.rpc(VoiceRpc).transcribe({ wav: wavToTranscribe, client: "test-capture" }), 20000, "transcribe")
            trace("capture test: transcribe() devuelto")
            await new Promise((r) => setTimeout(r, 15000))
            off?.()
          } catch (err) {
            trace("capture test: FALLO ->", err?.message ?? String(err))
          }
        },
      })

      // Libera un dictado atascado.
      //
      // El motor de Whisper guarda el audio de la ultima transcripcion y
      // bloquea el siguiente dictado hasta que el cliente confirme el
      // borrador (draftSave con el token "take"). Si esa confirmacion se
      // pierde (el TUI se reinicio, el dialogo se cerro de golpe...), el
      // dictado queda atascado con:
      //   "The previous take is not in a draft yet - press the restore key"
      //
      // El token solo vive en memoria del servidor, asi que la unica forma de
      // liberarlo sin el es desactivar la red de seguridad y volver a
      // activarla: al desactivarla el servidor suelta la custodia.
      editor.add({
        name: "voice-reset",
        description: "Libera un dictado atascado (resetea la custodia del audio)",
        execute: async (input) => {
          const VoiceRpc = {
            id: "voice",
            methods: {
              settingsSet: { input: { type: "object", additionalProperties: false } },
            },
            events: {},
          }
          try {
            await withTimeout(
              ctx.rpc(VoiceRpc).settingsSet({ json: JSON.stringify({ safetyNet: false }) }),
              10000,
              "settingsSet",
            )
            await withTimeout(
              ctx.rpc(VoiceRpc).settingsSet({ json: JSON.stringify({ safetyNet: true }) }),
              10000,
              "settingsSet",
            )
            trace("comando /voice-reset -> custodia liberada")
            await say(input.sessionID, "Voz reseteada. Ya puedes dictar.")
          } catch (err) {
            trace("comando /voice-reset -> FALLO:", err?.message ?? String(err))
          }
        },
      })
    })

    // Escucha de fin de ejecucion.
    const controller = new AbortController()
    ;(async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (!event) continue
          if (event.type !== "session.execution.succeeded") continue
          // Relevo: solo una instancia habla. Si la que tiene el turno deja de
          // dar señales, otra lo recoge para que la voz no se apague sola.
          const now = Date.now()
          if (g.owner.token !== token) {
            if (now - g.owner.at < 15000) {
              trace("otra instancia tiene el turno: esta se calla")
              continue
            }
            g.owner = { token, at: now }
            trace("tomo el relevo (la otra instancia no daba señales)")
          }
          g.owner.at = now
          const sessionID = event.data?.sessionID
          trace("evento session.execution.succeeded, sessionID:", sessionID)
          if (!sessionID) continue
          if (!g.state.enabled) {
            trace("skip: voz silenciada")
            continue
          }

          // Las sesiones hijas (subagentes) no se verbalizan.
          try {
            const session = await ctx.session.get({ sessionID })
            trace("sesion:", JSON.stringify({ id: session?.id, parentID: session?.parentID }))
            if (session && session.parentID) {
              trace("skip: sesion hija")
              continue
            }
          } catch (err) {
            trace("no se pudo leer la sesion:", err?.message ?? err)
          }

          let text = ""
          let messageID = ""
          try {
            const messages = await ctx.session.context({ sessionID })
            trace("mensajes en el contexto:", Array.isArray(messages) ? messages.length : "no-array")
            // El ultimo mensaje del contexto suele ser de tipo "idle": hay que
            // buscar hacia atras el ultimo mensaje real del asistente.
            for (let i = messages.length - 1; i >= 0; i--) {
              const msg = messages[i]
              if (msg?.type !== "assistant") continue
              text = extractText(msg)
              messageID = msg.id ?? ""
              trace("mensaje del asistente encontrado, texto:", text.length, "caracteres")
              break
            }
          } catch (err) {
            trace("no se pudo leer el contexto:", err?.message ?? err)
          }
          if (!text) {
            trace("skip: sin texto")
            continue
          }

          // Deduplicacion: el mismo mensaje no se habla dos veces, aunque
          // llegue por dos caminos o haya dos instancias vivas.
          const key = sessionID + ":" + messageID
          if (messageID && g.said.has(key)) {
            trace("skip: ese mensaje ya se ha hablado")
            continue
          }
          if (messageID) g.said.set(key, Date.now())
          for (const [k, t] of g.said) if (Date.now() - t > 300000) g.said.delete(k)

          const preset = g.state.preset
          await enqueue(text, preset)
        }
      } catch (err) {
        if (err?.name !== "AbortError") {
          trace("el listener de eventos termino:", err?.message ?? err)
        }
      }
    })()

    console.log(`[voice-tts] listo. Preset: ${PRESET_LABEL[g.state.preset]}. Voz ${g.state.enabled ? "activada" : "silenciada"}.`)

    // RPC propio para que la mitad TUI (que corre en otro proceso) pueda
    // consultar y cambiar el estado de la voz sin pasar por la sesion.
    try {
      await withTimeout(
        ctx.rpc.register(TtsRpc, {
          status: async () => ({
            enabled: g.state.enabled,
            preset: g.state.preset,
            presetLabel: PRESET_LABEL[g.state.preset],
            presets: PRESET_ORDER,
          }),
          setEnabled: async (input) => {
            g.state.enabled = !!input?.enabled
            try {
              await ctx.storage.set(KEY_ENABLED, g.state.enabled)
            } catch {}
            trace("rpc setEnabled ->", g.state.enabled)
            return { enabled: g.state.enabled, preset: g.state.preset }
          },
          setPreset: async (input) => {
            const p = String(input?.preset ?? "")
            if (PRESETS[p] === undefined) return { enabled: g.state.enabled, preset: g.state.preset, error: "preset desconocido: " + p }
            g.state.preset = p
            try {
              await ctx.storage.set(KEY_PRESET, p)
            } catch {}
            trace("rpc setPreset ->", p)
            return { enabled: g.state.enabled, preset: p }
          },
        }),
        10000,
        "rpc.register",
      )
      trace("rpc voice-tts registrado")
    } catch (err) {
      trace("no se pudo registrar el rpc voice-tts:", err?.message ?? err)
    }

    return () => {
      controller.abort()
      if (g.owner.token === token) g.owner = { token: null, at: 0 }
    }
  },
}

export default OpencodeVoiceTTS
