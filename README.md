# YOUTH COOP · sitio público (copia estática)

Copia **estática** del sitio público de YOUTH COOP: React 18 + Vite 5 + TypeScript, **sin backend, sin base de datos y sin panel de administración**. Se compila a archivos HTML/JS/CSS y se publica gratis en **GitHub Pages**. El formulario de muestras y cotización guarda cada solicitud como una fila en **Google Sheets** mediante Google Apps Script (ver [`google-apps-script/README.md`](./google-apps-script/README.md)).

El diseño es el de la plantilla original (`template.css` es una copia literal y **no se edita**): con los datos de la plantilla la página es idéntica píxel a píxel a la plantilla en 1440 y 390 px (comprobado por las pruebas).

- Página única con anclas (`#contacto`, `#oferta`…), sin router.
- Contenido en un solo archivo: [`src/data/site.json`](./src/data/site.json).
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

`site.json` tiene la misma forma que devolvía `GET /api/v1/public/site` en la versión con backend, ya resuelta. No hay panel: se edita el archivo, se hace `git push` y el workflow publica.

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

### Poner una foto en un hueco

1. Prepara la imagen en WebP en tres anchos (por ejemplo 480, 800 y 1200 px de ancho, ya recortada a la proporción del hueco) y cópialas a `public/media/` (`mifoto-480.webp`, `mifoto-800.webp`, `mifoto-1200.webp`).
2. En `media` agrega una entrada con un número nuevo, copiando una existente: `url` (la de 1200 px), `width`/`height`, `alt: {es, en}` (describe lo que se ve, breve), `focal_x`/`focal_y` (50/50 si ya está recortada) y `srcset` con las tres. Las rutas van **sin barra inicial** (`media/mifoto-800.webp`).
3. En el hueco (`foto`) pon `"media_id": <número>` y `"pendiente": false`.

Huecos de foto y estado actual:

| Hueco | Ruta en `site.json` | Estado |
|---|---|---|
| Hero | `sections → hero → content.foto` | con foto |
| Proyectos 1, 2 y 3 | `sections → proyectos → content.items[0..2].foto` | con foto |
| Cacao en grano | `products → cocoa-beans → data.foto` | con foto |
| Galería 1 (cosecha) y 4 (fermentación/secado) | `sections → galeria → content.fotos[0]` y `[3]` | con foto |
| Nosotros | `sections → nosotros → content.foto` | **vacío** (franja rayada) |
| Derivados de cacao | `products → cocoa-products → data.foto` | **vacío** |
| Galería 2 (cata), 3 (calado), 5 (almacén), 6 (contenedor) | `…fotos[1]`, `[2]`, `[4]`, `[5]` | **vacíos** |

### Título de la pestaña

`settings.site.title` y `settings.seo.es/en.title` conservan «**v5**» y «**(Copy)**» de la plantilla. Edítalos antes de publicar (y también el `<title>` de `index.html`, que es el que se ve mientras carga).

## Pruebas

Las pruebas viven en `tests/` (paquete aparte, no se instalan al compilar el sitio):

```bash
cd tests
npm install
npx playwright install chromium     # solo la primera vez
npm run test:script                 # Code.gs con simulacros de Google (Node)
npm run test:e2e                    # Playwright: compila 4 builds y los prueba
```

`npm run test:e2e` cubre:

- **Visual**: con los datos de la plantilla (sin fotos y con `ocultar_pendientes=false`, derivados de `site.json`) la página es idéntica píxel a píxel a `reference/original.html` en 1440 y 390 px, ES, tema claro. Necesita la plantilla original (carpeta hermana `../youthcoop/reference/original.html`); si está en otro sitio, define `REFERENCIA_HTML`. Sin ella, esas dos pruebas se omiten.
- **Subruta**: servido bajo `/youthcoop/` (servidor que imita GitHub Pages: todo lo que esté fuera de la subruta da 404) y en la raíz con `vite preview`: cargan las 7 fotos, sus 21 variantes existen, ningún recurso propio da 404, no hay llamadas a `/api` ni rutas `/admin`.
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
public/media/               fotos (480/800/1200 px, WebP) y logos
google-apps-script/         Code.gs y su README
.github/workflows/deploy.yml
tests/                      Playwright + prueba de Code.gs
```

## Qué cambió respecto al sitio con backend

- Los datos salen de `src/data/site.json` (antes `GET /api/v1/public/site`); se quitaron el panel `/admin`, el router, la vista previa `?preview=1`, las llamadas a `/api` y el modo seed.
- El envío del formulario pasa de `POST /api/v1/requests` (con cabecera `Idempotency-Key`) a un `POST` text/plain a Google Apps Script con `id` en el cuerpo; cada producto lleva además su nombre (`label`) para que la hoja sea legible. Se añadió el aviso «sin_endpoint» cuando falta `VITE_FORM_ENDPOINT`.
- Las 7 fotos asignadas (`seed/photo_assignments.json`, estado «asignada») están en `public/media/` con `srcset` 480/800/1200 y texto alternativo ES/EN.
- Los correos están apagados (`notificaciones.correo_activo: false`); el sitio no envía ninguno.

## Datos pendientes del cliente

Lo siguiente **no se inventó**: está oculto (`ocultar_pendientes: true`) o vacío hasta que el cliente lo entregue.

- **Título y descripción SEO**: quitar «v5» y «(Copy)»; descripción en inglés (hoy usa la española).
- **Cifras y ficha**: número de familias productoras; altitud (msnm), variedades y meses de cosecha; dato de impacto de Cacao Bosque+; genética del cacao en grano.
- **Certificaciones**: los 5 logos oficiales (Orgánico UE, NOP, COR, RTPO, Fairtrade).
- **Redes**: enlace de TikTok (hoy `#`, oculto).
- **LinkedIn**: las 3 publicaciones a incrustar (URL `https://www.linkedin.com/embed/…`).
- **Fotos faltantes**: Nosotros (socios fundadores con sus padres; solo hay una alternativa por confirmar), Derivados de cacao (licor, manteca, polvo, nibs), Galería: cata en laboratorio, calado de sacos, almacén de Lima, contenedor de exportación.
- **Foto del hero**: la elegida no muestra cerezas maduras en la mano ni luz de mañana (era lo pedido); conviene una toma nueva.
- **Foto «Tierra de Jóvenes y Mujeres»**: aparece un menor (bebé); confirmar la autorización antes de publicar.
- **Textos nuevos a revisar**: mensajes de éxito, de error de envío y de «formulario no conectado» (`settings.formulario.mensajes`).
- **Reglas regulatorias del formulario** (EORI obligatorio en UE y Reino Unido; EIN/Tax ID opcionales): validarlas con el responsable.
- **Favicon**: el proyecto de origen no tiene el del cliente (solo el de Phoenix por defecto, que no se copió); entregar un favicon e incluirlo en `index.html`.
- **Fuente oficial** (HarmonyOS Sans): hoy se usa «Outfit» desde Google Fonts como sustituto.
- **Política de privacidad y retención** de los datos que guarda la hoja de Google.
- **Cuenta de Google** que será dueña de la hoja y del script.

## Notas técnicas

- Dependencias en tiempo de ejecución: `react`, `react-dom` y `dompurify`. Las fuentes (Outfit) se piden a Google Fonts.
- `npm audit` avisa de una vulnerabilidad de `vite`/`esbuild` que afecta **solo al servidor de desarrollo** (`npm run dev`), no al sitio publicado; se mantiene Vite 5 para conservar el mismo resultado de compilación que el proyecto original.
