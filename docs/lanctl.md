# `lanctl` — control de dispositivos de la red local

`lanctl` es una CLI propia (Python 3, **solo biblioteca estándar**) para
manejar los dispositivos concretos de la red wifi desde este equipo:
la TV Hisense, el Fire TV Stick, el iPhone y —si algún día hay
credenciales— el router.

No depende del router, no necesita `root`, no instala daemons y no toca
la configuración del sistema: es un script declarativo que vive en este
repositorio.

```
lanctl <comando> [opciones]
```

> **¿Solo quieres la lista de comandos?** Está en
> [`lanctl-cheatsheet.md`](lanctl-cheatsheet.md): todo en tablas, listo
> para copiar y pegar desde el terminal.

---

## Instalación

`install.sh` deja el enlace en `~/.local/bin/lanctl` (ruta que ya está en
el `PATH` desde `~/.bashrc`):

```bash
cd ~/dotfiles && ./install.sh
```

Si se prefiere el enlace manual:

```bash
mkdir -p ~/.local/bin
ln -sfn ~/dotfiles/scripts/lanctl ~/.local/bin/lanctl
```

### `adb` para el Fire TV

El Fire TV se maneja con `adb`. En Fedora está en `android-tools`, pero
`lanctl` puede instalarlo **sin root**, descargando el RPM y extrayéndolo:

```bash
lanctl setup            # descarga y deja adb en ~/.local/lib/lanctl/adb
lanctl setup --forzar   # lo vuelve a instalar aunque ya exista
```

El script busca `adb` en este orden: el del sistema, las rutas habituales
del SDK de Android y `~/.local/lib/lanctl/adb`.

Necesita `dnf`, `cpio` y `rpm2cpio` en el sistema
(`sudo dnf install cpio rpm`).

---

## El inventario

Los dispositivos se guardan en `~/.config/lanctl/devices.toml` (fuera del
repositorio; es información de la red local de cada equipo):

```toml
[devices.firetv]
type = "firetv"
ip = "192.168.1.42"   # ejemplo: el tuyo lo pone discover
ports = [5555, 8009]
mac = "aa:bb:cc:dd:ee:ff"
name = "Fire TV Stick"
```

- `type` decide el backend que se usa (`firetv`, `hisense`, `iphone`,
  `router`, `kdeconnect`).
- `name` es una etiqueta; `mac` y `ports` son opcionales y solo informativos.
- Se puede editar a mano: el formato es TOML sencillo y `lanctl` lo
  reescribe sin perder las claves que no conoce.

### Comandos de inventario

```bash
lanctl discover            # escanea la red y guarda el inventario (lento, ~2 min)
lanctl discover --rapido   # solo los puertos clave (mucho más rápido)
lanctl discover --cidr 192.168.1.0/24 --ports 22 80 443 5555 9223

lanctl ls                  # tabla de dispositivos
lanctl status firetv       # detalle de uno (tipo, ip, mac, puertos, si vive)
lanctl doctor              # comprueba que todo está en su sitio
```

`discover` combina varias técnicas, porque cada una ve cosas distintas:

| Técnica | Qué encuentra |
|---|---|
| `nmap -sT` sobre 46 puertos | casi todo: cámaras, TVs, routers, NAS |
| SSDP (M-SEARCH multicast) | dispositivos UPnP/DLNA que no responden a ping |
| `avahi-browse` | lo que se anuncia por mDNS |
| tabla ARP (`ip neigh`) | los MAC, provocando resolución con un socket |

> Las MAC que aparecen en el inventario son las de la red wifi. Las
> aleatorizadas (`0e:79:…`, `d2:fd:df:…`) cambian con frecuencia: son
> iPhones en «privacidad» y no sirven para identificar el equipo.

---

## Comandos genéricos

| Comando | Qué hace |
|---|---|
| `lanctl ping firetv` | ping y latencia (con `--cuenta N`) |
| `lanctl ip firetv` | imprime la IP del dispositivo |
| `lanctl ssh router ls /` | ssh al dispositivo (usa el usuario actual) |
| `lanctl wake portatil` | magic packet (Wake-on-LAN) |
| `lanctl raw firetv 5555 hola` | manda texto crudo a un puerto TCP |

Los genericos aceptan la **clave** del inventario, su nombre o su IP:
`lanctl ping 192.168.1.42` funciona igual que `lanctl ping firetv`.

---

## Atajos

Los atajos son los comandos cortos para lo que se pide día a día: no
hacen falta las subpalabras (`launch`, `source`, `key`…).

| Atajo | Qué hace |
|---|---|
| `lanctl ver` | qué se ve ahora en cada TV (app, fuente, canal) y si está despierta |
| `lanctl foto` | captura de las TVs en `~/Capturas/` |
| `lanctl escena <nombre>` | deja todo como un escenario (Netflix, antena, apagar…) |
| `lanctl mando <tecla> [dispositivo]` | una tecla del mando en una o en las dos TVs |
| `lanctl fuente <hdmi1\|tv\|…>` | fuente de entrada de la TV Hisense |
| `lanctl canal <n>` | canal de la TV Hisense (implica la fuente antena) |
| `lanctl volumen <up\|down\|mute\|0-100>` | volumen del Fire TV |

Ejemplos:

```bash
lanctl ver
lanctl escena netflix        # enciende la Hisense, la pone en HDMI1 y abre Netflix
lanctl mando home            # 'home' en las dos TVs
lanctl mando info firetv     # solo en el Fire TV
lanctl foto                  # ~/Capturas/20261021-222731-hisense.png
lanctl canal 4               # La 2 HD
lanctl fuente hdmi1          # vuelve al HDMI
```

### Escenarios

| Escena | Qué hace |
|---|---|
| `netflix`, `disney`, `hbo`, `twitch`, `dazn` | enciende la Hisense, la pone en HDMI1 y abre la app en el Fire TV |
| `antena` | enciende la Hisense y la pone en la antena |
| `hdmi1`, `hdmi2`, `hdmi3` | enciende la Hisense y cambia de entrada |
| `apagar` | suspende el Fire TV y apaga la Hisense |
| `dormir` | solo suspende el Fire TV |

### Alias de apps

En vez del paquete, se puede escribir el nombre. En el Fire TV:

| Alias | App |
|---|---|
| `netflix` | Netflix |
| `disney`, `disneyplus` | Disney+ |
| `hbo`, `hbomax` | HBO Max |
| `twitch` | Twitch |
| `dazn` | DAZN |
| `crunchyroll` | Crunchyroll |
| `youtube` | YouTube (Fire TV) |
| `musica`, `amazonmusic` | Amazon Music |
| `navegador`, `cloud9` | navegador |
| `fotos` | Fotos |
| `juegos` | Gamehub |
| `launcher` | la pantalla de inicio del Fire TV |

> **Prime Video no está disponible en este Fire TV**: la app instalada
> (`com.amazon.minitv.android.app`) es en realidad «Amazon MX Player TV» y
> su ficha dice *«No disponible en este país»* (habla inglés e hindi). No
> hay atajo para ella porque abrirla solo enseña la página de detalles.
> El idioma del dispositivo es `es-ES` y el país wifi `ES`.

Y en la Hisense: `netflix`, `youtube`, `youtubekids`, `amazon`, `vudu`,
`opera`, `navegador`, `appstore`, `store`, `tiempo`, `weather`, `dlna`,
`pandora`, `dailymotion`, `rakutentv`, `vidaatv`, `allapps`, `picasa`,
`dropbox`.

```bash
lanctl firetv netflix         # equivalente a: lanctl firetv launch com.netflix.ninja
lanctl hisense youtube
```

### Teclas unificadas

`lanctl mando` usa el mismo nombre para las dos TVs y traduce al que
entiende cada una:

| Atajo | Fire TV | Hisense |
|---|---|---|
| `back` | `back` | `escape` |
| `home` | `home` | `launcher` |
| `ok` | `ok` | `enter` |
| `rewind` | `rewind` | `fast_bkw` |
| `fast_forward` | `fast_forward` | `fast_fwd` |

Las demás (`up`, `down`, `left`, `right`, `enter`, `menu`, `info`,
`power`, `play`, `stop`, `next`, `prev`, `mute`, `volume_up`,
`volume_down`) coinciden en ambos.

---

## Fire TV Stick (ADB sobre TCP)

El Stick habla ADB por el puerto 5555. La primera vez hay que autorizarlo:
en la TV aparece el diálogo **«Allow USB debugging»** y hay que aceptar.

```
lanctl firetv info              # modelo, android, sdk, MAC, número de serie
lanctl firetv apps              # paquetes instalados
lanctl firetv apps --terceros   # solo los que instalaste tú
lanctl firetv launch com.netflix.ninja   # lanza una app por paquete
lanctl firetv launch https://example.com  # o por URL
lanctl firetv stop com.netflix.ninja     # la cierra
lanctl firetv key home          # una tecla del mando
lanctl firetv text "hola"       # escribe texto
lanctl firetv volume up         # up / down / mute / 0-100
lanctl firetv power on          # on (despertar) / off (suspender)
lanctl firetv shot captura.png  # captura de pantalla
lanctl firetv shell getprop     # shell del dispositivo
lanctl firetv install app.apk   # instala un APK (--si para no preguntar)
```

### Teclas disponibles

`home`, `back`, `up`, `down`, `left`, `right`, `enter` (alias `ok`),
`menu`, `play`, `pause`, `play_pause`, `stop`, `power`, `sleep`, `wake`,
`mute`, `volume_up`, `volume_down`, `search`, `backspace`, `info`,
`next`, `prev`, `rewind`, `fast_forward`.

> `power off` **no apaga** el Stick (eso no lo permite Android), lo
> suspende. Para apagarlo de verdad hay que cortar la corriente.

> **La captura de pantalla falla con Netflix** (y con otras apps con
> DRM): `screencap` devuelve 0 bytes porque la imagen va por una
> superficie segura. Desde el launcher sí funciona. `lanctl foto` avisa
> del motivo en vez de fallar en silencio.

### Autorización

Si `lanctl firetv info` dice que el dispositivo está `unauthorized`, hay
que aceptar el diálogo en la TV. Si no aparece, se revisa que las
*opciones de desarrollador → depuración USB* estén activadas.

La clave ADB la genera el propio `adb` en `~/.android/adbkey` la primera
vez que se usa. Si se filtra, se borra ese fichero y se regenera.

---

## Pelis y series concretas

Además de abrir la app, se puede pedir **un título concreto** de cada
servicio de streaming:

```bash
lanctl play netflix 80100172              # por id
lanctl play netflix "nflx://www.netflix.com/title/80100172"   # por URL
lanctl play netflix "la casa de papel"    # por nombre: abre el buscador
lanctl play youtube "dune trailer"        # en YouTube se resuelve solo
lanctl buscar disney "star wars"          # abre el buscador del servicio
lanctl buscar disney "star wars" --ok     # y pulsa OK en el primer resultado
```

También están disponibles como `lanctl firetv play …` y
`lanctl firetv buscar …`.

### Si no arranca solo

El deep link a veces deja la ficha del título en pantalla, pero sin
reproducir. Tras abrirlo, `lanctl` mira la sesión multimedia del Stick
(`dumpsys media_session`): si a los 8 s no está reproduciendo, pulsa OK
y espera 10 s más. Si aun así no lo confirma, avisa para mirar la
pantalla; no insiste con más teclas.

### Servicios

| Servicio | Alias | Paquete | Enlace a un título | Buscador |
|---|---|---|---|---|
| Netflix | `netflix` | `com.netflix.ninja` | `nflx://www.netflix.com/title/<id>` | `nflx://www.netflix.com/search?q=…` |
| Disney+ | `disney`, `disneyplus` | `com.disney.disneyplus` | `disneyplus://www.disneyplus.com/video/<uuid>` | `disneyplus://www.disneyplus.com/search?q=…` |
| HBO Max | `hbo`, `max`, `hbomax` | `com.hbo.hbonow` | `https://play.max.com/video/e/<id>` | `https://play.max.com/search?q=…` |
| Twitch | `twitch` | `tv.twitch.android.viewer` | `twitch://video/<id>` | `twitch://search/<texto>` |
| YouTube | `youtube`, `yt` | `com.amazon.firetv.youtube` | `https://www.youtube.com/watch?v=<id>` | `https://www.youtube.com/results?search_query=…` |
| Crunchyroll | `crunchyroll`, `crunchy` | `com.crunchyroll.crunchyroid` | `crunchyroll://watch/<id>` | `crunchyroll://search?q=…` |

### Cómo decide si es un id o un nombre

`_parece_id()` mira el texto: si son solo dígitos (Netflix, Twitch), si
tiene guiones (los UUID de Disney+) o si son al menos 8 caracteres con
letras y números (los ids de YouTube y Crunchyroll), lo toma como id. Si
no, lo toma como nombre de película y abre el buscador.

**Solo YouTube resuelve el nombre solo**: es el único servicio cuyo HTML
de resultados trae los ids (`"videoId":"…"`), así que `lanctl play youtube
"dune trailer"` busca el vídeo y lo abre directamente. En los demás
servicios hay que pasar el id (o la URL) para saltar al título exacto.

### Cómo funciona por debajo

- Se lanza un intent `am start -a android.intent.action.VIEW -d <url> -p
  <paquete>`. El `-p` es **imprescindible** en los enlaces `https`: sin
  él, el navegador Silk (o cualquier navegador) intercepta la URL.
- Después se espera a que el paquete esté en primer plano y, si no lo
  está, se avisa.
- El texto del buscador se escapa con `%20` (no con `+`), porque en un
  camino —`twitch://search/…`— el `+` es literal.

> La búsqueda dentro de la app **no** se puede lanzar con el intent
> genérico `android.intent.action.SEARCH`: solo YouTube y Crunchyroll lo
> declaran. Netflix, Disney+, HBO y Twitch no lo tienen.

---

## TV Hisense (VIDAA)

La Hisense (modelo HE50A6100UWTS) expone un **Chrome DevTools Protocol**
en el puerto 9223: es el mismo protocolo que usa Chrome, pero sobre la
aplicación de la propia TV. `lanctl` habla ese protocolo con un cliente
WebSocket propio (no hace falta `requests` ni `websocket-client`).

```
lanctl hisense apps                 # apps disponibles
lanctl hisense launch netflix       # lanza una app
lanctl hisense source               # lista las fuentes (marca * la actual)
lanctl hisense source hdmi1         # cambia de fuente
lanctl hisense channels             # lista los canales (marca * el actual)
lanctl hisense channel 4            # cambia de canal (número o nombre)
lanctl hisense key info             # una tecla del mando
lanctl hisense power off            # apaga / enciende
lanctl hisense shot captura.png     # captura de pantalla
lanctl hisense cast https://… --titulo "…"   # manda un vídeo por DLNA
lanctl hisense eval "window.appPagesList"     # JavaScript libre (diagnóstico)
```

### Fuentes disponibles

| id | fuente |
|---|---|
| 0 | `tv` (antena) |
| 1 | `avs` |
| 4 | `hdmi1` |
| 5 | `hdmi2` |
| 6 | `hdmi3` |

`lanctl hisense source` sin argumentos lista las que la TV declare
realmente (depende de qué entradas estén conectadas).

### Canales

La lista sale de la propia TV (`liveTV.getChannelListOprtData()`) y
depende de la antena: en esta casa son 7 canales (La 1 HD, tdp HD, 24h HD,
La 2 HD, Radio 5 RNE, RNE Andalucía, Ràdio 4 RNE).

> Cambiar de canal **implica volver a la fuente de la antena**: la TV
> reproduce el canal en directo, no sobre el HDMI. Después conviene
> `lanctl fuente hdmi1` para volver al HDMI.

### Teclas

Se mandan las que la propia TV declara en su tabla de códigos
(`CONST.KEY` / `CONST.KEYCODE_MAP`): `up`, `down`, `left`, `right`,
`enter`, `escape`, `backspace`, `menu`, `volume_up`, `volume_down`,
`channel_up`, `channel_down`, `mute`, `power`, `info`, `play`, `stop`,
`source`… El nombre se convierte a `VK_<NOMBRE>` en mayúsculas.

> Para descubrir el resto: `lanctl hisense eval "Object.keys(CONST.KEY)"`.

> Solo tienen código de mando las teclas que están en `CONST.KEYCODE_MAP`.
> **No existen** `back`, `home`, `search`, `ok` ni `space`; sus
> equivalentes son `escape`, `launcher` y `enter`. Por eso `lanctl mando`
> traduce: `back` → `escape` y `home` → `launcher`.

### Límites

- La TV **se sale de la red en reposo**: cuando está apagada, su IP deja
  de responder y desaparece del inventario. Al volver, la recupera sola.
- El puerto 9223 está pensado para depuración: la TV puede quitarlo en
  futuras actualizaciones de firmware.

---

## iPhone

**El control del iPhone por wifi no es viable con iOS actual.** El
protocolo `usbmuxd` por red (puerto 62078) quedó obsoleto: iOS 17/18 exige
emparejamiento previo y solo publica el servicio `_remotepairing`
(RemoteXPC) cuando el móvil está desbloqueado y emparejado por USB.

Por eso el backend de iPhone es **informativo**:

```
lanctl iphone list    # lista los iPhone y explica el estado de cada uno
lanctl iphone info    # modelo, versión de iOS, capacidad (si se puede)
lanctl iphone shot    # captura (necesita idevicescreenshot)
```

Para que funcione de verdad hay que emparejarlo **por USB** una vez:

```bash
sudo dnf install libimobiledevice-utils
idevicepair pair
```

A partir de ahí, `usbmuxd` local sí lo ve y `iphone info` / `iphone shot`
funcionan (por cable, no por wifi).

---

## Router (ubus)

El router es un OpenWrt con la interfaz **JuCI** (build Genexis/Adamo). Su
API es **ubus JSON-RPC 2.0 sobre WebSocket** en `ws://192.168.1.1/` con
el subprotocolo `ubus-json`.

El backend está implementado, pero **desactivado por defecto**: hace
falta la contraseña del router y así no se manda nada sin querer.

Hay dos formas de dársela. La variable de entorno es la habitual:

```bash
export LANCTL_UBUS_SECRET='la contraseña del router'
```

La otra, más cómoda si se usa a diario, es un fichero propio con
permisos `600` (la contraseña no queda en el historial del shell):

```bash
mkdir -p ~/.config/lanctl
read -rsp 'Contraseña del router: ' p && printf '%s' "$p" \
    > ~/.config/lanctl/ubus.secret && chmod 600 ~/.config/lanctl/ubus.secret
```

La variable de entorno manda sobre el fichero si están los dos.

```bash
lanctl router board                      # info del sistema
lanctl router uci wireless                # lee una sección de la config
lanctl router uci wireless ssid           # una opción concreta
lanctl router call --objeto system --metodo board
```

Objetos útiles de ubus: `system`, `service`, `uci` (get/set/commit),
`file`, `session`, `juci.core`.

Con credenciales también se podría tocar el filtrado MAC de la wifi
(`wireless.maclist`), el DHCP y las entradas estáticas, las reglas del
firewall, el VPN y las opciones del sistema.

---

## Cómo funciona por dentro

Notas de implementación, por si hay que tocar el código.

### CDP (Hisense)

`GET http://192.168.1.43:9223/json/list` devuelve los *targets* del
DevTools. Sobre el WebSocket se manda `Runtime.evaluate` con el JavaScript
que se quiera ejecutar en la página de la TV, y `Page.captureScreenshot`
para la captura.

Detalles que costaron encontrar:

- El servidor a veces responde `500 Internal Server Error` al abrir el
  WebSocket (conexiones anteriores cerrándose) y `/json/list` puede
  devolver una lista vacía un instante → **hay que reintentar** (lo hace
  `CDP._conectar()`).
- La tabla `CONST.KEYCODE_MAP` va de «código de mando» a «código de
  tecla». Para mandar una tecla hay que buscar el **índice** de la
  entrada cuyo valor coincide con `CONST.KEY['VK_<NOMBRE>']` y llamar a
  `UI.onRemote({command: indice, state: 1, sendResult: function(){}})`.
- `processKeyOnPC` y `sendKeyToCEC` **no sirven** (lanza error / es un
  no-op cuando la TV está en modo TV).
- `getShowSourceList()` lanza excepción: la lista de fuentes buena es
  `window.sourceMap` junto con `window.LiveTVSourceMap`.
- `window.ChannelList` está vacío; la lista real de canales sale de
  `liveTV.getChannelListOprtData()`.

### ADB (Fire TV)

`lanctl` habla con el binario `adb` (el propio de Android), no
implementa el protocolo. Se usa:

- `adb connect IP:5555`
- `adb shell input keyevent <KEYCODE>`
- `adb shell input text <texto>`
- `adb shell screencap -p` (captura)
- `adb shell monkey -p <paquete> 1` / `am start` (lanzar)
- `adb shell pm list packages` (apps)

### DLNA (Hisense)

`lanctl hisense cast` hace un M-SEARCH SSDP, saca el `controlURL` del
`AVTransport` y manda un SOAP `SetAVTransportURI` + `Play`.

---

## Problemas frecuentes

| Síntoma | Causa y arreglo |
|---|---|
| `firetv` dice `unauthorized` | falta aceptar el diálogo en la TV |
| `firetv` dice `no such device` | el Stick está en reposo; `lanctl firetv power on` |
| `firetv shot` no devuelve imagen | la app actual usa DRM (Netflix); se captura desde el launcher |
| `hisense` dice que no responde | la TV está apagada y se ha ido de la red |
| `hisense` devuelve 500 | reintento automático; si persiste, reiniciar el servidor CDP desde la TV |
| `lanctl canal` deja la TV en antena | es normal: el canal se ve en la tuner, no en el HDMI; volver con `lanctl fuente hdmi1` |
| `lanctl ver` dice que no | el Fire TV duerme: `lanctl firetv power on` |
| `discover` tarda mucho | usar `--rapido` o `--ports` con lo que interese |
| `iphone` no da datos | requiere emparejamiento por USB (ver arriba) |
| `router` pide credenciales | definir `LANCTL_UBUS_SECRET` o `~/.config/lanctl/ubus.secret` |

---

## Seguridad

- `lanctl` **no guarda ninguna contraseña en el repositorio**: la del
  router se lee de `LANCTL_UBUS_SECRET` o de
  `~/.config/lanctl/ubus.secret` (modo `600`) en el momento.
- La clave ADB de este equipo está en `~/.android/adbkey` (permisos
  `600`). Si se filtra, se borra ese fichero y el propio `adb` genera
  otra la próxima vez.
- Autorizar un dispositivo por ADB es concederle control total sobre él:
  la autorización se revoca en *Ajustes → Aplicaciones → Acceso a USB
  → depuración*.
- El inventario (`~/.config/lanctl/devices.toml`) describe la red local;
  no se versiona en el repositorio.
