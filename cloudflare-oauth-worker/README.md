# Worker de acceso al panel `/admin` (usuario y contraseña)

Pequeño Worker de Cloudflare (plan gratuito) para que el cliente entre al panel de fotos y textos (Decap CMS) **con usuario y contraseña, sin tener cuenta de GitHub**.

Decap CMS (backend `github`) abre una ventana hacia este Worker y espera recibir un token de GitHub. Aquí el Worker muestra su propio formulario; si el usuario y la contraseña son correctos, le entrega al panel un **token fine-grained de GitHub guardado como secreto** (limitado a un solo repositorio). Decap funciona sin cambios.

**No hay secretos en estos archivos.** Todo se carga como secretos del Worker (paso 4).

> Honestidad sobre el diseño: quien entra recibe en su navegador ese token (como cualquier sesión de Decap), que solo sirve para leer y escribir el contenido del repositorio `youthcoop-web`. Por eso el token debe ser fine-grained, de un solo repositorio y con vencimiento, y la contraseña debe ser larga.

## Rutas

| Ruta | Qué hace |
|---|---|
| `GET /` | Texto de estado («funcionando»). |
| `GET /auth` | Formulario de acceso (es la ruta que abre Decap). Si el navegador manda `Referer` y no es un origen de `ALLOWED_ORIGINS`, responde 403. |
| `POST /login` | Valida CSRF, bloqueo por IP, usuario y contraseña. Si todo es correcto, responde la página de cierre que hace `postMessage` al panel. |

Se eliminó el flujo OAuth de GitHub (`/callback`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`): complicaba y ya no se usa.

## Secretos y variables

| Nombre | Tipo | Contenido |
|---|---|---|
| `PANEL_USER` | secreto | Nombre de usuario del cliente (distingue mayúsculas). |
| `PANEL_PASS_HASH` | secreto | Hash PBKDF2-SHA256 de la contraseña: `pbkdf2$iteraciones$salBase64$hashBase64` (lo genera `hash-password.mjs`; 100000 iteraciones, el máximo del plan gratis). |
| `GITHUB_REPO_TOKEN` | secreto | Token fine-grained de GitHub (paso 1). |
| `SESSION_SECRET` | secreto | Cadena aleatoria de 32 caracteres o más; firma el token anti-CSRF del formulario. |
| `ALLOWED_ORIGINS` | variable (`wrangler.toml`) | Orígenes que pueden recibir el token, separados por coma, sin barra final. |
| `LIMITES` | KV (recomendado) | Contadores de intentos fallidos. Ver «Protecciones». |

Los secretos se leen con `trim()`: el salto de línea que añade `Get-Clipboard` no estorba.

## Procedimiento exacto

Necesitas: cuenta de Cloudflare (gratis), cuenta de GitHub dueña del repositorio y Node.js 20+ (`npx wrangler`). Todo en PowerShell.

### 1. Crear el token fine-grained de GitHub

GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:

| Campo | Valor |
|---|---|
| Token name | `youthcoop-panel` |
| Expiration | la **máxima** que permita GitHub (1 año; anota la fecha para renovarlo) |
| Resource owner | la cuenta dueña de `youthcoop-web` |
| Repository access | **Only select repositories** → solo `youthcoop-web` |
| Permissions → Repository permissions | **Contents: Read and write**. (Metadata: Read-only queda marcado solo; no actives nada más) |

Pulsa **Generate token** y **cópialo al portapapeles** (solo se muestra una vez; empieza con `github_pat_`). No lo pegues en archivos ni en el chat.

### 2. Dirección del Worker y orígenes

- Opción simple: la dirección que da Cloudflare, `https://youthcoop-decap-oauth.TU-USUARIO.workers.dev` (es la que ya usa `public/admin/config.yml`).
- Con dominio propio: descomenta `routes` en `wrangler.toml`.

Revisa `ALLOWED_ORIGINS` en `wrangler.toml`: debe incluir el origen real desde el que se abre el panel (`https://youthcoop.pe`, con y sin `www` si aplica).

### 3. (Recomendado) Espacio KV para el bloqueo por intentos

```powershell
cd cloudflare-oauth-worker
npx wrangler login
npx wrangler kv namespace create LIMITES
```

Imprime un `id`. En `wrangler.toml` quita el comentario de las tres líneas `[[kv_namespaces]]` y pega ese `id`.

### 4. Cargar los 4 secretos y desplegar

Con el token ya en el portapapeles:

```powershell
cd cloudflare-oauth-worker
Get-Clipboard | npx wrangler secret put GITHUB_REPO_TOKEN
```

Usuario (copia primero el nombre de usuario, p. ej. `cliente`):

```powershell
Set-Clipboard "NOMBRE_DE_USUARIO"
Get-Clipboard | npx wrangler secret put PANEL_USER
```

Contraseña (la escribes tú, no se muestra; mínimo 12 caracteres; el script solo imprime el hash):

```powershell
node hash-password.mjs | Set-Clipboard
Get-Clipboard | npx wrangler secret put PANEL_PASS_HASH
Set-Clipboard $null          # limpia el portapapeles
```

Secreto de sesión (aleatorio, no hay que recordarlo):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put SESSION_SECRET
```

Desplegar:

```powershell
npx wrangler deploy
```

Los secretos quedan guardados aparte del código: volver a desplegar no los borra, y `secret put` sobre un Worker ya desplegado los activa al instante. (Opcional, limpieza de lo antiguo: `npx wrangler secret delete GITHUB_CLIENT_ID` y `npx wrangler secret delete GITHUB_CLIENT_SECRET`; y borrar la OAuth App de GitHub si se creó.)

### 5. Comprobar

- `URL_WORKER/` debe decir «Acceso al panel de YOUTH COOP (Decap CMS): funcionando.».
- `URL_WORKER/auth` debe mostrar el formulario (si dice «Worker sin configurar: faltan…», falta un secreto o `ALLOWED_ORIGINS`).
- Abre `https://youthcoop.pe/admin/`, pulsa el botón de entrar, escribe usuario y contraseña, y comprueba que el panel carga las colecciones y que **Publicar** crea un commit en `main`.

> Nota: el flujo con token fine-grained no se pudo probar contra GitHub real al desarrollarlo; las pruebas automáticas cubren el Worker, no la API de GitHub. Haz una publicación de prueba (y deshazla) antes de entregar.

### 6. Conectar el panel

`public/admin/config.yml` **no necesita cambios**: ya tiene `backend: github`, `repo`, `base_url: <URL_WORKER>` y `auth_endpoint: auth`.

## Cambiar la contraseña

```powershell
cd cloudflare-oauth-worker
node hash-password.mjs | Set-Clipboard
Get-Clipboard | npx wrangler secret put PANEL_PASS_HASH
Set-Clipboard $null
```

Surte efecto al instante, sin redesplegar. Para cambiar el usuario, repite `PANEL_USER`. Para **cortar el acceso ya**, cambia la contraseña y, si hace falta, revoca el token en GitHub (Settings → Developer settings → Fine-grained tokens → Delete).

## Renovar el token antes de que venza

GitHub avisa por correo antes del vencimiento, pero anota la fecha. Para renovar: GitHub → Fine-grained tokens → abre `youthcoop-panel` → **Regenerate token** (misma configuración, nueva fecha), cópialo y:

```powershell
cd cloudflare-oauth-worker
Get-Clipboard | npx wrangler secret put GITHUB_REPO_TOKEN
```

Si el token vence, el síntoma es: el cliente entra al panel pero al guardar da error de permisos o «Bad credentials».

## Protecciones

- **Contraseña:** solo se guarda su hash PBKDF2-SHA256 con sal (100000 iteraciones). Se compara en tiempo constante; el usuario también (por huella SHA-256), y siempre se calculan las dos comprobaciones, así no se sabe cuál falló. Mensaje único: «Usuario o contraseña incorrectos».
- **Fuerza bruta:** pausa de 1 s tras cada intento fallido y **bloqueo de 15 minutos tras 5 fallos desde la misma IP** (`CF-Connecting-IP`), también para la contraseña correcta. Con el binding KV `LIMITES` el contador es compartido entre todas las instancias de Cloudflare (KV es de consistencia eventual: bajo un ataque muy paralelo pueden colarse unos intentos de más). **Sin KV** el contador vive en la memoria de cada instancia: sigue frenando, pero es de mejor esfuerzo (Cloudflare puede reiniciar o multiplicar instancias). La Cache API no sirve para esto en `*.workers.dev`. Por eso se recomienda el KV (gratis; unas pocas escrituras por intento fallido, muy por debajo del límite diario). Un ataque distribuido desde muchas IP no queda cubierto por el límite por IP; se mitiga con una contraseña larga y el retardo de PBKDF2.
- **CSRF:** el formulario lleva un token `nonce.vencimiento.firma` (HMAC-SHA256 con `SESSION_SECRET`, 10 minutos), atado a una cookie `HttpOnly; Secure; SameSite=Strict` con el mismo `nonce`, y **de un solo uso** (se marca usado en KV o, sin KV, en memoria). Además `POST /login` rechaza una cabecera `Origin` distinta del propio Worker.
- **Origen del panel:** `/auth` rechaza un `Referer` fuera de `ALLOWED_ORIGINS`; y la página de cierre solo envía el token por `postMessage` al origen que contesta el saludo **si está en `ALLOWED_ORIGINS`** (nunca a `"*"`; el saludo `authorizing:github` no lleva datos).
- **Cabeceras:** `Cache-Control: no-store`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. CSP del formulario: `default-src 'none'`, solo la hoja de estilos con *nonce* y Google Fonts (fuente Outfit), `form-action 'self'`, sin scripts. CSP de la página de cierre: solo su script con *nonce*.
- **Registros:** el Worker no escribe nada en logs (ni usuario, ni contraseña, ni token); hay una prueba que lo comprueba.

## Cómo funciona (por si hay que depurar)

1. El panel abre una ventana a `URL_WORKER/auth`. El Worker muestra el formulario con un token anti-CSRF y su cookie.
2. La persona escribe usuario y contraseña; el navegador hace `POST /login`.
3. El Worker valida CSRF, bloqueo, usuario y contraseña. Si todo está bien, responde una página que avisa al panel (`authorizing:github`), espera su respuesta y le envía `authorization:github:success:{"token":"…","provider":"github"}` solo al origen permitido, y se cierra.
4. Decap guarda el token en el navegador de esa persona y escribe en GitHub con él. El Worker no almacena el token de sesión.

## Probar

```powershell
cd cloudflare-oauth-worker
npm test        # pruebas unitarias del Worker y del script de hash (node --test, sin dependencias)
```

En local con `npx wrangler dev`: crea `.dev.vars` (ya está en `.gitignore`) con `PANEL_USER=…`, `PANEL_PASS_HASH=…`, `GITHUB_REPO_TOKEN=…` y `SESSION_SECRET=…` de **pruebas**, y añade `http://127.0.0.1:5175` a `ALLOWED_ORIGINS` solo mientras pruebas.

## Errores comunes

| Síntoma | Causa |
|---|---|
| «Worker sin configurar: faltan…» | Falta un secreto (`wrangler secret put`) o `ALLOWED_ORIGINS` vacío. |
| «PANEL_PASS_HASH no tiene el formato esperado» | El secreto no es la salida de `hash-password.mjs`, o tiene más de 100000 iteraciones. |
| «Origen no permitido» al abrir la ventana | `ALLOWED_ORIGINS` no incluye el origen real del panel (revisa `http` vs `https`, `www`). |
| La ventana se cierra y el panel no entra | Igual: el origen del panel no está en `ALLOWED_ORIGINS`; o el navegador bloqueó la ventana emergente. |
| «La página de acceso caducó» | Pasaron más de 10 minutos o se envió el formulario dos veces; escribir los datos de nuevo. |
| «Demasiados intentos fallidos» | 5 fallos seguidos desde esa IP: esperar 15 minutos. |
| El panel entra pero no puede guardar | El token venció o no tiene **Contents: Read and write** sobre `youthcoop-web`, o `repo` en `config.yml` está mal. |
