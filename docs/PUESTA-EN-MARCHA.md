# Puesta en marcha (para el técnico)

Qué se logra: la web en **GitHub Pages (gratis)**, con el dominio detrás de **Cloudflare**, y un panel `https://TUDOMINIO.com/admin/` desde el que el cliente cambia las **fotos y todos los textos** (en español e inglés) sin tocar archivos y sin poder crear ni borrar secciones ni páginas. Cada guardado del panel es un commit a `main`, que dispara el workflow y republica el sitio en 1 o 2 minutos.

Piezas (ya están en este repositorio):

| Pieza | Dónde |
|---|---|
| Panel (Decap CMS) | `public/admin/index.html` y `public/admin/config.yml` |
| Textos y ajustes de las 13 fotos | `content/fotos.json` |
| Textos editables (16 archivos: una por sección, `productos`, `ajustes`, `formulario`) | `content/textos/*.json` |
| Qué textos se pueden editar (lista blanca) y cómo se llaman en el panel | `scripts/textos-esquema.mjs` |
| Aplica los textos sobre `src/data/site.json` (idempotente, sanea el HTML) | `scripts/build-textos.mjs` |
| Regenera las colecciones de textos de `config.yml` y los archivos iniciales | `scripts/generar-panel-textos.mjs` (`npm run panel`) |
| Fotos originales que sube el cliente | `content/originales/` |
| Procesador de fotos (recorta y genera 480/800/1200 px) | `scripts/build-media.mjs` |
| Acceso al panel con usuario y contraseña (Worker de Cloudflare) | `cloudflare-oauth-worker/` |
| Publicación | `.github/workflows/deploy.yml` |

Lo que sigue son los pasos **manuales** (requieren tus cuentas). Reemplaza `OWNER/REPO` por usuario y repositorio reales y `TUDOMINIO.com` por el dominio.

## 1. Repositorio en GitHub

1. Crea el repositorio en GitHub. **Debe ser público**: el plan gratuito de GitHub Pages solo publica repositorios públicos. (Alternativa para tenerlo privado: ver el apartado «Si el repositorio debe ser privado».)
2. La rama principal debe llamarse `main` y **sin protección de rama que exija pull requests**: el panel guarda directo en `main`.
3. En esta carpeta, en PowerShell:

```powershell
git remote add origin https://github.com/OWNER/REPO.git   # si aún no existe
git add .
git commit -m "Sitio YOUTH COOP con panel de fotos y textos"
git branch -M main
git push -u origin main
```

(`public/media/fotos/` no se sube a propósito: lo genera el workflow desde `content/originales/`. Los textos sí se suben: `content/textos/` es donde el panel guarda lo que escribe el cliente.)

## 2. Activar GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.** El primer push ya habrá lanzado el workflow *Publicar en GitHub Pages*; si falló por no tener Pages activado, ejecútalo de nuevo en **Actions → Run workflow**.

## 3. Variable del formulario (Google Sheets)

**Settings → Secrets and variables → Actions → Variables → New repository variable**: nombre `VITE_FORM_ENDPOINT`, valor la URL `/exec` de Apps Script (ver `google-apps-script/README.md`). Es una dirección pública (queda en el JavaScript del sitio), por eso basta una *variable*; un *secreto* también funciona. Vuelve a ejecutar el workflow para que se incluya.

## 4. Crear el token de GitHub y desplegar el Worker (acceso con usuario y contraseña)

El cliente **no necesita cuenta de GitHub**: entra al panel con un usuario y una contraseña que valida el Worker de Cloudflare, y el Worker le entrega al panel un token de GitHub guardado como secreto. Sigue **`cloudflare-oauth-worker/README.md`** completo. En resumen:

1. **Token fine-grained de GitHub:** Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token. Nombre `youthcoop-panel`; *Expiration*: la máxima; *Repository access*: **Only select repositories → solo `youthcoop-web`**; *Permissions → Repository permissions*: **Contents: Read and write** (Metadata: Read-only queda solo). Cópialo al portapapeles (empieza con `github_pat_`; solo se muestra una vez). **Anota la fecha de vencimiento** y renueva el token antes (Regenerate token y volver a cargar el secreto; ver el README del Worker).
2. Revisa `ALLOWED_ORIGINS` en `cloudflare-oauth-worker/wrangler.toml` (`"https://TUDOMINIO.com"`, con y sin `www`).
3. (Recomendado) Crea el espacio KV del bloqueo por intentos: `npx wrangler kv namespace create LIMITES` y pega el `id` en `wrangler.toml`.
4. Carga los **4 secretos** desde PowerShell, en `cloudflare-oauth-worker` (no van en ningún archivo):

```powershell
cd cloudflare-oauth-worker
npx wrangler login
Get-Clipboard | npx wrangler secret put GITHUB_REPO_TOKEN                     # con el token en el portapapeles
Set-Clipboard "NOMBRE_DE_USUARIO"; Get-Clipboard | npx wrangler secret put PANEL_USER
node hash-password.mjs | Set-Clipboard                                          # pide la contraseña (oculta, mín. 12 caracteres) y deja su HASH en el portapapeles
Get-Clipboard | npx wrangler secret put PANEL_PASS_HASH
Set-Clipboard $null
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put SESSION_SECRET
npx wrangler deploy
```

5. Comprueba que `URL_WORKER/` responde «funcionando» y que `URL_WORKER/auth` muestra el formulario.
6. **Cambiar la contraseña** más adelante: `node hash-password.mjs | Set-Clipboard` y `Get-Clipboard | npx wrangler secret put PANEL_PASS_HASH` (efecto inmediato). **Renovar el token:** Regenerate token en GitHub y `Get-Clipboard | npx wrangler secret put GITHUB_REPO_TOKEN`.
7. Las pruebas del Worker: `cd cloudflare-oauth-worker` y `npm test`.

## 5. Completar `public/admin/config.yml`

Cambia solo dos líneas (están marcadas `# <-- COMPLETAR`):

```yaml
  repo: OWNER/REPO
  base_url: URL_WORKER        # p. ej. https://oauth.TUDOMINIO.com, sin barra final
```

`auth_endpoint: auth` ya está puesto y no hace falta cambiar nada más. Commit y push. Tras el despliegue (1 o 2 minutos), `https://TUDOMINIO.com/admin/` muestra el botón de entrar (el texto dice «Iniciar sesión con GitHub»: es el fijo de Decap; al pulsarlo se abre el formulario de usuario y contraseña del Worker).

## 6. Entregar el acceso al cliente

No hay que invitarlo a GitHub ni que cree cuenta. Entrégale, por un canal privado y por separado: la dirección `https://TUDOMINIO.com/admin/`, el **usuario** y la **contraseña** que definiste en el paso 4, y `docs/GUIA-CLIENTE.md` (cubre entrar, fotos y textos). Quién cambió qué sigue visible en el historial de commits del repositorio, pero todos los cambios del panel aparecen con el autor del token (no distingue personas): si más de una persona edita, comparten el mismo usuario.

## 7. Dominio en Cloudflare

1. En Cloudflare, con el dominio ya agregado (zona activa), **DNS → Add record**:
   - Para `www.TUDOMINIO.com`: tipo `CNAME`, nombre `www`, destino `OWNER.github.io`.
   - Para el dominio sin `www` (apex): tipo `CNAME`, nombre `@`, destino `OWNER.github.io` (Cloudflare lo aplana automáticamente). Alternativa: cuatro registros `A` a `185.199.108.153`, `185.199.109.153`, `185.199.110.153` y `185.199.111.153`.
   - Déjalos primero en **«Solo DNS» (nube gris)**.
2. En GitHub: **Settings → Pages → Custom domain**: escribe el dominio (el que será principal) y **Save**. Espera el «DNS check successful» y que GitHub emita el certificado (de minutos a una hora); luego marca **Enforce HTTPS**.
3. Ya con el certificado de GitHub, vuelve a Cloudflare y activa el proxy (**nube naranja**) en esos registros, y en **SSL/TLS → Overview** elige el modo **Full** (no «Flexible»: provoca bucles de redirección con GitHub Pages; «Full (strict)» también sirve una vez emitido el certificado de GitHub).
4. **Archivo `CNAME`:** con el origen en *GitHub Actions* no hace falta (el dominio queda guardado en Settings → Pages). Si prefieres versionarlo, crea `public/CNAME` con una sola línea, el dominio.
5. Cuando haya dominio, pon su dirección en `ALLOWED_ORIGINS` del Worker (paso 4) y vuelve a desplegar (`npx wrangler deploy`).

## 8. Comprobación final

1. Abre `https://TUDOMINIO.com/` (la web se ve igual que antes) y `https://TUDOMINIO.com/admin/` (aparece el panel).
2. Entra con el usuario y la contraseña del cliente, cambia una foto de prueba y un texto de prueba (p. ej. el título de «Inicio (portada)», en español y en inglés) y publica. En **Actions** aparece un nuevo *Publicar en GitHub Pages*; en 1 o 2 minutos el cambio se ve (Ctrl+F5).
3. Deshaz la prueba eligiendo la foto anterior y volviendo a escribir el texto anterior en el panel.

## Si el repositorio debe ser privado

GitHub Pages gratis no publica repositorios privados. Alternativa gratuita: **Cloudflare Pages** conectado al mismo repositorio (privado): framework *None*, comando de compilación `npm run build`, carpeta de salida `dist`, variable `NODE_VERSION=22` y `VITE_FORM_ENDPOINT`. En ese caso no se usa `deploy.yml` y el CNAME se configura en Cloudflare Pages (*Custom domains*); el token fine-grained funciona igual con un repositorio privado. El resto (panel, `build-media`, `content/`) funciona igual porque corre dentro de `npm run build`.

## Cómo funcionan los textos editables

1. El cliente edita en el panel; Decap guarda `content/textos/<archivo>.json` (un commit a `main`). Cada archivo trae SOLO texto: `hero.json`, `nosotros.json`, `productos.json`, `ajustes.json`… (los valores iniciales reproducen exactamente el sitio que había).
2. El workflow (y `npm run dev` / `npm run build`) corre `scripts/build-textos.mjs`, que copia esos textos a `src/data/site.json` **solo en los campos de la lista blanca** (`scripts/textos-esquema.mjs`). No toca ids, claves, enlaces, íconos, colores, posiciones, `visible`/`active`, fotos ni `notificaciones`. `vite.config.ts` además pone el título y la descripción SEO en el `index.html` compilado.
3. **Fuente de verdad:** en esos campos manda `content/textos/`; si editas a mano un texto de `site.json`, el siguiente build lo pisa con lo de `content/textos/`. Cambia el texto en el panel o en `content/textos/*.json`.
4. **Reglas de seguridad y robustez** (los avisos salen en el log del paso «Aplicar textos» como advertencias y **no** detienen la publicación; solo un JSON dañado la detiene, con un mensaje claro):
   - Un texto obligatorio vacío no borra nada: se conserva el anterior. El inglés vacío usa el español. Son opcionales (pueden quedar vacíos): la descripción SEO en inglés y el enlace de TikTok (vacío = oculto).
   - Las listas son de tamaño fijo: se emparejan por posición y, si un archivo trae otro número de ítems, esa lista se ignora (el panel tiene `allow_add`, `allow_remove` y `allow_reorder` en `false`, y `min`/`max` iguales al tamaño actual; en las etiquetas de los proyectos `min: 2, max: 3`, porque cada proyecto tiene una cantidad distinta).
   - Un campo que no esté en la lista blanca se ignora con aviso. El HTML se sanea con una lista blanca propia: solo `<br>`, `<em>`, `<strong>`, `<b>` y `<span class="pendiente">` (sin atributos); `<script>`, `onerror`, enlaces, estilos, etc. se eliminan. El sitio vuelve a sanear con DOMPurify al pintar. El cliente usa marcas simples: Enter = salto, `**negrita**`, `*cursiva*`. Los textos que se muestran como texto crudo (nombre y puntaje de cada café, certificaciones, correo, RUC…) no admiten marcas.
   - Los campos «pendiente» (cifra de familias `[000]`, altitud, variedades, cosecha, dato de impacto de Cacao Bosque+, genética del cacao) se publican solos cuando el cliente escribe el dato real sin corchetes (`pendiente` pasa a `false`); con `[...]` vuelven a ocultarse. TikTok se publica cuando tiene enlace.
   - Datos derivados que se mantienen solos: el enlace de la red WhatsApp (`https://wa.me/<número>`), el botón «Síguenos en LinkedIn» (sigue a la red LinkedIn) y `settings.site.title/description` (copia del SEO en español).
5. **Qué NO es editable desde el panel** (a propósito): estructura (secciones, páginas, orden, `visible`), ítems de listas (agregar/quitar), enlaces y destinos (`href`, `embed_url`), colores/tema, íconos y logos, fotos (tienen su propio flujo), las cifras de las barras de los cafés, los números del formulario (gramos), la lista de países (43, con su región y `value`; son estructura del formulario), las publicaciones de LinkedIn y `notificaciones`.

## Mantenimiento

- **Agregar o quitar un texto editable:** cambia `scripts/textos-esquema.mjs`, ejecuta `npm run panel -- --inicial` (regenera `public/admin/config.yml` entre las marcas «TEXTOS (generado)» y crea los archivos de `content/textos/` que falten a partir de `site.json`; los que ya existen **no se pisan**, para no perder lo que editó el cliente; `--forzar` los sobrescribe con los de `site.json`) o `npm run panel` (solo `config.yml`). `npm run panel -- --check` solo comprueba (lo ejecutan las pruebas). El bloque generado no se edita a mano.
- **Estética del editor:** `public/admin/index.html` lleva un `<style>` que muestra Español / Inglés en dos columnas. Si al actualizar Decap dejara de aplicarse, el panel sigue funcionando (los dos cuadros quedan uno debajo del otro).

- **Probar el panel en tu computador sin tocar GitHub:** en una terminal `npx decap-server` (en la raíz del proyecto) y en otra `npm run dev`; abre `http://127.0.0.1:5175/admin/index.html` (en `npm run dev` hay que escribir el `index.html`; `local_backend: true` solo actúa en localhost). Los cambios se guardan en tus archivos locales (fotos en `content/`, textos en `content/textos/`; para verlos en el sitio, `npm run textos` o reinicia `npm run dev`).
- **Procesar las fotos a mano:** `npm run media` (también corre solo en `npm run dev` y `npm run build`). Es rápido y no repite lo que no cambió. Si una foto está mal (no es imagen, ruta rota) falla con un mensaje claro y **el sitio publicado no se toca**.
- **Fotos viejas:** cada foto que sube el cliente queda en `content/originales/` (así puede volver a una anterior). `npm run media` avisa de las que ya no se usan; si el repositorio crece mucho (GitHub recomienda menos de 1 GB), bórralas con un commit.
- **Video:** copia tal cual el `.mp4`. Recomendado hasta **20 MB**; GitHub rechaza archivos de más de **100 MB** y el script se detiene con un aviso si se supera.
- **Pruebas:** `cd tests`, `npm install`, `npm run test:media` (procesador de fotos, en una copia temporal), `npm run test:textos` (textos: idempotencia, lista blanca, saneado, vacíos, pendientes, coherencia con `config.yml`) y `npm run test:e2e` (sitio, subruta, formulario, panel, textos renderizados).
- **Actualizar Decap CMS:** en `public/admin/index.html` cambia la versión de la URL y recalcula la huella SRI:

```powershell
node -e "fetch('https://unpkg.com/decap-cms@NUEVA.VERSION/dist/decap-cms.js').then(r=>r.arrayBuffer()).then(b=>console.log('sha384-'+require('crypto').createHash('sha384').update(Buffer.from(b)).digest('base64')))"
```

  Pega el resultado en `integrity`. Prueba el panel antes de publicar.
- **Quitar acceso al cliente:** cambiar la contraseña (`PANEL_PASS_HASH`, efecto inmediato). Para cortar también las sesiones ya abiertas, revocar el token en GitHub (Fine-grained tokens → Delete) y crear otro.

## Problemas frecuentes

| Síntoma | Qué mirar |
|---|---|
| El panel dice que no encuentra el repositorio o da «Bad credentials» al guardar | `repo:` en `config.yml` mal escrito, o `GITHUB_REPO_TOKEN` venció / no tiene Contents: Read and write sobre `youthcoop-web` (renovarlo, ver README del Worker). |
| La ventana de login se cierra y no entra | `ALLOWED_ORIGINS` del Worker no incluye exactamente el origen del panel (`https`, con o sin `www`), o el navegador bloqueó la ventana emergente. |
| «Demasiados intentos fallidos» | Bloqueo de 15 minutos por 5 fallos desde esa IP; esperar. |
| Guardó pero la web no cambia | **Actions**: ¿falló el workflow? El log de «Procesar fotos» dice qué foto tiene el problema. Si pasó, recargar con Ctrl+F5 (hasta ~10 minutos de caché en casos raros). |
| Error de redirecciones en el dominio | Cloudflare en modo SSL «Flexible»: cambiar a «Full». |
| Guardó un texto pero la web no cambia | **Actions → paso «Aplicar textos»**: ¿hay una advertencia? Dice qué campo se rechazó y por qué (texto vacío, demasiado largo, falta `{n}`/`{total}`/`{email}`, enlace inválido, lista con otro tamaño). El resto de cambios sí se publicó. |
| Foto borrosa | Se subió una de menos de 1200 px de ancho; el procesador avisa en el log y no la agranda. |
