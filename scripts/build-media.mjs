// Procesa las fotos que sube el editor (content/fotos.json + content/originales/) y deja el sitio listo.
//
// Para cada uno de los 13 huecos de foto:
//   1. toma LA imagen original (jpg, png o webp, de cualquier tamaño y proporcion),
//   2. la endereza segun el EXIF, la recorta (cover) a la proporcion del hueco centrando en el punto focal
//      y genera 3 variantes WebP de 480, 800 y 1200 px de ancho (nunca agranda una foto pequena),
//   3. escribe las variantes en public/media/fotos/ con el hash en el nombre (cache de Cloudflare/navegador
//      siempre al dia: foto nueva = nombre nuevo),
//   4. actualiza en src/data/site.json la entrada `media` del hueco y su enlace (media_id, pendiente, caption).
// El hueco de video (galeria_6) acepta un .mp4 (se copia tal cual) y un poster opcional.
//
// Es idempotente y rapido: si las variantes de ese hash ya existen no se vuelven a generar, y site.json
// solo se reescribe si cambia. Corre solo en `npm run build` (prebuild), `npm run dev` (predev) y en el workflow.
//
//   node scripts/build-media.mjs            procesa lo que cambio
//   node scripts/build-media.mjs --forzar   regenera todo
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// BUILD_MEDIA_RAIZ (opcional): otra carpeta con la misma estructura (content/, src/data/site.json, public/media/). Solo la usan las pruebas.
const RAIZ = process.env.BUILD_MEDIA_RAIZ ? path.resolve(process.env.BUILD_MEDIA_RAIZ) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_FOTOS = path.join(RAIZ, 'content', 'fotos.json');
const RUTA_SITE = path.join(RAIZ, 'src', 'data', 'site.json');
const DIR_SALIDA = path.join(RAIZ, 'public', 'media', 'fotos');
const URL_SALIDA = 'media/fotos'; // sin barra inicial: el sitio usa base './'
const DIR_ORIGINALES = path.join(RAIZ, 'content', 'originales');

const ANCHOS = [480, 800, 1200];
const CALIDAD_WEBP = 80;
const ANCHO_MAX_POSTER = 1280;
const AVISO_VIDEO = 20 * 1024 * 1024; // recomendado
const LIMITE_GITHUB = 100 * 1024 * 1024; // GitHub rechaza archivos de mas de 100 MB
const VERSION_ALGORITMO = 'v1'; // subirla fuerza a regenerar todo si cambia el recorte o la calidad
const FORZAR = process.argv.includes('--forzar');

// ---------- los 13 huecos: clave en content/fotos.json, proporcion ancho:alto y donde vive en site.json ----------
const sec = (site, k) => site.sections.find((s) => s.key === k).content;
const prod = (site, slug) => site.products.find((p) => p.slug === slug).data;
const SLOTS = [
  { clave: 'hero', ratio: [4, 5], hueco: (s) => sec(s, 'hero').foto },
  { clave: 'nosotros', ratio: [4, 3], hueco: (s) => sec(s, 'nosotros').foto },
  { clave: 'proyecto_1', ratio: [16, 10], hueco: (s) => sec(s, 'proyectos').items[0].foto },
  { clave: 'proyecto_2', ratio: [16, 10], hueco: (s) => sec(s, 'proyectos').items[1].foto },
  { clave: 'proyecto_3', ratio: [16, 10], hueco: (s) => sec(s, 'proyectos').items[2].foto },
  { clave: 'cacao_grano', ratio: [16, 9], hueco: (s) => prod(s, 'cocoa-beans').foto },
  { clave: 'cacao_derivados', ratio: [16, 9], hueco: (s) => prod(s, 'cocoa-products').foto },
  ...[1, 2, 3, 4, 5].map((n) => ({ clave: `galeria_${n}`, ratio: [4, 3], hueco: (s) => sec(s, 'galeria').fotos[n - 1] })),
  { clave: 'galeria_6', ratio: [4, 3], acepta_video: true, hueco: (s) => sec(s, 'galeria').fotos[5] },
];

class ErrorFoto extends Error {}
const falla = (msg) => {
  throw new ErrorFoto(msg);
};

const sha = (...partes) => {
  const h = crypto.createHash('sha1');
  for (const p of partes) h.update(p);
  return h.digest('hex').slice(0, 10);
};
const texto = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim() : '');
const foco = (v) => {
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) ? 50 : Math.min(100, Math.max(0, Math.round(n)));
};

/** Ruta tal como la guarda Decap ("/content/originales/foto.jpg") -> archivo real. Solo se admite content/. */
function resolverRuta(valor, clave) {
  const v = texto(valor);
  if (!v) return null;
  const limpia = v.replace(/^\/+/, '').replace(/^\.\//, '');
  const candidatas = [limpia];
  try {
    candidatas.push(decodeURIComponent(limpia));
  } catch {
    /* nombre con % suelto: se usa tal cual */
  }
  for (const c of candidatas) {
    const abs = path.resolve(RAIZ, c);
    if (!abs.startsWith(path.join(RAIZ, 'content') + path.sep)) falla(`${clave}: la ruta "${v}" debe estar dentro de la carpeta content/.`);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  }
  return falla(`${clave}: no encuentro el archivo "${v}". Vuelve a elegir la imagen en el panel /admin.`);
}

/** Ancho y alto del primer track de video de un .mp4 (sin ffprobe). null si no se puede leer. */
function dimensionesMp4(buf) {
  const contenedores = new Set(['moov', 'trak']);
  const recorrer = (ini, fin) => {
    let p = ini;
    while (p + 8 <= fin) {
      let tam = buf.readUInt32BE(p);
      const tipo = buf.toString('latin1', p + 4, p + 8);
      let cab = 8;
      if (tam === 1) {
        tam = Number(buf.readBigUInt64BE(p + 8));
        cab = 16;
      } else if (tam === 0) tam = fin - p;
      if (tam < cab || p + tam > fin) return null;
      if (contenedores.has(tipo)) {
        const r = recorrer(p + cab, p + tam);
        if (r) return r;
      } else if (tipo === 'tkhd') {
        const d = p + cab;
        const base = buf[d] === 1 ? 36 : 24;
        const ancho = buf.readUInt32BE(d + base + 52) / 65536;
        const alto = buf.readUInt32BE(d + base + 56) / 65536;
        if (ancho > 0 && alto > 0) return { width: Math.round(ancho), height: Math.round(alto) };
      }
      p += tam;
    }
    return null;
  };
  try {
    return recorrer(0, buf.length);
  } catch {
    return null;
  }
}

/** Escribe el archivo solo si no existe (el nombre lleva el hash: mismo nombre = mismo contenido). */
function escribir(nombre, datos, conservar, estado) {
  conservar.add(nombre);
  const destino = path.join(DIR_SALIDA, nombre);
  if (!FORZAR && fs.existsSync(destino)) return false;
  fs.writeFileSync(destino, datos);
  estado.generado = true;
  return true;
}

async function leerImagen(abs, clave) {
  const buf = fs.readFileSync(abs);
  let meta;
  try {
    meta = await sharp(buf).metadata();
  } catch (e) {
    falla(`${clave}: "${path.basename(abs)}" no es una imagen que pueda leer (${e.message}). Usa JPG, PNG o WebP (las fotos HEIC del iPhone hay que guardarlas como JPG).`);
  }
  if (!meta.width || !meta.height) falla(`${clave}: "${path.basename(abs)}" no tiene medidas legibles.`);
  const gira = meta.orientation >= 5 && meta.orientation <= 8; // el EXIF pide girar 90 grados: ancho y alto se invierten
  return { buf, meta, W: gira ? meta.height : meta.width, H: gira ? meta.width : meta.height, orientada: !!meta.orientation && meta.orientation !== 1 };
}

/** Foto de un hueco: recorte cover con punto focal + variantes 480/800/1200. */
async function procesarFoto(slot, e, rutaAbs, conservar) {
  const { clave, ratio } = slot;
  const fx = foco(e.focal_x);
  const fy = foco(e.focal_y);
  const { buf, meta, W, H, orientada } = await leerImagen(rutaAbs, clave);
  const [rw, rh] = ratio;
  // caja de recorte mas grande posible con la proporcion del hueco, centrada en el punto focal (sin salirse de la foto)
  let cw;
  let ch;
  if (W * rh >= H * rw) {
    ch = H;
    cw = Math.min(W, Math.round((H * rw) / rh));
  } else {
    cw = W;
    ch = Math.min(H, Math.round((W * rh) / rw));
  }
  const left = Math.min(W - cw, Math.max(0, Math.round((fx / 100) * W - cw / 2)));
  const top = Math.min(H - ch, Math.max(0, Math.round((fy / 100) * H - ch / 2)));
  const hash = sha(VERSION_ALGORITMO, buf, `|${rw}:${rh}|${fx},${fy}`);

  let anchos = ANCHOS.filter((w) => w <= cw);
  if (cw < ANCHOS[2] && (anchos.length === 0 || cw > anchos[anchos.length - 1])) anchos = [...anchos, cw]; // foto chica: la mayor variante es su tamano real
  if (cw < ANCHOS[2]) console.warn(`  aviso ${clave}: la foto recortada mide solo ${cw} px de ancho; se publica sin agrandarla (lo ideal es 1200 px o mas).`);

  const estado = { generado: false };
  const variantes = [];
  for (const w of anchos) {
    const h = Math.round((w * rh) / rw);
    const nombre = `${clave}-${hash}-${w}.webp`;
    const hecho = !FORZAR && fs.existsSync(path.join(DIR_SALIDA, nombre));
    if (!hecho) {
      const sinCambios = meta.format === 'webp' && !orientada && cw === W && ch === H && w === W && !(meta.pages > 1);
      const datos = sinCambios
        ? buf // ya es un WebP exacto de ese tamano: se copia tal cual, sin volver a comprimir
        : await sharp(buf).rotate().extract({ left, top, width: cw, height: ch }).resize(w, h, { fit: 'cover' }).webp({ quality: CALIDAD_WEBP, effort: 5 }).toBuffer();
      escribir(nombre, datos, conservar, estado);
    } else conservar.add(nombre);
    variantes.push({ url: `${URL_SALIDA}/${nombre}`, width: w });
  }
  const mayor = variantes[variantes.length - 1];
  return {
    estado,
    resumen: `${W}x${H} -> recorte ${cw}x${ch} (foco ${fx}/${fy}) -> ${anchos.join('/')} px`,
    medio: {
      url: mayor.url,
      kind: 'image',
      mime: 'image/webp',
      width: mayor.width,
      height: Math.round((mayor.width * rh) / rw),
      // la imagen ya sale recortada con el foco aplicado: object-position al centro (como el resto de fotos)
      focal_x: 50,
      focal_y: 50,
      srcset: variantes,
    },
  };
}

/** Video: se copia el .mp4 tal cual; el poster (opcional) se pasa a WebP sin recortar. */
async function procesarVideo(slot, e, rutaVideo, rutaPoster, conservar, anterior) {
  const { clave } = slot;
  const buf = fs.readFileSync(rutaVideo);
  if (buf.length > LIMITE_GITHUB) falla(`${clave}: el video pesa ${(buf.length / 1048576).toFixed(0)} MB y GitHub no admite archivos de mas de 100 MB. Comprimelo (ideal: menos de 20 MB).`);
  if (buf.length > AVISO_VIDEO) console.warn(`  aviso ${clave}: el video pesa ${(buf.length / 1048576).toFixed(1)} MB; se recomienda menos de 20 MB para que cargue rapido en celular.`);
  if (!/\.(mp4|m4v)$/i.test(rutaVideo) || buf.toString('latin1', 4, 8) !== 'ftyp') falla(`${clave}: "${path.basename(rutaVideo)}" no parece un .mp4 valido.`);
  const estado = { generado: false };
  const nombreVideo = `${clave}-${sha(VERSION_ALGORITMO, buf)}.mp4`;
  escribir(nombreVideo, buf, conservar, estado);
  let dims = dimensionesMp4(buf);

  let poster = null;
  if (rutaPoster) {
    const { buf: pb, meta, W, H, orientada } = await leerImagen(rutaPoster, `${clave} (poster)`);
    const w = Math.min(W, ANCHO_MAX_POSTER);
    const h = Math.round((H * w) / W);
    const nombre = `${clave}-${sha(VERSION_ALGORITMO, pb)}-poster.webp`;
    if (FORZAR || !fs.existsSync(path.join(DIR_SALIDA, nombre))) {
      const sinCambios = meta.format === 'webp' && !orientada && w === W && !(meta.pages > 1);
      const datos = sinCambios ? pb : await sharp(pb).rotate().resize(w, h).webp({ quality: CALIDAD_WEBP, effort: 5 }).toBuffer();
      escribir(nombre, datos, conservar, estado);
    } else conservar.add(nombre);
    poster = `${URL_SALIDA}/${nombre}`;
    dims ??= { width: w, height: h };
  }
  dims ??= { width: anterior?.width ?? null, height: anterior?.height ?? null };
  return {
    estado,
    resumen: `video ${(buf.length / 1048576).toFixed(1)} MB${poster ? ' + poster' : ' sin poster'}`,
    medio: {
      url: `${URL_SALIDA}/${nombreVideo}`,
      kind: 'video',
      mime: 'video/mp4',
      ...dims,
      // en el video el recorte lo hace el navegador con object-position (0 = izquierda/arriba, 100 = derecha/abajo)
      focal_x: foco(e.focal_x),
      focal_y: foco(e.focal_y),
      poster,
      srcset: [],
    },
  };
}

/** Orden de claves igual al que ya tiene site.json (url, kind, mime, width, height, alt, poster, focal_x, focal_y, srcset). */
function entradaMedia(medio, alt) {
  return {
    url: medio.url,
    kind: medio.kind,
    mime: medio.mime,
    width: medio.width ?? null,
    height: medio.height ?? null,
    alt,
    poster: medio.poster ?? null,
    focal_x: medio.focal_x,
    focal_y: medio.focal_y,
    srcset: medio.srcset,
  };
}

async function main() {
  const fotos = JSON.parse(fs.readFileSync(RUTA_FOTOS, 'utf8'));
  const textoSite = fs.readFileSync(RUTA_SITE, 'utf8');
  const site = JSON.parse(textoSite);
  fs.mkdirSync(DIR_SALIDA, { recursive: true });

  const conservar = new Set();
  const usados = new Set(); // originales referenciados (para avisar de los que sobran)
  let siguienteId = Math.max(0, ...Object.keys(site.media).map(Number).filter(Number.isFinite)) + 1;
  let nuevas = 0;
  const t0 = Date.now();

  for (const slot of SLOTS) {
    const { clave } = slot;
    const e = fotos[clave];
    if (!e) falla(`content/fotos.json no tiene el hueco "${clave}".`);
    const hueco = slot.hueco(site);
    if (!hueco) falla(`site.json no tiene el hueco de "${clave}".`);

    const alt = { es: texto(e.alt?.es), en: texto(e.alt?.en) };
    if (!alt.es) console.warn(`  aviso ${clave}: falta el texto alternativo en espanol (lo leen los lectores de pantalla y Google).`);
    alt.en ||= alt.es;

    const rutaVideo = slot.acepta_video ? resolverRuta(e.video, clave) : null;
    const rutaImagen = resolverRuta(e.imagen, clave);
    let r;
    if (rutaVideo) {
      const rutaPoster = resolverRuta(e.poster, clave) ?? rutaImagen; // si no hay poster pero si foto, la foto hace de poster
      usados.add(rutaVideo);
      if (rutaPoster) usados.add(rutaPoster);
      const anterior = site.media[String(hueco.media_id)];
      r = await procesarVideo(slot, e, rutaVideo, rutaPoster, conservar, anterior);
    } else {
      if (!rutaImagen) falla(`${clave}: falta la imagen. Elige una foto en el panel /admin.`);
      usados.add(rutaImagen);
      r = await procesarFoto(slot, e, rutaImagen, conservar);
    }
    if (r.estado.generado) nuevas++;
    console.log(`  ${r.estado.generado ? 'generado' : 'sin cambios'}  ${clave}: ${r.resumen}`);

    // enlaces en site.json: mismo media_id si ya tenia (los demas usos no cambian), uno nuevo si no
    let id = hueco.media_id;
    if (id == null || !(String(id) in site.media)) id = id ?? siguienteId++;
    site.media[String(id)] = entradaMedia(r.medio, alt);
    hueco.media_id = id;
    hueco.pendiente = false;
    const es = texto(e.leyenda?.es);
    const en = texto(e.leyenda?.en);
    if (es) hueco.caption = en ? { es, en } : es;
  }

  // limpiar variantes viejas (la carpeta es 100 % generada y no se guarda en git)
  let borradas = 0;
  for (const f of fs.readdirSync(DIR_SALIDA)) {
    if (!conservar.has(f)) {
      fs.rmSync(path.join(DIR_SALIDA, f), { force: true });
      borradas++;
    }
  }

  const nuevoTexto = JSON.stringify(site, null, 2) + '\n';
  const cambioSite = nuevoTexto !== textoSite;
  if (cambioSite) fs.writeFileSync(RUTA_SITE, nuevoTexto);

  const sobrantes = fs.existsSync(DIR_ORIGINALES) ? fs.readdirSync(DIR_ORIGINALES).filter((f) => !usados.has(path.join(DIR_ORIGINALES, f))) : [];
  if (sobrantes.length) console.log(`  info: ${sobrantes.length} archivo(s) de content/originales/ ya no se usan (se pueden borrar para aligerar el repositorio): ${sobrantes.join(', ')}`);
  console.log(`build-media: ${SLOTS.length} huecos, ${nuevas} con cambios, ${borradas} archivo(s) viejo(s) borrado(s), site.json ${cambioSite ? 'actualizado' : 'sin cambios'} (${Date.now() - t0} ms).`);
}

main().catch((e) => {
  if (e instanceof ErrorFoto) console.error(`\nERROR en las fotos: ${e.message}\n`);
  else console.error(e);
  process.exit(1);
});
