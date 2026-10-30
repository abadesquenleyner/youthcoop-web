# Worker de inicio de sesión con GitHub (para el panel `/admin`)

Pequeño Worker de Cloudflare (plan gratuito) que permite que el panel de fotos (Decap CMS) inicie sesión con una cuenta de GitHub. Es el proxy OAuth estándar de Decap/Netlify CMS: dos rutas, `/auth` y `/callback`. No guarda nada y no tiene base de datos.

**No hay secretos en estos archivos.** El Client ID y el Client Secret de la OAuth App se cargan como secretos del Worker (paso 4).

## Procedimiento exacto

Necesitas: cuenta de Cloudflare (gratis), cuenta de GitHub dueña del repositorio y Node.js 20+ (para `npx wrangler`).

### 1. Decidir la dirección del Worker

- **Opción simple:** la dirección que da Cloudflare, `https://youthcoop-decap-oauth.TU-USUARIO.workers.dev`. No hace falta tocar el dominio.
- **Opción con dominio propio:** `https://oauth.TUDOMINIO.com` (el dominio ya debe estar en tu cuenta de Cloudflare). Descomenta `routes` en `wrangler.toml` y pon `oauth.TUDOMINIO.com`.

Llamaremos `URL_WORKER` a la elegida (sin barra final).

### 2. Crear la OAuth App en GitHub

GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**:

| Campo | Valor |
|---|---|
| Application name | `YOUTH COOP panel de fotos` |
| Homepage URL | `https://TUDOMINIO.com` |
| Authorization callback URL | `URL_WORKER/callback` (por ejemplo `https://oauth.TUDOMINIO.com/callback`) |

Pulsa **Register application**, luego **Generate a new client secret**. Copia el **Client ID** y el **Client Secret** (el secreto solo se muestra una vez). No los pegues en ningún archivo ni en el chat.

> Si el repositorio es de una organización, la organización debe permitir la OAuth App (Settings de la organización → Third-party access) o la persona verá un aviso de acceso restringido al iniciar sesión.

### 3. Configurar `wrangler.toml`

Edita solo la sección `[vars]`:

- `ALLOWED_ORIGINS`: el origen desde el que se abre el panel, por ejemplo `"https://TUDOMINIO.com"` (con coma si usas también `https://www.TUDOMINIO.com` o la dirección `https://OWNER.github.io`). Sin ruta ni barra final. Solo estos orígenes reciben el token.
- `GITHUB_SCOPE`: `public_repo` (repositorio público) o `repo` (privado).

### 4. Desplegar y cargar los secretos

Desde esta carpeta, en PowerShell:

```powershell
cd cloudflare-oauth-worker
npx wrangler login                              # abre el navegador para autorizar la cuenta de Cloudflare
npx wrangler deploy                             # publica el Worker; al final imprime su URL
npx wrangler secret put GITHUB_CLIENT_ID        # pega el Client ID y Enter
npx wrangler secret put GITHUB_CLIENT_SECRET    # pega el Client Secret y Enter
```

(Los secretos se escriben en una entrada oculta; no quedan en el historial ni en archivos. Con el Worker ya desplegado, `secret put` los activa al instante, no hace falta volver a desplegar.)

### 5. Comprobar

- Abre `URL_WORKER/`: debe decir «Proxy OAuth de GitHub para Decap CMS: funcionando.».
- Abre `URL_WORKER/auth`: debe llevarte a la página de GitHub para autorizar (si dice «Worker sin configurar: faltan…», falta un secreto o `ALLOWED_ORIGINS`).

### 6. Conectar el panel

En `public/admin/config.yml` del sitio pon:

```yaml
backend:
  repo: OWNER/REPO            # usuario o organización / nombre del repositorio
  base_url: URL_WORKER        # sin barra final
  auth_endpoint: auth
```

Haz commit y push a `main`; en 1 o 2 minutos el panel de `https://TUDOMINIO.com/admin/` ya permite entrar con GitHub.

## Cómo funciona (por si hay que depurar)

1. El panel abre una ventana a `URL_WORKER/auth`. El Worker crea un valor aleatorio (`state`), lo guarda en una cookie `HttpOnly` de 10 minutos y redirige a GitHub.
2. GitHub pide a la persona que inicie sesión y autorice, y vuelve a `URL_WORKER/callback?code=…&state=…`.
3. El Worker comprueba que el `state` coincide con la cookie, cambia el `code` por un token de acceso (usando el Client Secret) y devuelve una página que le entrega el token al panel con `postMessage`, **solo** a un origen listado en `ALLOWED_ORIGINS`.
4. El token queda en el navegador de la persona (como cualquier sesión) y el Worker no lo almacena.

Para revocar el acceso de una persona: quitarla como colaboradora del repositorio (el token deja de poder escribir) o, en GitHub → Settings → Applications, revocar la OAuth App.

## Probar en local (opcional)

Crea un archivo `.dev.vars` en esta carpeta (ya está en `.gitignore`) con `GITHUB_CLIENT_ID=…` y `GITHUB_CLIENT_SECRET=…` de una OAuth App de pruebas cuyo callback sea `http://127.0.0.1:8787/callback`, y ejecuta `npx wrangler dev`.

## Errores comunes

| Síntoma | Causa |
|---|---|
| «Worker sin configurar: faltan…» | Falta un secreto (`wrangler secret put`) o `ALLOWED_ORIGINS` vacío. |
| GitHub: «redirect_uri is not associated with this application» | El *Authorization callback URL* de la OAuth App no es exactamente `URL_WORKER/callback`. |
| La ventana de inicio de sesión se cierra y el panel no entra | `ALLOWED_ORIGINS` no incluye el origen real desde el que se abrió `/admin` (revisa `http` vs `https`, `www`). |
| «La sesión de inicio expiró o no es válida» | Pasaron más de 10 minutos, o el navegador bloquea cookies del dominio del Worker. Reintentar. |
| El panel entra pero no puede guardar | La cuenta no es colaboradora del repositorio con permiso **Write**, o `repo` en `config.yml` está mal. |
