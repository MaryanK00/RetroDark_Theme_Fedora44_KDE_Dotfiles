#!/usr/bin/env node
/**
 * Prueba de humo de la mitad TUI del plugin de voz.
 *
 * Monta un contexto falso de OpenTUI, llama a `setup()` del plugin y comprueba
 * que:
 *
 *   1. `setup()` no lanza.
 *   2. Se registra la capa de teclado (los comandos de la paleta).
 *   3. La traza no muestra ningun fallo del setup.
 *   4. El destino del dictado es la conversacion que esta en pantalla, no una
 *      anterior.
 *   5. El dictado se pega en el compositor y lo manda el TUI: el TUI es quien
 *      aplica el modo (plan/build) y el modelo que tiene elegidos el usuario,
 *      asi que es la unica forma de que el mensaje salga en el modo actual.
 *
 * Se ejecuta con un HOME de mentira, asi que no toca ni la traza real ni el
 * fichero de atajos del usuario.
 *
 *   node scripts/test-voice-tui.mjs
 */
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// El plugin lee homedir() al importarse: hay que fijarlo ANTES.
const fakeHome = mkdtempSync(join(tmpdir(), "voice-tui-test-"))
process.env.HOME = fakeHome
process.env.OPENCODE_VOICE_DEBUG = "0"

const PLUGIN = new URL("../files/config/opencode/plugins/opencode-voice-tts/tui.js", import.meta.url)

let fallos = 0
function check(nombre, ok, detalle = "") {
  if (ok) {
    console.log("  ok   " + nombre)
  } else {
    fallos++
    console.log("  FALLO " + nombre + (detalle ? "  -> " + detalle : ""))
  }
}

// ---- Contexto falso -------------------------------------------------------
const slots = []
const layers = []
const rpcCalls = []
const teclas = []
// Manejadores de los eventos RPC: el plugin se suscribe a "result",
// que es como le llega la transcripcion.
const rpcHandlers = new Map()
// Llamadas al cliente HTTP de sesiones: "create" (abrir conversacion) y
// "prompt" (mandar el texto). Se guardan para comprobar a donde va el
// dictado y con que payload.
const createCalls = []
const promptCalls = []
const navegaciones = []
// Los comandos que el plugin pide al keymap (por ejemplo "prompt.submit").
const dispatches = []
// Lo que el TUI manda cuando el plugin le dice que envie: el agente que
// tiene elegido el usuario en el compositor es lo que se aplica.
const enviosTui = []
// La ruta que ve el TUI. Cambia entre escenarios (con conversacion abierta /
// en la pantalla de inicio).
let mockRoute = { type: "session", sessionID: "ses_actual" }
// El compositor (textarea) con el foco. En el TUI de verdad es el mismo
// textarea donde se escribe a mano.
const compositor = {
  texto: "",
  traits: {},
  isDestroyed: false,
  get plainText() {
    return this.texto
  },
  gotoBufferEnd() {},
}
// El textarea que tiene el foco ahora mismo. null = el usuario no esta
// escribiendo (esta mirando la lista de conversaciones, por ejemplo).
let editorConFoco = compositor
// Si se pone, al cerrarse el dialogo el foco se va a ese textarea (como
// pasa con el textarea del propio dialogo, que se destruye al cerrarse).
let focoAlCerrarDialogo = null
// El agente (plan/build) que el usuario tiene seleccionado en el compositor.
let agenteElegido = "build"

/** Lee el log de la traza del plugin. */
async function leerTraza() {
  return (await import("node:fs/promises")).readFile(
    join(fakeHome, ".local/share/opencode/voice-tui.log"),
    "utf8",
  )
}

function fakeRpc(definition) {
  const methods = {
    level: async () => ({ level: 0, recording: false }),
    status: async () => ({ recording: false, engineLoaded: false, modelInstalled: true }),
    recordStart: async () => ({ recorder: "fake" }),
    recordStop: async () => ({ wav: "/tmp/fake.wav", seconds: 1 }),
    transcribe: async () => {},
    draftSave: async () => {},
    recordCancel: async () => {},
  }
  const proxy = {
    events: {
      on: (evento, manejador) => {
        rpcHandlers.set(evento, manejador)
        return () => {}
      },
    },
    on: () => () => {},
  }
  for (const name of Object.keys(definition.methods ?? {})) {
    proxy[name] = async (input) => {
      rpcCalls.push(name)
      return methods[name] ? await methods[name](input) : {}
    }
  }
  return proxy
}

const mock = {
  client: {
    rpc: fakeRpc,
    session: {
      // Abrir una conversacion nueva: el servidor genera el id.
      create: async (input) => {
        createCalls.push(input)
        return { id: "ses_nueva" }
      },
      // Mandar el texto a una conversacion.
      prompt: async (input) => {
        promptCalls.push(input)
        return {}
      },
    },
  },
  keymap: {
    layer: (factory) => {
      layers.push(factory())
    },
    // El plugin pide al TUI que envie el texto del compositor: el TUI aplica
    // el agente elegido y manda el mensaje.
    dispatch: (id) => {
      dispatches.push(id)
      if (id === "prompt.submit") {
        enviosTui.push({
          sessionID: mockRoute?.sessionID ?? null,
          agent: agenteElegido,
          texto: compositor.texto,
        })
        compositor.texto = ""
      }
    },
    commands: () => [],
  },
  renderer: {
    keyInput: {
      on: (_evento, manejador) => {
        teclas.push(manejador)
      },
      off: () => {},
      // Pegar en el compositor que tiene el foco.
      processPaste: (bytes) => {
        if (!editorConFoco) return
        editorConFoco.texto += new TextDecoder().decode(bytes)
      },
    },
    get currentFocusedEditor() {
      return editorConFoco
    },
    prependInputHandler: () => {},
    removeInputHandler: () => {},
  },
  storage: {
    // En un plugin local la mitad TUI no puede usar storage (el namespace
    // lleva "/" y OpenCode lo rechaza). Si el plugin lo intentara, aqui
    // reventaria, que es justo lo que queremos detectar.
    store: () => {
      throw new Error("Invalid storage segment")
    },
  },
  ui: {
    slot: (claim) => {
      slots.push(claim)
      return () => {
        claim.desregistrado = true
      }
    },
    toast: { show: () => {} },
    // El dialogo devuelve el texto tal cual: como si el usuario pulsase
    // Enter sin tocarlo.
    dialog: {
      prompt: async (opts) => {
        if (focoAlCerrarDialogo) editorConFoco = focoAlCerrarDialogo
        return opts?.value
      },
    },
    router: {
      current: () => mockRoute,
      navigate: (destino) => {
        navegaciones.push(destino)
      },
      register: () => () => {},
    },
    tabs: {
      // Las pestanas siguen apuntando a la conversacion ANTERIOR: tras un
      // /new el TUI no abre pestana nueva, asi que la activa es la vieja.
      // El plugin NO debe usarlas como destino.
      enabled: () => true,
      list: () => [
        { sessionID: "ses_activa", active: true },
        { sessionID: "ses_otra", active: false },
      ],
    },
    model: { current: () => undefined },
  },
  data: {
    session: {
      list: () => [
        { id: "ses_reciente", time: { updated: 2000 } },
        { id: "ses_antigua", time: { updated: 1000 } },
      ],
      get: () => undefined,
      sync: async () => {},
    },
    location: { default: () => ({ directory: "/tmp/opencode/prueba" }) },
  },
}

// ---- Prueba ----------------------------------------------------------------
console.log("Prueba de humo de la mitad TUI del plugin de voz")

const mod = await import(PLUGIN.href)
check("el modulo se importa", !!mod?.default?.setup)

// 1. setup no debe lanzar
let errorSetup = null
try {
  await mod.default.setup(mock)
} catch (err) {
  errorSetup = err
}
check("setup() no lanza", errorSetup === null, errorSetup ? String(errorSetup.message ?? errorSetup) : "")

// 2. capa de teclado registrada
check("se registra la capa de teclado", layers.length === 1, "capas: " + layers.length)
const cmds = layers[0]?.commands ?? []
const ids = cmds.map((c) => c.id)
check(
  "la paleta ofrece dictar / silenciar / timbre",
  ids.includes("voice-tts.dictate") && ids.includes("voice-tts.mute") && ids.includes("voice-tts.preset"),
  "ids: " + ids.join(", "),
)

// 3. la traza
const traza = await (await import("node:fs/promises")).readFile(
  join(fakeHome, ".local/share/opencode/voice-tui.log"),
  "utf8",
)
check("el setup no ha fallado", !/setup fallo/.test(traza), traza.split("\n").slice(-3).join(" | "))

const panel = slots.find((s) => s.append === "sidebar.content")
let errorRender = null
if (panel?.render) {
  try {
    panel.render({})
  } catch (err) {
    errorRender = err
  }
}
// 3b. el panel NO puede fallar en bucle.
// Con el runtime roto, el render revienta. El plugin tiene que tragarse el
// error (que no se propague) y desregistrar el slot a la tercera, o OpenCode
// repite "opencode-voice-tts/tui crashed in slot sidebar" sin parar.
process.env.OPENCODE_VOICE_TEST_BREAK_SOLID = "1"
await import(PLUGIN.href + "?roto=1")
process.env.OPENCODE_VOICE_TEST_BREAK_SOLID = "0"

const panelRoto = slots.filter((s) => s.append === "sidebar.content").pop()
let errorRoto = null
if (panelRoto?.render) {
  for (let i = 0; i < 4; i++) {
    try {
      panelRoto.render({})
    } catch (err) {
      errorRoto = err
    }
  }
}
// 3c. el dictado tiene que ir a la conversacion que esta en pantalla.
// Antes el destino era "la ultima sesion conocida" (o la pestana activa, o la
// sesion mas reciente): tras un /new todo eso es la conversacion ANTERIOR y
// el texto se iba a la ventana equivocada. Ahora el destino es la RUTA.
const atajo = teclas[0]
if (atajo) {
  atajo({ name: "space", ctrl: true, meta: false, shift: false })
  await new Promise((r) => setTimeout(r, 300))
}
const trazaDestino = await leerTraza()
const lineasDestino = trazaDestino.split("\n").filter((l) => l.includes("destino")).join(" | ")
check(
  "el dictado va a la sesion de la ruta",
  /sesion de destino: la de la ruta -> ses_actual/.test(trazaDestino),
  lineasDestino,
)
check(
  "el dictado no cae en la pestana activa",
  !/sesion de destino: pestana activa/.test(trazaDestino),
  lineasDestino,
)
check(
  "el dictado no cae en la sesion mas reciente",
  !/sesion de destino: la mas reciente/.test(trazaDestino),
  lineasDestino,
)
check(
  "el dictado no cae en la ultima sesion conocida",
  !/sesion de destino: la ultima conocida/.test(trazaDestino),
  lineasDestino,
)

// 3d. el texto se pega en el compositor y lo manda el TUI.
// El TUI es el unico que sabe que modo (plan/build) tiene elegido el
// usuario, asi que el plugin no puede mandar el mensaje por su cuenta.
const resultado = rpcHandlers.get("result")
if (resultado) {
  await resultado({ data: { text: "hola desde el dictado", take: "take-1" } })
}
check(
  "el texto se pega en el compositor",
  enviosTui.length === 1 && enviosTui[0]?.texto?.includes("hola desde el dictado"),
  JSON.stringify(enviosTui),
)
check("el plugin pide al TUI que envie", dispatches.includes("prompt.submit"), JSON.stringify(dispatches))
check(
  "lo envia el TUI con el agente elegido en el compositor",
  enviosTui[0]?.agent === agenteElegido,
  JSON.stringify(enviosTui),
)
check(
  "el plugin NO manda el mensaje por su cuenta",
  promptCalls.length === 0,
  JSON.stringify(promptCalls),
)
check(
  "no se abre ninguna conversacion nueva si ya hay una",
  createCalls.length === 0,
  JSON.stringify(createCalls),
)

// 3e. en modo shell el TUI ejecuta el texto como comando: ahi no se autoenvia.
compositor.traits = { status: "SHELL" }
const antesShell = dispatches.length
if (resultado) {
  await resultado({ data: { text: "ls -la", take: "take-shell" } })
}
check(
  "en modo shell no se autoenvia",
  dispatches.length === antesShell,
  JSON.stringify(dispatches),
)
check(
  "en modo shell el texto queda en el compositor",
  compositor.texto.includes("ls -la"),
  compositor.texto,
)

// 3f. si el compositor ya tenia texto, no se manda solo: lo revisa el usuario.
compositor.traits = {}
compositor.texto = "texto previo"
const antesConTexto = dispatches.length
if (resultado) {
  await resultado({ data: { text: "y mas cosas", take: "take-2" } })
}
check(
  "con texto previo no se autoenvia",
  dispatches.length === antesConTexto,
  JSON.stringify(dispatches),
)
check(
  "con texto previo se pega detras",
  compositor.texto.includes("texto previo") && compositor.texto.includes("y mas cosas"),
  compositor.texto,
)

// 3g. sin compositor con foco no hay modo que respetar: se manda a pelo a la
// conversacion de la pantalla.
compositor.texto = ""
editorConFoco = null
if (resultado) {
  await resultado({ data: { text: "hola sin compositor", take: "take-3" } })
}
check(
  "sin compositor el texto va a la sesion de la ruta",
  promptCalls.length === 1 && promptCalls[0]?.sessionID === "ses_actual",
  JSON.stringify(promptCalls),
)

// 3h. sin conversacion abierta (pantalla de inicio o /new) se abre una nueva.
// El /new de OpenCode 2.1.1 NO crea sesion: deja el TUI en la pantalla de
// inicio, y ahi el dictado tiene que abrir su propia conversacion.
mockRoute = { type: "home" }
if (resultado) {
  await resultado({ data: { text: "hola desde el inicio", take: "take-4" } })
}
check(
  "sin conversacion abierta se abre una",
  createCalls.length === 1,
  JSON.stringify(createCalls),
)
check(
  "la conversacion nueva se crea SIN id (lo genera el servidor)",
  createCalls.length === 1 && createCalls[0] != null && !("id" in createCalls[0]),
  JSON.stringify(createCalls),
)
check(
  "el texto va a la conversacion nueva",
  promptCalls.length === 2 && promptCalls[1]?.sessionID === "ses_nueva",
  JSON.stringify(promptCalls),
)
check(
  "el TUI navega a la conversacion nueva",
  navegaciones.some((n) => n?.type === "session" && n?.sessionID === "ses_nueva"),
  JSON.stringify(navegaciones),
)

// 3i. si al cerrarse el dialogo el foco no vuelve al compositor, el texto no
// se pega en ninguna otra parte: el textarea del dialogo se destruye al
// cerrarse y ahi el texto se perderia. Se manda a pelo.
const otro = {
  texto: "",
  traits: {},
  isDestroyed: false,
  get plainText() {
    return this.texto
  },
  gotoBufferEnd() {},
}
editorConFoco = compositor
focoAlCerrarDialogo = otro
compositor.texto = ""
const antesOtro = promptCalls.length
if (resultado) {
  await resultado({ data: { text: "hola con el foco perdido", take: "take-5" } })
}
check(
  "si el foco no vuelve al compositor no se pega en otro sitio",
  otro.texto === "" && compositor.texto === "",
  "otro: " + otro.texto + " | compositor: " + compositor.texto,
)
check(
  "si el foco no vuelve al compositor el texto se manda a pelo",
  promptCalls.length === antesOtro + 1,
  JSON.stringify(promptCalls),
)

// 4. los atajos se leen del fichero
const atajos = JSON.parse(
  await (await import("node:fs/promises")).readFile(join(fakeHome, ".local/share/opencode/voice-tts.json"), "utf8"),
)
check(
  "el fichero de atajos se crea con los valores por defecto",
  Array.isArray(atajos.dictate) && atajos.dictate.includes("ctrl+space"),
  JSON.stringify(atajos),
)

// 5. el bucle de sondeo tiene que responder el nivel
await new Promise((r) => setTimeout(r, 600))
console.log(fallos === 0 ? "\nTodo correcto." : "\n" + fallos + " comprobacion(es) fallida(s).")
process.exit(fallos === 0 ? 0 : 1)
