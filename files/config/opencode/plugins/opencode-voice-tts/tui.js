/**
 * Mitad TUI del plugin de voz.
 *
 * Se ocupa de los atajos de teclado. El motor de dictado (Whisper + microfono)
 * es de @juliuskb/opencode-voice, al que aqui se llama por su RPC "voice"
 * (captura + transcripcion local).
 *
 * POR QUE LAS TECLAS NO SE ESCUCHAN POR EL KEYMAP
 * -----------------------------------------------
 * La capa del keymap se registra bien (se ve en `keymap.commands()` y
 * `keymap.shortcuts("voice-tts.dictate")` devuelve el atajo), pero la
 * pulsacion NUNCA llega a ejecutarla: se comprobo que F9 no hacia nada
 * mientras que el mismo atajo, capturado de `renderer.keyInput`, funcionaba de
 * punta a punta. Es un fallo del reparto de teclado de OpenTUI 2.1.1, no del
 * plugin. Por eso:
 *
 *   - Las TECLAS se escuchan de `renderer.keyInput` ("keypress").
 *   - La capa del keymap se queda SOLO para la paleta de comandos, con
 *     `bind: false` en todos sus comandos (patron de OpenCode para comandos
 *     que solo se invocan desde la paleta).
 *
 * Ademas, la mitad TUI de @juliuskb esta rota: su `setup()` se queda atascado
 * en `context.ui.router.register(...)` y nunca llega a `context.keymap.layer(...)`,
 * asi que su comando `voice.record.toggle` no existe en el keymap.
 *
 * Los atajos se leen de `~/.local/share/opencode/voice-tts.json` (se crea solo
 * con los valores por defecto) y se releen cuando el fichero cambia, para
 * poder cambiar la tecla sin tocar codigo.
 *
 * Nota: `context.storage` NO se puede usar desde la mitad TUI de un plugin
 * local (el namespace deriva del ID, y el de la mitad TUI es
 * "<directorio>/tui", con barra -> "Invalid storage segment").
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const LOGFILE = join(homedir(), ".local/share/opencode/voice-tui.log")

/** Fichero de atajos, editable por el usuario. */
const SHORTCUTS_FILE = join(homedir(), ".local/share/opencode/voice-tts.json")

/**
 * Atajos por defecto.
 *
 * `dictate` admite varias teclas: las dos estan activas a la vez porque
 * `ctrl+space` suele estar asignada en KDE a "cambiar metodo de entrada" y
 * puede no llegar al terminal.
 */
const DEFAULT_SHORTCUTS = {
  dictate: ["ctrl+space", "alt+d"],
  mute: ["ctrl+alt+m"],
  preset: ["ctrl+alt+t"],
}

/** Cache de atajos: se relee solo cuando cambia el mtime del fichero. */
let shortcutsCache = null
let shortcutsMtime = 0
let shortcutsCheckedAt = 0

/**
 * Lee los atajos del fichero del usuario.
 *
 * Si el fichero no existe lo crea con los valores por defecto. Si el formato
 * es raro, se ignora lo que haya y se usan los valores por defecto: nunca
 * debe dejar al plugin sin teclas.
 */
function loadShortcuts() {
  try {
    if (!existsSync(SHORTCUTS_FILE)) {
      mkdirSync(join(homedir(), ".local/share/opencode"), { recursive: true })
      writeFileSync(SHORTCUTS_FILE, JSON.stringify(DEFAULT_SHORTCUTS, null, 2) + "\n")
      trace("atajos: fichero creado con los valores por defecto")
      shortcutsCache = DEFAULT_SHORTCUTS
      shortcutsMtime = 0
      return shortcutsCache
    }
    const mtime = statSync(SHORTCUTS_FILE).mtimeMs
    // Se comprueba como mucho dos veces por segundo: `loadShortcuts` se llama
    // en cada pulsacion de tecla y un statSync por tecla es wasteful.
    const now = Date.now()
    if (shortcutsCache && now - shortcutsCheckedAt < 500) return shortcutsCache
    if (shortcutsCache && mtime === shortcutsMtime) return shortcutsCache
    shortcutsCheckedAt = now
    const raw = JSON.parse(readFileSync(SHORTCUTS_FILE, "utf8"))
    const out = {}
    for (const [action, fallback] of Object.entries(DEFAULT_SHORTCUTS)) {
      const value = raw?.[action]
      const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : fallback
      const clean = list
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => s.length > 0)
      out[action] = clean.length > 0 ? clean : fallback
    }
    shortcutsCache = out
    shortcutsMtime = mtime
    trace("atajos cargados:", JSON.stringify(out))
    return out
  } catch (err) {
    trace("no se pudieron leer los atajos, se usan los de por defecto:", errText(err))
    return shortcutsCache ?? DEFAULT_SHORTCUTS
  }
}

function trace(...args) {
  try {
    mkdirSync(join(homedir(), ".local/share/opencode"), { recursive: true })
    appendFileSync(LOGFILE, new Date().toISOString() + " " + args.join(" ") + "\n")
  } catch {}
}

/** Identificador de esta instancia de TUI, para recibir solo nuestros eventos. */
const CLIENT_ID = "voice-tts-tui-" + Math.random().toString(36).slice(2, 10)

/**
 * Contrato RPC del plugin de dictado (id "voice"). Solo se usa el id y los
 * nombres de los metodos en tiempo de ejecucion.
 */
const VoiceRpc = {
  id: "voice",
  methods: {
    recordStart: { input: { type: "object", additionalProperties: false }, output: { type: "object", additionalProperties: false }, errors: {} },
    recordStop: { input: { type: "object", additionalProperties: false }, output: { type: "object", additionalProperties: false }, errors: {} },
    recordCancel: { input: { type: "object", additionalProperties: false }, output: { type: "object", additionalProperties: false }, errors: {} },
    transcribe: { input: { type: "object", additionalProperties: false }, output: { type: "object", additionalProperties: false }, errors: {} },
    draftSave: { input: { type: "object", additionalProperties: false }, output: { type: "object", additionalProperties: false }, errors: {} },
    draftClear: { input: { type: "object", additionalProperties: false }, output: { type: "object", additionalProperties: false }, errors: {} },
    status: { input: { type: "object", additionalProperties: false }, output: { type: "object", additionalProperties: false }, errors: {} },
    // Nivel de audio en vivo del microfono: {level: 0..1, recording: bool}.
    // Lo usa el panel lateral para dibujar el medidor mientras se graba.
    // OJO: el `output` tiene que declarar sus properties, si no el servidor
    // responde "Expected never" y la llamada falla.
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
  events: {
    result: {
      schema: {
        type: "object",
        properties: {
          client: { type: "string" },
          text: { type: "string" },
          error: { type: "string" },
          take: { type: "string" },
        },
        required: ["client"],
        additionalProperties: false,
      },
    },
    progress: {
      schema: {
        type: "object",
        properties: { client: { type: "string" }, processedSec: { type: "number" }, totalSec: { type: "number" } },
        required: ["client", "processedSec", "totalSec"],
        additionalProperties: false,
      },
    },
  },
}

/** Contrato RPC de esta misma voz (id "voice-tts"), registrado por index.js. */
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
      input: { type: "object", additionalProperties: false },
      output: {
        type: "object",
        properties: { enabled: { type: "boolean" }, preset: { type: "string" } },
        additionalProperties: false,
      },
      errors: {},
    },
    setPreset: {
      input: { type: "object", additionalProperties: false },
      output: {
        type: "object",
        properties: { enabled: { type: "boolean" }, preset: { type: "string" }, error: { type: "string" } },
        additionalProperties: false,
      },
      errors: {},
    },
  },
  events: {},
}

function errText(err) {
  if (!err) return "error desconocido"
  if (typeof err === "string") return err
  const msg = err?.message ?? err?.data?.message ?? err?.data?.error ?? ""
  return String(msg || JSON.stringify(err)).slice(0, 300)
}

/**
 * Limita la espera de una llamada RPC.
 *
 * Sin esto, si el servidor esta caido o reiniciando, la llamada se queda
 * colgada indefinidamente. En el `setup` eso congela el arranque entero del
 * TUI (en los logs sale como "plugin operation stalled ... stage=setup
 * elapsedMs=5000"), y en los atajos deja el TUI sin responder a ninguna tecla.
 */
function withTimeout(promise, ms, label) {
  let timer
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout esperando a " + label)), ms)
  })
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer))
}

async function setupInner(context) {
  trace("setup: pid", process.pid, "cliente", CLIENT_ID)

  let recording = false
  // Si esta instancia fue la que empezo a grabar, es responsable de pararla
  // al descargarse el plugin: si no, el microfono se queda abierto.
  let startedByUs = false
  let busy = false
  let lastSessionID = null
  // true mientras el borrador esta en el dialogo de revision
  let draftOpen = false

  // ---- Panel lateral en vivo ---------------------------------------------
  // Un slot en "sidebar.content" que dibuja el estado de la voz. El render
  // tiene que devolver un ELEMENTO, no texto plano: un string suelto deja un
  // nodo de texto sin padre ("Orphan text error"). Por eso se crea un <text>
  // de verdad con el runtime de Solid, que se importa por ruta absoluta desde
  // la cache de npm (un plugin local no puede resolver "@opentui/solid").
  //
  // OJO: `context.storage.store` tampoco se puede usar desde la mitad TUI de
  // un plugin local: el namespace se deriva del ID del plugin y el de la
  // mitad TUI es "<directorio>/tui", que lleva "/" -> OpenCode lo rechaza con
  // "Invalid storage segment" y ABORTA el setup (con lo que la capa de
  // teclado se queda sin registrar). Por eso el estado vive en variables.
  //
  // El panel no se dibuja en el pie de la terminal (prompt.footer.status):
  // ahi el texto plano descuadraba el ancho de la barra.

  const BARS = "\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588"
  const METER_WIDTH = 12
  let panelText = ""
  let panelSlot = null
  let fallosDeSlot = 0
  let solid = null
  let lastPhase = ""
  let levels = []
  let recStartedAt = 0
  let localPhase = "idle" // idle | transcribing
  let voiceEnabled = true
  let presetName = "k2"

  /**
   * Localiza el runtime de Solid en la cache de npm de OpenCode.
   *
   * Un plugin local no puede resolver "@opentui/solid" (no esta en su
   * node_modules), pero el TUI si lo tiene. Se importa por RUTA ABSOLUTA desde
   * la cache: es la MISMA copia que usa el plugin de Whisper, asi que el
   * contexto de Solid es el mismo y el <text> se dibuja igual.
   */
  const loadSolid = async () => {
    if (solid) return solid
    const base = join(homedir(), ".cache/opencode/npm")
    const candidatos = []
    // npm anida los paquetes con ambito:
    // <cache>/npm/@scope/<nombre>@latest/<hash>/node_modules/... -> hay que
    // buscar en profundidad; con dos niveles no se encuentra nada.
    const buscar = (dir, profundidad) => {
      if (profundidad > 4) return
      let entradas = []
      try {
        entradas = readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entrada of entradas) {
        if (!entrada.isDirectory()) continue
        const sub = join(dir, entrada.name)
        const candidato = join(sub, "node_modules/@opentui/solid/index.bun.js")
        if (existsSync(candidato)) {
          candidatos.push(candidato)
          continue
        }
        buscar(sub, profundidad + 1)
      }
    }
    try {
      buscar(base, 0)
    } catch (err) {
      trace("no se pudo leer la cache de npm:", errText(err))
    }
    // Se prefiere la copia del plugin de Whisper: es la que usa el TUI.
    candidatos.sort((a, b) => (b.includes("@juliuskb") ? 1 : 0) - (a.includes("@juliuskb") ? 1 : 0))
    // Primero el especificador tal cual: si el runtime de OpenCode lo resuelve
    // (como hace con "@opencode/plugin/tui") sale SU copia, que es la MISMA
    // instancia que usa el TUI -> el contexto de Solid es el compartido y el
    // <text> se dibuja. La copia de la cache puede ser OTRA instancia (con su
    // propio solid-js) y entonces el contexto no existe -> "No renderer found".
    for (const esp of ["@opentui/solid", ...candidatos]) {
      try {
        solid = await import(esp)
        trace("runtime de solid:", esp)
        return solid
      } catch (err) {
        trace("no se pudo cargar", esp, errText(err))
      }
    }
    // Modo de prueba: un runtime roto a proposito, para comprobar que el
    // slot no propaga el error ni lo repite en bucle.
    if (process.env.OPENCODE_VOICE_TEST_BREAK_SOLID === "1") {
      solid = {
        createComponent: () => {
          throw new Error("runtime de solid roto de prueba")
        },
        createElement: () => ({}),
        insert: () => {},
      }
      trace("runtime de solid roto de prueba")
      return solid
    }
    trace("sin runtime de solid: el panel lateral no se dibujara")
    return null
  }

  const meter = () => {
    const cells = levels.slice(-METER_WIDTH)
    let out = " ".repeat(Math.max(0, METER_WIDTH - cells.length))
    for (const v of cells) {
      const lvl = Math.round(Math.max(0, Math.min(1, v)) * (BARS.length - 1))
      out += BARS[lvl]
    }
    return out
  }


  /**
   * Pinta el panel lateral. Recibe la FASE y compone el texto aqui, para que
   * el texto exista en un solo sitio y no haya tres ternarios repetidos.
   *
   * Un slot NO admite texto plano: OpenTUI exige un elemento de verdad
   * ("Orphan text error: \"voz: k2\" must have a <text> as a parent"), asi
   * que hay que crear el <text> con el runtime de Solid. El elemento se crea
   * dentro de render (que es donde hay contexto de Solid) y se reutiliza.
   */
  const drawPanel = (fase) => {
    const texto =
      fase === "grabando"
        ? "grabando " + Math.floor((Date.now() - recStartedAt) / 1000) + "s " + meter()
        : fase === "transcribing"
          ? "transcribiendo..."
          : voiceEnabled
            ? "voz: " + presetName
            : "voz: silenciada"
    if (texto === panelText) return
    if (fase !== lastPhase) {
      lastPhase = fase
      trace("panel lateral:", fase)
    }
    panelText = texto
    trace("panel:", texto)
    try {
      if (panelSlot) {
        panelSlot()
        panelSlot = null
      }
      if (!solid) return
      // El render tiene que devolver un COMPONENTE, no un elemento: el
      // contexto de Solid solo existe dentro del arbol que dibuja OpenTUI.
      // Es el mismo patron que usa el panel del plugin de Whisper
      // (`_$createComponent(VoicePanel, {})`).
      const Panel = () => {
        const el = solid.createElement("text")
        solid.insert(el, () => panelText)
        return el
      }
      panelSlot = context.ui.slot({
        append: "sidebar.content",
        render: () => {
          try {
            return solid.createComponent(Panel, {})
          } catch (err) {
            fallosDeSlot++
            trace("el panel lateral ha fallado:", errText(err))
            // A la tercera se desregistra: si no, OpenCode repite el error en
            // bucle ("opencode-voice-tts/tui crashed in slot sidebar").
            if (fallosDeSlot >= 3 && panelSlot) {
              trace("el panel lateral se desregistra tras 3 fallos")
              panelSlot()
              panelSlot = null
            }
            return null
          }
        },
      })
    } catch (err) {
      trace("panel lateral:", errText(err))
    }
  }

  const toast = (message, variant = "info") => {
    try {
      context.ui.toast.show({ title: "Voz", message, variant, duration: 4000 })
    } catch (err) {
      trace("toast fallo:", errText(err))
    }
  }

  const voiceRpc = () => context.client.rpc(VoiceRpc)
  const ttsRpc = () => context.client.rpc(TtsRpc)

  // ---- Medidor en vivo ----------------------------------------------------
  // Pregunta al servidor cada 200 ms si el microfono esta grabando y con que
  // nivel. Asi el panel se enciende tanto si grabamos con nuestro atajo como
  // si se graba con el atajo del otro plugin (el suyo muestra su propio
  // panel, este muestra el nuestro).
  const POLL_MS = 200
  const IDLE_POLL_MS = 1000
  let pollTimer = null
  let pollBusy = false
  let serverRecording = false
  let lastPollAt = 0
  let pollErrorLogged = false

  const pollOnce = async () => {
    if (pollBusy) return
    // En reposo se pregunta menos: solo hace falta enterarse de que el
    // microfono se ha puesto a grabar por otra via.
    const ahora = Date.now()
    if (!serverRecording && ahora - lastPollAt < IDLE_POLL_MS) return
    lastPollAt = ahora
    pollBusy = true
    try {
      const r = await withTimeout(voiceRpc().level({}), 4000, "level")
      serverRecording = !!r?.recording
      if (serverRecording) {
        levels = [...levels, r.level ?? 0].slice(-METER_WIDTH)
        if (!recStartedAt) recStartedAt = Date.now()
        drawPanel("grabando")
      } else {
        levels = []
        recStartedAt = 0
        drawPanel(localPhase === "transcribing" ? "transcribing" : "idle")
      }
    } catch (err) {
      // El servidor puede estar caido: no hay que romper la TUI por eso.
      if (!pollErrorLogged) {
        pollErrorLogged = true
        trace("el medidor no pudo preguntar el nivel:", errText(err))
      }
    } finally {
      pollBusy = false
    }
  }

  const startPolling = () => {
    if (pollTimer) return
    pollTimer = setInterval(() => {
      void pollOnce()
    }, POLL_MS)
    void pollOnce()
  }

  /**
   * Suelta la custodia del audio de una transcripcion.
   *
   * El motor de Whisper guarda el audio de la ultima transcripcion y bloquea
   * el siguiente dictado hasta que el cliente confirme el borrador con
   * `draftSave({text, take})`. El `take` es el token que llega en el evento
   * `result`. Sin esta llamada, el segundo dictado falla con:
   *   "The previous take is not in a draft yet - press the restore key"
   *
   * @param {string} take  token de custodia ("" si no lo hay)
   * @param {string} text  texto final; "" si el usuario lo descarto
   */
  const releaseTake = async (take, text) => {
    if (!take) return
    try {
      await withTimeout(voiceRpc().draftSave({ text: text ?? "", take }), 15000, "draftSave")
      trace("custodia liberada:", take)
    } catch (err) {
      trace("NO se pudo liberar la custodia:", errText(err))
    }
  }

  // ---- Resultado de la transcripcion -------------------------------------
  // El servidor devuelve el texto por el evento RPC "result", no por el
  // valor de retorno de transcribe().
  try {
    const off = voiceRpc().events.on("result", async (event) => {
      const d = event?.data ?? {}
      if (d.client && d.client !== CLIENT_ID) return
      const take = typeof d.take === "string" ? d.take : ""
      trace("evento result:", d.error ? "error=" + d.error : (d.text ?? "").slice(0, 80), "| take:", take || "(ninguno)")
      localPhase = "idle"
      if (d.error) {
        toast("Transcripcion fallida: " + d.error, "error")
        return
      }
      const text = String(d.text ?? "").trim()
      if (!text) {
        // Sin texto el servidor no abre custodia, asi que no hay nada que soltar.
        toast("No se oyo nada", "warning")
        return
      }
      // Borrador editable: se abre un dialogo con el texto ya puesto.
      let final = text
      let discarded = false
      draftOpen = true
      try {
        const edited = await context.ui.dialog.prompt({
          title: "Dictado",
          description: "Revisa el texto. Enter envia, Esc descarta.",
          value: text,
        })
        if (edited === undefined) discarded = true
        else final = String(edited).trim()
      } catch (err) {
        trace("dialogo fallo, se envia el texto tal cual:", errText(err))
      } finally {
        draftOpen = false
      }
      if (!final) discarded = true

      if (!discarded) {
        const route = context.ui.router.current()
        const sessionID = route?.type === "session" ? route.sessionID : lastSessionID
        if (!sessionID) {
          toast("No hay una conversacion a la que enviarlo", "error")
        } else {
          try {
            await withTimeout(context.client.session.prompt({ sessionID, text: final }), 30000, "session.prompt")
            trace("dictado enviado:", final.length, "caracteres")
          } catch (err) {
            toast("No se pudo enviar: " + errText(err), "error")
          }
        }
      } else {
        toast("Dictado descartado", "info")
      }

      // ---- Soltar la custodia del audio (OBLIGATORIO) ----------------------
      // Tras una transcripcion con texto, el servidor guarda el audio y
      // bloquea el siguiente dictado hasta que el cliente confirme el
      // borrador con draftSave({text, take}). Si no se hace, el siguiente
      // intento falla con:
      //   "The previous take is not in a draft yet - press the restore key"
      // El texto se guarda como copia de seguridad; al descartarlo se
      // guarda vacio para que no quede nada pendiente.
      await releaseTake(take, discarded ? "" : final)
    })
    trace("escuchando el evento result")
    void off
  } catch (err) {
    trace("no se pudo suscribir al evento result:", errText(err))
  }

  // ---- Dictado: grabar / parar ------------------------------------------
  const toggleDictation = async () => {
    if (busy) return
    // Con un borrador a medio revisar, el servidor sigue guardando el audio
    // de la take anterior y rechazaria una nueva grabacion. Se espera a que
    // el usuario envie o descarte el borrador.
    if (draftOpen) {
      toast("Hay un dictado pendiente de revisar", "info")
      return
    }
    busy = true
    try {
      const route = context.ui.router.current()
      if (route?.type === "session") lastSessionID = route.sessionID

      // La verdad la tiene el servidor: si ya hay grabacion (la haya abierto
      // otra terminal) la paramos; si no, grabamos. Asi dos terminales
      // abiertas a la vez no se pisan ni desincronizan.
      const st = await withTimeout(voiceRpc().status({}), 8000, "status")
      recording = !!st?.recording

      if (!recording) {
        try {
          await withTimeout(voiceRpc().recordStart({}), 10000, "recordStart")
          startedByUs = true
        } catch (err) {
          // Puede que otra terminal lo haya empezado entre medias: eso no es
          // un fallo, es el estado real.
          if (!/already recording|already running/i.test(errText(err))) throw err
          startedByUs = false
          trace("la grabacion ya estaba en marcha")
        }
        recording = true
        trace("grabando")
        toast("Grabando... vuelve a pulsar para parar", "info")
        return
      }

      recording = false
      startedByUs = false
      const stopped = await withTimeout(voiceRpc().recordStop({}), 20000, "recordStop")
      localPhase = "transcribing"
      const wav = stopped?.wav
      const seconds = stopped?.seconds ?? 0
      trace("grabacion detenida:", seconds, "s ->", wav)
      if (!wav) {
        toast("No se grabo nada", "warning")
        return
      }
      toast("Transcribiendo...", "info")
      await withTimeout(voiceRpc().transcribe({ wav, client: CLIENT_ID }), 20000, "transcribe")
    } catch (err) {
      localPhase = "idle"
      trace("dictado fallo:", errText(err))
      toast("Dictado: " + errText(err), "error")
    } finally {
      busy = false
    }
  }

  // ---- Voz de salida: silenciar / cambiar de preset ----------------------
  const toggleVoice = async () => {
    try {
      const st = await withTimeout(ttsRpc().status({}), 8000, "voice-tts.status")
      const next = !st?.enabled
      await withTimeout(ttsRpc().setEnabled({ enabled: next }), 8000, "voice-tts.setEnabled")
      voiceEnabled = next
      drawPanel("idle")
      toast(next ? "Voz activada" : "Voz silenciada", next ? "success" : "info")
    } catch (err) {
      trace("toggle de voz fallo:", errText(err))
      toast("Voz: " + errText(err), "error")
    }
  }

  const cyclePreset = async () => {
    try {
      const st = await withTimeout(ttsRpc().status({}), 8000, "voice-tts.status")
      const presets = st?.presets ?? []
      const i = presets.indexOf(st?.preset)
      const next = presets[(i + 1) % presets.length] ?? st?.preset
      await withTimeout(ttsRpc().setPreset({ preset: next }), 8000, "voice-tts.setPreset")
      presetName = next
      drawPanel("idle")
      toast("Voz: " + next, "success")
    } catch (err) {
      trace("cambio de preset fallo:", errText(err))
      toast("Voz: " + errText(err), "error")
    }
  }

  // ---- Acciones ----------------------------------------------------------
  // Cada atajo dispara una accion. El antirrebote evita que la misma pulsacion
  // se cuente dos veces (por ejemplo si la capa del keymap y la captura
  // directa se activan a la vez).
  const recent = new Map()
  const runAction = (action) => {
    const now = Date.now()
    if (now - (recent.get(action) ?? 0) < 700) return
    recent.set(action, now)
    if (action === "dictate") return toggleDictation()
    if (action === "mute") return toggleVoice()
    return cyclePreset()
  }

  // ---- Comandos para la paleta (SIN teclas) -------------------------------
  // La capa del keymap se registra bien y sus binds se resuelven, pero la
  // pulsacion de la tecla nunca llega a ejecutar el comando (fallo del reparto
  // de teclado de OpenTUI 2.1.1). Por eso aqui NO hay atajos: todos los
  // comandos llevan `bind: false` y solo se invocan desde la paleta (ctrl+p)
  // o con su comando slash. Las teclas las lleva la captura directa de mas
  // abajo.
  context.keymap.layer(() => ({
    mode: "global",
    enabled: true,
    priority: 100,
    commands: [
      {
        id: "voice-tts.dictate",
        title: "Voz: dictar (grabar / parar)",
        group: "Voice",
        bind: false,
        palette: true,
        slash: { name: "dictar" },
        run: async () => {
          await runAction("dictate")
        },
      },
      {
        id: "voice-tts.mute",
        title: "Voz: silenciar / activar la lectura",
        group: "Voice",
        bind: false,
        palette: true,
        slash: { name: "silenciar" },
        run: async () => {
          await runAction("mute")
        },
      },
      {
        id: "voice-tts.preset",
        title: "Voz: cambiar de timbre",
        group: "Voice",
        bind: false,
        palette: true,
        run: async () => {
          await runAction("preset")
        },
      },
    ],
  }))
  trace("capa de paleta registrada (sin atajos)")

  // ---- Captura directa de teclas (camino principal) ----------------------
  // La capa del keymap se registra, sus binds se resuelven ("shortcuts" ->
  // ["f9"]) y el comando se ejecuta con dispatch(), pero la pulsacion de la
  // tecla NO llega a ejecutar la capa. Por eso aqui escuchamos el evento de
  // tecla ya parseado que emite el renderizador ("keypress") y decidimos
  // nosotros. Es el mismo evento que usa el keymap por debajo.
  //
  // El evento trae: name, ctrl, meta, option, shift, raw, sequence, source.
  let offDirect = null
  try {
    const keyInput = context.renderer?.keyInput
    if (!keyInput || typeof keyInput.on !== "function") {
      throw new Error("el renderizador no expone keyInput")
    }
    // Un atajo se escribe como "f9" o "ctrl+alt+d". Se comparan nombre y
    // modificadores por separado, porque el evento no viene en texto plano.
    const matches = (ev, spec) => {
      const parts = String(spec).split("+").map((p) => p.trim().toLowerCase())
      const key = parts.pop()
      const wantCtrl = parts.includes("ctrl") || parts.includes("control")
      const wantMeta = parts.includes("meta") || parts.includes("alt") || parts.includes("option")
      const wantShift = parts.includes("shift")
      if (!ev || String(ev.name ?? "").toLowerCase() !== key) return false
      if (!!ev.ctrl !== wantCtrl) return false
      if (!!(ev.meta || ev.option) !== wantMeta) return false
      if (wantShift && !ev.shift) return false
      return true
    }
    // Los atajos vienen del fichero del usuario. Se releen cuando cambia.
    const DEBUG = process.env.OPENCODE_VOICE_DEBUG === "1"
    let seen = 0
    const handler = (ev) => {
      const shortcuts = loadShortcuts()
      let hit = null
      for (const [action, specs] of Object.entries(shortcuts)) {
        for (const spec of specs) {
          if (!matches(ev, spec)) continue
          hit = { action, spec }
          break
        }
        if (hit) break
      }
      if (!hit) {
        // Sin modo debug solo se anotan las teclas que disparan algo.
        if (DEBUG && seen < 40) {
          seen++
          trace(
            "tecla:",
            ev?.name,
            "| ctrl=" + !!ev?.ctrl,
            "meta=" + !!ev?.meta,
            "option=" + !!ev?.option,
            "shift=" + !!ev?.shift,
            "| raw=" + JSON.stringify(ev?.raw ?? ""),
            "| seq=" + JSON.stringify(ev?.sequence ?? ""),
            "| source=" + ev?.source,
          )
        }
        return
      }
      trace("ATAJO:", hit.spec, "->", hit.action)
      void runAction(hit.action)
    }
    keyInput.on("keypress", handler)

    // ---- Captura de la secuencia cruda (solo en modo debug) ---------------
    // El renderizador reparte la entrada entre sus "sequence handlers"; si uno
    // devuelve algo truthy CONSUME la entrada y los siguientes no la ven.
    // Este devuelve undefined a proposito: solo mira, no intercepta.
    //
    // Se activa con OPENCODE_VOICE_DEBUG=1. Sirve para ver que bytes manda
    // realmente la terminal (ESC[20~ para F9, ESC[27;9u con el protocolo
    // kitty, etc.) aunque el evento parseado no llegue a dispararse.
    let rawHandler = null
    if (DEBUG) {
      let rawSeen = 0
      rawHandler = (seq) => {
        try {
          if (rawSeen < 120) {
            rawSeen++
            trace("secuencia cruda:", JSON.stringify(String(seq).slice(0, 60)))
          }
          const r = context.renderer
          if (r?._debugInputs?.length) {
            const last = r._debugInputs[r._debugInputs.length - 1]
            trace("debug input:", JSON.stringify(last).slice(0, 120))
            r._debugInputs.length = 0
          }
        } catch {}
        return undefined
      }
      try {
        context.renderer._debugModeEnabled = true
        context.renderer.prependInputHandler(rawHandler)
      } catch (err) {
        trace("no se pudo activar la captura cruda:", errText(err))
      }
    }

    offDirect = () => {
      try {
        keyInput.off("keypress", handler)
      } catch {}
      try {
        if (rawHandler) context.renderer.removeInputHandler(rawHandler)
      } catch {}
    }
    trace("captura directa ACTIVADA:", JSON.stringify(loadShortcuts()))
  } catch (err) {
    trace("captura directa NO disponible:", errText(err))
  }

  // ---- Autocomprobacion: los dos RPC desde el TUI -----------------------
  // Comprueba de punta a punta que el TUI puede hablar con el servidor:
  // el RPC "voice" (motor de dictado) y el "voice-tts" (estado de la voz).
  //
  // OJO: esto NO se espera. El `setup` debe terminar SIEMPRE de inmediato:
  // si espera al servidor y el servidor no responde (esta reiniciando, o
  // la configuracion se ha movido de sitio), el arranque del TUI se queda
  // colgado. Va en segundo plano, con limite de tiempo y reintentos: al
  // arrancar, el servidor puede tardar unos segundos en registrar sus RPC.
  const selfCheck = async () => {
    for (let intento = 1; intento <= 4; intento++) {
      if (intento > 1) await new Promise((r) => setTimeout(r, intento === 2 ? 3000 : 7000))
      try {
        const st = await withTimeout(ttsRpc().status({}), 5000, "voice-tts.status")
        trace("rpc voice-tts status:", JSON.stringify(st))
        if (st && typeof st.enabled === "boolean") voiceEnabled = st.enabled
        if (st?.preset) presetName = st.preset
        drawPanel("idle")
        try {
          const vst = await withTimeout(voiceRpc().status({}), 5000, "voice.status")
          trace("rpc voice status:", JSON.stringify(vst))
        } catch (err) {
          trace("rpc voice status fallo:", errText(err))
        }
        return
      } catch (err) {
        trace(`rpc voice-tts status fallo (intento ${intento}):`, errText(err))
      }
    }
  }
  await loadSolid()
  drawPanel("idle")
  void selfCheck()
  startPolling()

  return () => {
    try {
      offDirect?.()
    } catch {}
    // Si grabamos nosotros y nos descargamos, el microfono se queda abierto
    // para siempre en el servidor: lo paramos aqui.
    if (startedByUs) {
      startedByUs = false
      void (async () => {
        try {
          const st = await voiceRpc().status({})
          if (st?.recording) {
            await voiceRpc().recordStop({})
            trace("microfono cerrado al descargar el plugin")
          }
        } catch (err) {
          trace("no se pudo cerrar el microfono:", errText(err))
        }
      })()
    }
    try {
      if (pollTimer) clearInterval(pollTimer)
      pollTimer = null
    } catch {}
    try {
      if (panelSlot) panelSlot()
      panelSlot = null
    } catch {}
    trace("cleanup")
  }
}

trace("MODULO TUI IMPORTADO (nivel de modulo)")
export default {
  id: "opencode-voice-tts/tui",

  /**
   * El setup NUNCA debe lanzar.
   *
   * Si lanza, el plugin no carga y el TUI se queda sin sus atajos; ademas el
   * arranque se ralentiza ("plugin operation stalled"). Todo lo opcional va
   * con su propio try/catch, y esto es la ultima red de seguridad.
   */
  async setup(context) {
    try {
      return await setupInner(context)
    } catch (err) {
      trace("setup fallo:", errText(err))
      try {
        context.ui.toast.show({
          title: "Voz",
          message: "El plugin de voz no ha podido arrancar: " + errText(err),
          variant: "error",
          duration: 15000,
        })
      } catch {}
      return () => trace("cleanup")
    }
  },
}
