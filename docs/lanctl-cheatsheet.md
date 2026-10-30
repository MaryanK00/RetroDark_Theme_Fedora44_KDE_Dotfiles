# Chuleta de `lanctl`

Referencia rápida de **todos** los comandos de `lanctl`, para llevar las
televisiones desde el terminal.

```bash
lanctl <comando> [opciones]
lanctl --help              # lista de comandos
lanctl <comando> --help    # detalle de uno
```

El binario ya está en el `PATH` (`~/.local/bin/lanctl`). Los dispositivos
se nombran por su clave (`firetv`, `hisense`, `router`…), por su nombre
o por su IP.

---

## 1. Fire TV Stick — lo esencial

| Comando | Qué hace |
|---|---|
| `lanctl ver` | qué se ve ahora en cada TV y si está despierta |
| `lanctl firetv info` | modelo, Android, SDK, número de serie |
| `lanctl firetv apps` | todas las apps instaladas |
| `lanctl firetv apps --terceros` | solo las que instalaste tú |
| `lanctl firetv launch <paquete \| url>` | abre una app (paquete o dirección web) |
| `lanctl firetv stop <paquete>` | cierra la app a la fuerza |
| `lanctl firetv key <tecla>` | pulsa una tecla del mando |
| `lanctl firetv text "hola"` | escribe texto |
| `lanctl firetv volume up \| down \| mute \| 0-100` | volumen |
| `lanctl firetv power on \| off` | despierta / **suspende** |
| `lanctl firetv shot [fichero.png]` | captura de pantalla |
| `lanctl firetv shell <orden…>` | ejecuta una orden en el dispositivo |
| `lanctl firetv install <app.apk> --si` | instala un APK |

Ejemplos:

```bash
lanctl firetv launch com.netflix.ninja
lanctl firetv launch https://youtube.com
lanctl firetv key home
lanctl firetv text "hola mundo"
lanctl firetv volume up
lanctl firetv power on
lanctl firetv shot
lanctl firetv shell getprop ro.build.version.release
```

### Apps por nombre (alias)

No hace falta recordar los paquetes:

```bash
lanctl firetv netflix        # en vez de: lanctl firetv launch com.netflix.ninja
```

| Alias | App | Alias | App |
|---|---|---|---|
| `netflix` | Netflix | `crunchyroll` | Crunchyroll |
| `disney`, `disneyplus` | Disney+ | `youtube` | YouTube |
| `hbo`, `hbomax` | HBO Max | `musica`, `amazonmusic` | Amazon Music |
| `twitch` | Twitch | `navegador`, `cloud9` | navegador |
| `dazn` | DAZN | `fotos` | Fotos |
| `launcher` | pantalla de inicio | `juegos` | Gamehub |

> **Prime Video no está disponible**: en este Fire TV la app instalada es
> «Amazon MX Player TV» y dice *«No disponible en este país»*. No hay
> atajo para ella.

### Teclas del mando

`home`, `back`, `up`, `down`, `left`, `right`, `enter` (alias `ok`),
`menu`, `play`, `pause`, `play_pause`, `stop`, `power`, `sleep`, `wake`,
`mute`, `volume_up`, `volume_down`, `search`, `backspace`, `info`,
`next`, `prev`, `rewind`, `fast_forward`.

```bash
lanctl firetv key home
lanctl firetv key volume_up
lanctl firetv key info
```

### Pelis y series concretas

| Comando | Qué hace |
|---|---|
| `lanctl play <servicio> <id \| url \| nombre>` | abre un título concreto |
| `lanctl buscar <servicio> "<texto>"` | abre el buscador del servicio |
| `lanctl buscar <servicio> "<texto>" --ok` | además pulsa OK en el primer resultado |

Servicios: `netflix`, `disney`, `hbo`, `twitch`, `youtube`, `crunchyroll`
(tambien `disneyplus`, `max`, `hbomax`, `yt`, `crunchy`).

```bash
lanctl play netflix 80100172              # id de Netflix
lanctl play netflix "nflx://www.netflix.com/title/80100172"
lanctl play netflix "la casa de papel"    # abre el buscador de Netflix
lanctl play youtube "dune trailer"        # lo resuelve solo y lo abre
lanctl buscar disney "star wars"
lanctl buscar hbo "harry potter" --ok
lanctl play youtube dQw4w9WgXcQ          # id de YouTube
```

> **En YouTube el nombre se resuelve solo** (es el único servicio cuyo
> HTML trae los ids). En los demás, si se pasa un nombre en vez de un id,
> se abre el buscador del servicio y se elige con el mando. Para saltar
> al título exacto hay que pasarle el id (o la URL completa).

---

## 2. Atajos (lo más rápido para el día a día)

| Comando | Qué hace |
|---|---|
| `lanctl ver` | qué se ve en cada TV |
| `lanctl foto [directorio]` | capturas en `~/Capturas/` |
| `lanctl escena <escena>` | deja todo listo de una vez |
| `lanctl mando <tecla> [firetv\|hisense\|todas]` | una tecla en las TVs |
| `lanctl fuente <hdmi1\|hdmi2\|hdmi3\|tv\|av>` | fuente de la Hisense |
| `lanctl canal <n>` | canal de la Hisense |
| `lanctl volumen <up\|down\|mute\|0-100>` | volumen del Fire TV |

### Escenas

| Escena | Qué hace |
|---|---|
| `netflix`, `disney`, `hbo`, `twitch`, `dazn` | enciende la Hisense → HDMI1 → abre la app en el Fire TV |
| `antena` | enciende la Hisense y la pone en la antena |
| `hdmi1`, `hdmi2`, `hdmi3` | enciende la Hisense y cambia de entrada |
| `apagar` | suspende el Fire TV y apaga la Hisense |
| `dormir` | solo suspende el Fire TV |

```bash
lanctl escena netflix
lanctl escena antena
lanctl escena apagar
```

### Tecla para las dos TVs

El mismo nombre se traduce a lo que entiende cada una (`back` → `escape`
y `home` → `launcher` en la Hisense):

```bash
lanctl mando home            # las dos TVs
lanctl mando info firetv     # solo el Fire TV
lanctl mando back hisense    # solo la Hisense
```

---

## 3. TV Hisense (VIDAA)

| Comando | Qué hace |
|---|---|
| `lanctl hisense apps` | apps disponibles en la TV |
| `lanctl hisense launch <app>` | abre una app |
| `lanctl hisense source` | lista las fuentes (marca `*` la actual) |
| `lanctl hisense source <fuente>` | cambia de fuente |
| `lanctl hisense channels` | lista los canales |
| `lanctl hisense channel <n \| nombre>` | cambia de canal |
| `lanctl hisense key <tecla>` | una tecla del mando |
| `lanctl hisense power on \| off` | enciende / apaga |
| `lanctl hisense shot [fichero.png]` | captura de pantalla |
| `lanctl hisense cast <url> [--titulo "…"]` | manda un vídeo por DLNA |
| `lanctl hisense eval "<javascript>"` | ejecuta JavaScript en la TV |

```bash
lanctl hisense netflix
lanctl hisense source hdmi1
lanctl hisense channel 4
lanctl hisense shot
lanctl hisense cast https://example.com/video.mp4 --titulo "Vídeo"
```

### Fuentes

| id | fuente | | id | fuente |
|---|---|---|---|---|
| 0 | `tv` (antena) | | 4 | `hdmi1` |
| 1 | `avs` | | 5 | `hdmi2` |
| | | | 6 | `hdmi3` |

### Alias de apps

`netflix`, `youtube`, `youtubekids`, `amazon`, `vudu`, `opera`,
`navegador`, `appstore`, `store`, `tiempo`, `weather`, `dlna`, `pandora`,
`dailymotion`, `rakutentv`, `vidaatv`, `allapps`, `picasa`, `dropbox`.

---

## 4. Red y equipos

| Comando | Qué hace |
|---|---|
| `lanctl discover` | escanea la red y guarda el inventario (~2 min) |
| `lanctl discover --rapido` | escaneo rápido (solo puertos clave) |
| `lanctl discover --cidr 192.168.1.0/24 --ports 22 80 5555` | red y puertos a mano |
| `lanctl ls` | lista los dispositivos del inventario |
| `lanctl status <dispositivo>` | detalle de uno |
| `lanctl ip <dispositivo>` | su IP |
| `lanctl ping <dispositivo> [--cuenta N]` | ping y latencia |
| `lanctl ssh <dispositivo> [orden…]` | ssh al dispositivo |
| `lanctl wake <dispositivo>` | magic packet (Wake-on-LAN) |
| `lanctl raw <dispositivo> <puerto> [texto…]` | manda texto crudo a un puerto |

```bash
lanctl ls
lanctl status firetv
lanctl ping router --cuenta 2
lanctl ssh router "uci show wireless"
lanctl wake portatil
```

---

## 5. Otros dispositivos

| Comando | Qué hace |
|---|---|
| `lanctl iphone list` | iPhone anunciados en la red |
| `lanctl iphone info` | modelo, iOS, capacidad |
| `lanctl iphone shot [fichero.png]` | captura (necesita `idevicescreenshot`) |
| `lanctl router board` | información del router |
| `lanctl router uci <sección> [opción]` | lee la configuración del router |
| `lanctl router call --objeto <obj> --metodo <m>` | llama a un objeto de ubus |

> El router necesita credenciales (`LANCTL_UBUS_SECRET` o
> `~/.config/lanctl/ubus.secret`); el iPhone necesita emparejamiento
> previo por USB. Ver [`lanctl.md`](lanctl.md).

---

## 6. Utilidades

| Comando | Qué hace |
|---|---|
| `lanctl setup` | instala `adb` sin root (en `~/.local/lib/lanctl/`) |
| `lanctl setup --forzar` | lo reinstala |
| `lanctl doctor` | comprueba que todo está en su sitio |
| `lanctl --version` | versión |

---

## 7. Avisos que te vas a encontrar

- **`power off` no apaga el Fire TV**, lo suspende: la pantalla se apaga
  pero sigue encendido y conectado a la corriente. Para apagarlo del todo
  hay que cortar la corriente del enchufe. Para despertarlo:
  `lanctl firetv power on`.
- **La captura del Fire TV falla con Netflix** (y con otras apps con DRM):
  la imagen va por una superficie protegida y `screencap` no devuelve
  nada. Desde el launcher funciona.
- **Cambiar de canal lleva la TV a la antena**: el canal se ve en la
  tuner, no sobre el HDMI. Para volver: `lanctl fuente hdmi1`.
- **La TV se va de la red en reposo**: cuando está apagada, su IP deja de
  responder y desaparece del inventario. Al volver, la recupera sola.
- **Si hay más de un dispositivo del mismo tipo**, hay que indicar cuál:
  `lanctl firetv info --device firetv2` (también vale la IP:
  `--device 192.168.1.42`).

---

## 8. Atajos de shell

Para no escribir `lanctl firetv` cada vez:

```bash
# en ~/.bashrc
alias ft='lanctl firetv'
alias hs='lanctl hisense'
alias lver='lanctl ver'
```

Y como `lanctl` es un script, se puede usar con `!` en el historial:

```bash
!ft key home
!escena netflix
```

---

## 9. Referencia rápida de un vistazo

```bash
lanctl ver                          # qué se ve
lanctl escena netflix               # dejar Netflix listo
lanctl mando home                    # home en las dos TVs
lanctl volumen up                    # más volumen
lanctl fuente hdmi1                  # al HDMI
lanctl canal 4                       # La 2 HD
lanctl foto                          # capturas
lanctl play netflix 80100172         # poner una peli concreta
lanctl buscar disney "star wars"     # buscar en un servicio
lanctl firetv power off              # suspender el Stick
lanctl doctor                        # comprobar el entorno
```
