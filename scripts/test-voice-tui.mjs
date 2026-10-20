#!/usr/bin/env node
/**
 * Prueba de humo de la mitad TUI del plugin de voz.
 *
 * Monta un contexto falso de OpenTUI, llama a `setup()` del plugin y comprueba
 * que:
 *
 *   1. `setup()` no lanza.
 *   2. Se registra la capa de teclado (los comandos de la paleta).
 *   3. Se registra el panel lateral y su texto es el esperado.
 *   4. Los atajos del fichero se leen bien.
 *
 * El punto 3 es el que habria pillado el bug de "idlePanel is not defined":
 * el error lo tragaba el `catch` del bucle de sondeo y el panel se quedaba en
 * blanco sin dar ningun error visible.
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
    events: { on: () => () => {} },
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
    session: { prompt: async () => {} },
  },
  keymap: {
    layer: (factory) => {
      layers.push(factory())
    },
  },
  renderer: {
    keyInput: { on: () => {}, off: () => {} },
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
    dialog: { prompt: async () => undefined },
    router: { current: () => ({ type: "home" }), register: () => () => {} },
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

// 3. panel lateral.
// Un slot NO admite texto plano: necesita un <text> de verdad, y eso exige el
// runtime de Solid, que en node no tiene renderer de OpenTUI. Asi que aqui se
// comprueba que el TEXTO se compone bien (traza) y que, si se ha registrado el
// slot, dibujarlo no revienta.
const traza = await (await import("node:fs/promises")).readFile(
  join(fakeHome, ".local/share/opencode/voice-tui.log"),
  "utf8",
)
check(
  'el panel compone "voz: ..."',
  /panel: voz: /.test(traza),
  traza
    .split("\n")
    .filter((l) => l.includes("panel") || l.includes("fallo"))
    .join(" | "),
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
check(
  "el panel se dibuja sin error",
  errorRender === null,
  errorRender ? String(errorRender.message ?? errorRender) : "sin slot (sin runtime de Solid)",
)

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
check(
  "el panel roto no propaga el error",
  errorRoto === null,
  errorRoto ? String(errorRoto.message ?? errorRoto) : "sin error",
)
check(
  "el panel roto se desregistra a la tercera",
  panelRoto?.desregistrado === true,
  panelRoto?.desregistrado ? "desregistrado" : "sigue registrado",
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
check("el medidor consulta el nivel al servidor", rpcCalls.includes("level"), "llamadas: " + rpcCalls.join(", "))

console.log(fallos === 0 ? "\nTodo correcto." : "\n" + fallos + " comprobacion(es) fallida(s).")
process.exit(fallos === 0 ? 0 : 1)
