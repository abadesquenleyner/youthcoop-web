# YOUTH COOP · sitio público (copia estática)

Copia **estática** del sitio público de YOUTH COOP: React 18 + Vite 5 + TypeScript, **sin backend y sin base de datos** (las fotos y los textos se cambian desde un panel `/admin` que edita el repositorio, ver más abajo). Se compila a archivos HTML/JS/CSS y se publica gratis en **GitHub Pages**. El formulario de muestras y cotización guarda cada solicitud como una fila en **Google Sheets** mediante Google Apps Script (ver [`google-apps-script/README.md`](./google-apps-script/README.md)).

El diseño es el de la plantilla original (`template.css` es una copia literal y **no se edita**): con los datos de la plantilla la página es idéntica píxel a píxel a la plantilla en 1440 y 390 px (comprobado por las pruebas).

- Página única con anclas (`#contacto`, `#oferta`…), sin router.
- Contenido en un solo archivo: [`src/data/site.json`](./src/data/site.json); las 13 fotos se gestionan aparte en [`content/fotos.json`](./content/fotos.json) y **los textos** (ES/EN) en [`content/textos/`](./content/textos/), ambos desde el panel `/admin` (guías: [`docs/GUIA-CLIENTE.md`](./docs/GUIA-CLIENTE.md) y [`docs/PUESTA-EN-MARCHA.md`](./docs/PUESTA-EN-MARCHA.md)).
- `vite.config.ts` usa `base: './'`: el mismo build funciona en la raíz o en cualquier subruta (`https://usuario.github.io/youthcoop/`) sin cambiar nada.

## Requisitos

Node.js 20 o superior (se probó con 22) y npm.

## Correr en local

```bash
npm install
cp .env.example .env.local      # opcional: pon aquí VITE_FORM_ENDPOINT (ver «Conectar Google Sheets»)
npm run dev                     # http://127.0.0.1:5175
```

Sin `VITE_FORM_ENDPOINT` el sitio funciona, pero al enviar el formulario muestra un aviso de error («el envío todavía no está conectado…») y **no envía ni finge éxito**.

## Compilar

```bash
npm run build      # tsc --noEmit + vite build  ->  dist/
npm run preview    # sirve dist/ en http://127.0.0.1:4175
```

No abras `dist/index.html` con doble clic (los módulos ES no cargan desde `file://`): usa `npm run preview` o cualquier servidor estático.

## Publicar en GitHub Pages (paso a paso)

1. Crea un repositorio vacío en GitHub (por ejemplo `youthcoop`). La rama principal debe llamarse `main` (si usas otra, cámbiala en `.github/workflows/deploy.yml`).
2. En esta carpeta: `git init`, `git add .`, `git commit -m "Sitio YOUTH COOP"`, `git branch -M main`, `git remote add origin https://github.com/USUARIO/youthcoop.git`, `git push -u origin main`.
3. En GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. (Cuando tengas la URL del formulario) **Settings → Secrets and variables → Actions** → crea el secreto o la variable `VITE_FORM_ENDPOINT` con la URL `/exec` de Apps Script.
5. Cada `git push` a `main` ejecuta [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml): instala (`npm ci`), compila con Node 22 y publica `dist/`. También se puede lanzar a mano en **Actions → Publicar en GitHub Pages → Run workflow**.
6. El sitio queda en `https://USUARIO.github.io/youthcoop/`. Para un dominio propio: **Settings → Pages → Custom domain** (no hace falta tocar el código).

Si el workflow se publica sin `VITE_FORM_ENDPOINT`, aparece una advertencia en el log y el formulario mostrará el error de «no conectado» hasta que lo configures y vuelvas a ejecutar el workflow.

## Conectar Google Sheets (formulario)

Resumen (el detalle está en [`google-apps-script/README.md`](./google-apps-script/README.md)):

1. Crea una hoja de Google y en *Extensiones → Apps Script* pega [`google-apps-script/Code.gs`](./google-apps-script/Code.gs).
2. *Implementar → Nueva implementación → Aplicación web*, **Ejecutar como: Yo**, **Acceso: Cualquier persona**. Copia la URL que termina en `/exec`.
3. Pégala en `VITE_FORM_ENDPOINT` (`.env.local` en tu máquina; secreto/variable del repositorio en GitHub) y recompila/vuelve a publicar.

Cómo viaja la solicitud: `POST` con `Content-Type: text/plain` y el cuerpo en JSON (así el navegador no hace petición previa CORS). Lleva un `id` (uuid) por envío para que la hoja no duplique si hay reintentos, y el campo trampa `website` (siempre vacío para personas).

## Cómo editar el contenido (`src/data/site.json`)

`site.json` tiene la misma forma que devolvía `GET /api/v1/public/site` en la versión con backend, ya resuelta. Los textos de las 13 secciones, de los 5 productos y de los ajustes de contacto/SEO/legales se editan desde el panel `/admin` (ver «Cambiar los textos»); las **fotos** también (ver «Cambiar las fotos»). `site.json` sigue siendo lo que lee el sitio, pero **en los campos de texto editables manda `content/textos/`**: `scripts/build-textos.mjs` los copia a `site.json` en cada `dev`/`build`/workflow (si cambias a mano uno de esos textos en `site.json`, el siguiente build lo pisa). Todo lo demás (ids, enlaces, íconos, colores, orden, `visible`…) sí se edita en `site.json`. El script de fotos reescribe en `site.json` solo las entradas `media` de los 13 huecos y sus enlaces.

| Clave | Qué contiene |
|---|---|
| `settings.site` | título, descripción, `ocultar_pendientes` (ver abajo) |
| `settings.seo` | título y descripción por idioma |
| `settings.contacto` | correos, WhatsApp, direcciones, redes sociales |
| `settings.formulario` | gramos mín/máx/paso, incoterms, campos por región (EORI/EIN/Tax ID), mensajes de validación, de éxito y de error |
| `settings.legal` | razón social y RUC del pie |
| `settings.tema` | los 12 colores (`--marron`, `--naranja`…); vacío = el de la plantilla; solo se aceptan hex válidos |
| `sections` | las 13 secciones (`header, hero, cifras, nosotros, modelo, proyectos, oferta, calidad, trazabilidad, galeria, novedades, contacto, footer`); el orden es `position`; `visible: false` oculta una sección entera |
| `products` | las 3 líneas de café y las 2 fichas de cacao |
| `sample_options` | los 8 productos que se pueden pedir en el formulario |
| `countries` | los 43 países y su región (`eori`, `us`, `otro`) |
| `media` | los archivos de imagen (`url`, `alt` ES/EN, `srcset`…); se enlazan por número desde `media_id` |

Reglas del contenido:

- **Texto bilingüe**: `{ "es": "…", "en": "…" }`. Un texto suelto (`"…"`) se muestra igual en ambos idiomas.
- **HTML en los textos**: solo `<br> <em> <strong> <b> <span class="…">`; todo lo demás se elimina.
- **Ítems de listas**: cada uno lleva `id` único y `visible`; poner `"visible": false` lo oculta.
- **Pendientes**: lo marcado `"pendiente": true` (cifra de familias, altitud/variedades/cosecha, logos de certificaciones, TikTok, publicaciones de LinkedIn…) **no se muestra** mientras `settings.site.ocultar_pendientes` sea `true` (valor actual, el de producción). Con `false` aparece tal como en la plantilla, con sus marcadores `[000]`, «FOTO», etc.
- **Mensajes del formulario**: `settings.formulario.mensajes` (`exito`, `error_envio`, `sin_endpoint`, `completa`, `campos`…).

### Cambiar los textos (panel `/admin` y `content/textos/`)

Desde el panel (colecciones **Textos por sección**, **Productos** y **Contacto y ajustes**) el cliente edita, en español e inglés, todo el texto del sitio **sin poder crear ni borrar secciones, páginas ni ítems de lista**. Guía para el cliente: [`docs/GUIA-CLIENTE.md`](./docs/GUIA-CLIENTE.md); funcionamiento y mantenimiento: «Cómo funcionan los textos editables» en [`docs/PUESTA-EN-MARCHA.md`](./docs/PUESTA-EN-MARCHA.md).

- **Archivos** (`content/textos/`, 16, solo texto, con los valores actuales del sitio): `header`, `hero`, `cifras`, `nosotros`, `modelo`, `proyectos`, `oferta`, `calidad`, `trazabilidad`, `galeria`, `novedades`, `contacto`, `footer` (las 13 secciones), `productos` (3 cafés y 2 fichas de cacao), `ajustes` (correos, WhatsApp, direcciones, redes, título/descripción SEO, razón social y RUC) y `formulario` (avisos y etiquetas de opciones).
- **Lista blanca:** [`scripts/textos-esquema.mjs`](./scripts/textos-esquema.mjs) define qué campos se pueden editar y cómo se llaman en el panel; [`scripts/build-textos.mjs`](./scripts/build-textos.mjs) (corre en `predev`, `prebuild` y en el workflow, `npm run textos`) los fusiona en `site.json` y nada más. Es idempotente; un texto obligatorio vacío conserva el anterior (con aviso); el HTML se sanea (solo `<br> <em> <strong> <b>`, y las marcas sencillas Enter / `**negrita**` / `*cursiva*`).
- **Panel:** las tres colecciones de `public/admin/config.yml` se **generan** desde el esquema con `npm run panel` (no se editan a mano; `npm run panel -- --check` comprueba que están al día).
- **No editable desde el panel (a propósito):** estructura, ids, enlaces y destinos, íconos, colores, fotos (otro flujo), barras de los cafés, gramos del formulario, lista de países, publicaciones de LinkedIn y `notificaciones`.

### Cambiar las fotos (panel `/admin` y `content/fotos.json`)

Las 13 fotos ya **no se editan en `site.json`**: salen de [`content/fotos.json`](./content/fotos.json) y de los originales en [`content/originales/`](./content/originales/). El script [`scripts/build-media.mjs`](./scripts/build-media.mjs) (corre solo en `npm run build`, `npm run dev` y en el workflow) recorta cada original a la proporción de su hueco con el punto focal, genera las variantes WebP de 480/800/1200 px en `public/media/fotos/` (carpeta generada, fuera de git; el nombre lleva un hash para que la caché de Cloudflare nunca sirva una foto vieja) y reescribe la entrada `media` y el enlace del hueco en `site.json`. Es idempotente: no regenera lo que no cambió.

- **Quien administra el sitio** usa el panel `https://TUDOMINIO.com/admin/` (Decap CMS, sin tocar archivos): guía en [`docs/GUIA-CLIENTE.md`](./docs/GUIA-CLIENTE.md).
- **Quien pone en marcha el sitio** (repositorio, Pages, OAuth App, Worker de Cloudflare, dominio): [`docs/PUESTA-EN-MARCHA.md`](./docs/PUESTA-EN-MARCHA.md). El Worker está en [`cloudflare-oauth-worker/`](./cloudflare-oauth-worker/README.md).
- **Por archivos:** copia la imagen original (JPG, PNG o WebP, cualquier tamaño) a `content/originales/`, apunta a ella en el hueco de `content/fotos.json` (`"imagen": "/content/originales/mifoto.jpg"`), ajusta `alt` ES/EN, `leyenda` y `focal_x`/`focal_y` (0 a 100, vacío = 50) y ejecuta `npm run media`. En el hueco de la galería 6, `"video"` (.mp4, recomendado ≤ 20 MB; GitHub rechaza más de 100 MB) tiene prioridad sobre `"imagen"`, que hace de póster.
- Proporciones: hero 4:5, nosotros y galería 4:3, proyectos 16:10, cacao 16:9 (están en `scripts/build-media.mjs`). Nunca agranda: con originales de menos de 1200 px de ancho avisa y publica el tamaño real.

Huecos de foto y estado actual (la ruta en `site.json` es solo informativa: la rellena el script):

| Hueco | Ruta en `site.json` | Estado |
|---|---|---|
| Hero | `sections → hero → content.foto` | con foto |
| Nosotros | `sections → nosotros → content.foto` | con foto (equipo en la oficina) |
| Proyectos 1, 2 y 3 | `sections → proyectos → content.items[0..2].foto` | con foto (el 3: secado de café, sin menores) |
| Cacao en grano | `products → cocoa-beans → data.foto` | con foto |
| Derivados de cacao | `products → cocoa-products → data.foto` | con foto aproximada (cacao seco en grano) |
| Galería 1 a 5 | `sections → galeria → content.fotos[0..4]` | con foto |
| Galería 6 | `sections → galeria → content.fotos[5]` | con **video** (`kind: "video"` + `poster`; fachada de la sede) |

Los 13 huecos tienen medio; ninguno queda vacío. Varias son fotos aproximadas (ver «Datos pendientes del cliente»). Las leyendas de `site.json` describen lo que se ve; las originales de la plantilla (que no hay que mostrar con foto) están en `tests/plantilla-fotos.json`, y las pruebas visuales las restauran solas.

El hueco de **video** (galería 6) copia el `.mp4` tal cual (H.264, ≤720p; recomendado ≤ 20 MB) y usa una foto como póster; en el video el recorte 4:3 lo hace el navegador con `object-position` (`focal_x`/`focal_y`, hoy 58/50).

### Título de la pestaña

`settings.site.title` y `settings.seo.es/en.title` conservan «**v5**» y «**(Copy)**» de la plantilla. Edítalos antes de publicar, en el panel (**Contacto y ajustes → Contacto, buscadores y datos legales**). Al compilar, `vite.config.ts` copia el título y la descripción en español al `<title>` y a la meta descripción del `index.html` publicado (lo que ven Google y las vistas previas antes de cargar el JavaScript); el `index.html` del repositorio solo es el respaldo.

## Pruebas

Las pruebas viven en `tests/` (paquete aparte, no se instalan al compilar el sitio):

```bash
cd tests
npm install
npx playwright install chromium     # solo la primera vez
npm run test:script                 # Code.gs con simulacros de Google (Node)
npm run test:media                  # scripts/build-media.mjs en una copia temporal (recorte con foco, EXIF, idempotencia, errores)
npm run test:textos                 # scripts/build-textos.mjs en una copia temporal (idempotencia, lista blanca, saneado, vacíos, pendientes, config.yml al día)
npm run test:e2e                    # Playwright: procesa las fotos, compila 4 builds y los prueba
```

`npm run test:e2e` cubre:

- **Visual**: con los datos de la plantilla (sin las 13 fotos, con las leyendas y medidas originales de `tests/plantilla-fotos.json` y con `ocultar_pendientes=false`, derivados de `site.json`) la página es idéntica píxel a píxel a `reference/original.html` en 1440 y 390 px, ES, tema claro. Necesita la plantilla original (carpeta hermana `../youthcoop/reference/original.html`); si está en otro sitio, define `REFERENCIA_HTML`. Sin ella, esas dos pruebas se omiten.
- **Subruta**: servido bajo `/youthcoop/` (servidor que imita GitHub Pages: todo lo que esté fuera de la subruta da 404) y en la raíz con `vite preview`: cargan las 12 fotos y el video con su póster (menos de 10 MB, `video/mp4`), las 36 variantes existen, no queda ningún hueco vacío, ningún recurso propio da 404, no hay llamadas a `/api` ni rutas `/admin`.
- **Textos** (`textos.spec.ts`): en una copia temporal se cambian ES y EN en `content/textos/hero.json` (y otros), se aplica `build-textos`, se compila y se comprueba en el navegador que aparecen en la página (y en el `<title>`), que `<script>`/`onerror` no llegan y que la cifra «pendiente» se publica al escribir el dato.
- **Panel `/admin`** (`admin.spec.ts`): se publica bajo la subruta con `config.yml` válido y los 13 huecos, los originales y `content/fotos.json` no se publican, Decap carga desde el CDN (versión fija con SRI) y pide iniciar sesión sin errores (se omite si no hay acceso a `unpkg.com`).
- **Formulario**: sin `VITE_FORM_ENDPOINT` muestra el error y no envía; con endpoint simulado verifica el payload de muestras (UE con EORI, EE. UU. con EIN, otro país con Tax ID) y de cotización, botón deshabilitado durante el envío, `id` reutilizado en reintentos, respuestas inválidas o que no son JSON, y el flujo `POST → 302 → JSON` sin petición previa CORS.

## Estructura

```
index.html                  entrada (título, descripción, fuente Outfit de Google Fonts)
vite.config.ts              base './' y alias del archivo de datos
.env.example                VITE_FORM_ENDPOINT (sin valor)
src/
  main.tsx                  monta el sitio con los datos horneados
  data/site.json            TODO el contenido (se edita aquí)
  data/site.ts              lo ordena por `position` y lo tipa
  public/                   el sitio (secciones, componentes, template.css, extras.css)
  shared/                   tipos, texto con HTML saneado (DOMPurify), íconos, url.ts (solo enlaces seguros), envio.ts (formulario -> Apps Script)
public/media/               logos; public/media/fotos/ lo genera scripts/build-media.mjs (fuera de git)
public/admin/               panel Decap CMS (index.html + config.yml; las colecciones de textos están generadas)
content/                    fotos.json (13 huecos), originales/ (lo que sube el editor) y textos/ (16 archivos de texto ES/EN)
scripts/build-media.mjs     originales -> variantes 480/800/1200 + enlaces en site.json
scripts/build-textos.mjs    content/textos -> src/data/site.json (solo campos de la lista blanca, saneado)
scripts/textos-esquema.mjs  lista blanca de textos editables y sus nombres en el panel
scripts/textos-lib.mjs      marcas sencillas y saneado de HTML
scripts/generar-panel-textos.mjs  genera las colecciones de textos de public/admin/config.yml (npm run panel)
cloudflare-oauth-worker/    Worker de inicio de sesión con GitHub para el panel
docs/                       GUIA-CLIENTE.md y PUESTA-EN-MARCHA.md
google-apps-script/         Code.gs y su README
.github/workflows/deploy.yml
tests/                      Playwright + prueba de Code.gs
```

## Qué cambió respecto al sitio con backend

- Los datos salen de `src/data/site.json` (antes `GET /api/v1/public/site`); se quitó el panel `/admin` de la versión con backend (hoy hay otro, estático: Decap CMS para las fotos y los textos), el router, la vista previa `?preview=1`, las llamadas a `/api` y el modo seed.
- El envío del formulario pasa de `POST /api/v1/requests` (con cabecera `Idempotency-Key`) a un `POST` text/plain a Google Apps Script con `id` en el cuerpo; cada producto lleva además su nombre (`label`) para que la hoja sea legible. Se añadió el aviso «sin_endpoint» cuando falta `VITE_FORM_ENDPOINT`.
- Los 13 huecos tienen medio (`seed/photo_assignments.json`, todos «asignada»): 12 fotos (originales en `content/originales/`, variantes generadas en `public/media/fotos/`) con `srcset` 480/800/1200 y texto alternativo ES/EN, y un video con póster (galería 6).
- Los correos están apagados (`notificaciones.correo_activo: false`); el sitio no envía ninguno.

## Datos pendientes del cliente

Lo siguiente **no se inventó**: está oculto (`ocultar_pendientes: true`) o vacío hasta que el cliente lo entregue.

- **Título y descripción SEO**: quitar «v5» y «(Copy)»; descripción en inglés (hoy usa la española).
- **Cifras y ficha**: número de familias productoras; altitud (msnm), variedades y meses de cosecha; dato de impacto de Cacao Bosque+; genética del cacao en grano.
- **Certificaciones**: los 5 logos oficiales (Orgánico UE, NOP, COR, RTPO, Fairtrade).
- **Redes**: enlace de TikTok (hoy `#`, oculto).
- **LinkedIn**: las 3 publicaciones a incrustar (URL `https://www.linkedin.com/embed/…`).
- **Fotos aproximadas (ya no hay huecos vacíos, pero conviene reemplazarlas por las pedidas)**: Nosotros (socios fundadores con sus padres; hoy el equipo en la oficina), Derivados de cacao (licor, manteca, polvo, nibs; hoy cacao seco en grano), Galería 2 (cata en laboratorio; hoy una cata en finca), 3 (calado de sacos; hoy revisión de pergamino), 5 (almacén de Lima; hoy un almacén de acopio) y 6 (contenedor de exportación; hoy un video de la fachada de la sede).
- **Video de la galería**: el portón de la fachada dice «Corporación Agroindustrial de Jóvenes», no YOUTH COOP; confirmar la relación entre ambas marcas antes de publicar.
- **Foto del hero**: la elegida no muestra cerezas maduras en la mano ni luz de mañana (era lo pedido); conviene una toma nueva.
- **Foto «Tierra de Jóvenes y Mujeres»**: se usa una de secado con dos adultos (sin menores); no muestra a «productoras y jóvenes» en plural ni lleva el logo del proyecto. La del bebé (`fotos-youth-coop-2--087`) quedó descartada hasta tener la autorización de imagen.
- **Textos nuevos a revisar**: mensajes de éxito, de error de envío y de «formulario no conectado» (`settings.formulario.mensajes`).
- **Reglas regulatorias del formulario** (EORI obligatorio en UE y Reino Unido; EIN/Tax ID opcionales): validarlas con el responsable.
- **Favicon**: el proyecto de origen no tiene el del cliente (solo el de Phoenix por defecto, que no se copió); entregar un favicon e incluirlo en `index.html`.
- **Fuente oficial** (HarmonyOS Sans): hoy se usa «Outfit» desde Google Fonts como sustituto.
- **Política de privacidad y retención** de los datos que guarda la hoja de Google.
- **Cuenta de Google** que será dueña de la hoja y del script.

## Notas técnicas

- Dependencias en tiempo de ejecución: `react`, `react-dom` y `dompurify`. Las fuentes (Outfit) se piden a Google Fonts.
- `npm audit` avisa de una vulnerabilidad de `vite`/`esbuild` que afecta **solo al servidor de desarrollo** (`npm run dev`), no al sitio publicado; se mantiene Vite 5 para conservar el mismo resultado de compilación que el proyecto original.
