// Aplica los textos que edita el cliente (content/textos/*.json, panel /admin) sobre src/data/site.json.
//
//   - Solo toca los campos de texto de la LISTA BLANCA (scripts/textos-esquema.mjs). Un campo que no esté en la lista se ignora
//     con un aviso; jamás se crean ni se borran secciones, ítems, claves, íconos, enlaces ni posiciones.
//   - Las listas se emparejan por posición y deben tener el mismo número de ítems que el sitio; si no, esa lista se ignora.
//   - Un texto obligatorio vacío NO borra el del sitio: se avisa y se conserva el anterior. El inglés vacío usa el español.
//   - El HTML se sanea con una lista blanca propia (ver textos-lib.mjs): <br>, <em>, <strong>, <b> y <span class="pendiente">.
//   - Es idempotente: si el resultado es igual a lo que ya hay, no escribe nada. Corre en `npm run build`, `npm run dev` y en el workflow
//     (junto a build-media.mjs). Una fuente de verdad: lo que diga content/textos/ gana sobre lo que diga site.json en esos campos.
//   - Los avisos no detienen el build (el sitio publicado sigue con lo anterior); solo un archivo que no es JSON válido lo detiene.
//
//   node scripts/build-textos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aHtml, limpiarBasico } from './textos-lib.mjs';
import { RAICES } from './textos-esquema.mjs';

// BUILD_TEXTOS_RAIZ (opcional): otra carpeta con la misma estructura (content/textos/, src/data/site.json). Solo la usan las pruebas.
const RAIZ = process.env.BUILD_TEXTOS_RAIZ ? path.resolve(process.env.BUILD_TEXTOS_RAIZ) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR_TEXTOS = path.join(RAIZ, 'content', 'textos');
const RUTA_SITE = path.join(RAIZ, 'src', 'data', 'site.json');
const LIMITE_DURO = 2000; // caracteres por texto (el panel pone límites más bajos en cada campo)

const avisos = [];
const aviso = (donde, msg) => {
  avisos.push(`${donde}: ${msg}`);
  console.warn(`  aviso ${donde}: ${msg}`);
  if (process.env.GITHUB_ACTIONS) console.log(`::warning title=Texto sin aplicar (${donde})::${msg}`);
};
let aplicados = 0;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const tienePropia = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const HAY_CORCHETES = /\[[^\[\]]*\]/;

/** Valida y convierte lo escrito en el panel. Devuelve el texto final o null (con aviso) si no se debe aplicar. */
function convertir(bruto, hoja, donde) {
  const opciones = { rico: hoja.rico !== false, marca: !!hoja.marca, conEspacio: !!hoja.conEspacio };
  if (bruto != null && typeof bruto !== 'string') {
    aviso(donde, 'el valor no es un texto; se conserva el anterior.');
    return null;
  }
  const basico = limpiarBasico(bruto ?? '');
  if (basico.length > LIMITE_DURO) {
    aviso(donde, `el texto tiene ${basico.length} caracteres (máximo ${LIMITE_DURO}); se conserva el anterior.`);
    return null;
  }
  const valor = aHtml(basico, opciones);
  if (!valor.trim()) {
    if (hoja.opc) return '';
    aviso(donde, 'está vacío y es obligatorio; se conserva el texto anterior.');
    return null;
  }
  for (const frag of hoja.requiere ?? []) {
    if (!valor.includes(frag)) {
      aviso(donde, `debe conservar ${frag} (la web pone ahí un dato); se conserva el texto anterior.`);
      return null;
    }
  }
  if (hoja.patron && !new RegExp(hoja.patron[0]).test(valor)) {
    aviso(donde, `${hoja.patron[1]} Se conserva el texto anterior.`);
    return null;
  }
  return valor;
}

/** Lo que el sitio tiene hoy en ese campo, en español (para el aviso de «conservar el anterior»). */
const esDe = (v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? v.es : undefined);

function aplicarHoja(hoja, tx, sitio, donde, pend) {
  const actual = sitio[hoja.n];
  if (actual === undefined || actual === null) {
    aviso(donde, 'ese campo no existe en el sitio; se ignora (el panel no puede crear campos nuevos).');
    return;
  }
  if (hoja.t === 'plano') {
    if (typeof actual !== 'string') return aviso(donde, 'en el sitio no es un texto simple; se ignora.');
    let v = convertir(tx, hoja, donde);
    if (v === null) v = actual;
    else if (v === '' && hoja.vacioComo !== undefined) v = hoja.vacioComo;
    sitio[hoja.n] = v;
    pend?.valores.push(v);
    aplicados++;
    return;
  }
  // i18n: {es, en}; un texto suelto cuenta como ES = EN
  const dato = typeof tx === 'string' ? { es: tx, en: tx } : esObjeto(tx) ? tx : null;
  if (!dato) {
    if (tx != null) aviso(donde, 'se esperaba {es, en}; se ignora.');
    return;
  }
  const desconocidas = Object.keys(dato).filter((k) => k !== 'es' && k !== 'en');
  if (desconocidas.length) aviso(donde, `campo(s) no permitido(s) ignorado(s): ${desconocidas.join(', ')}.`);
  if (typeof actual !== 'string' && !esObjeto(actual)) return aviso(donde, 'en el sitio no es un texto; se ignora.');
  const antes = { es: esDe(actual) ?? '', en: (esObjeto(actual) ? actual.en : actual) ?? '' };
  let es = convertir(dato.es, hoja, `${donde}.es`);
  if (es === null) es = antes.es;
  let en = convertir(dato.en, { ...hoja, opc: true }, `${donde}.en`);
  if (en === null) en = antes.en;
  else if (en === '') en = es; // inglés vacío = se usa el español (también lo hace el sitio)
  if (typeof actual === 'string' && es === en) sitio[hoja.n] = es;
  else sitio[hoja.n] = { es, en };
  pend?.valores.push(es, en);
  aplicados++;
}

/** Un ítem/grupo que lleva `pendiente`: se publica cuando ya no queda ningún [dato] entre corchetes (o, en redes, cuando hay enlace). */
function cerrarPendiente(esq, nodo, pend) {
  if (!esq.pendienteSi || !pend || typeof nodo.pendiente !== 'boolean') return;
  const pendiente = esq.pendienteSi === 'enlace' ? pend.valores.every((v) => !v || v === '#') : pend.valores.some((v) => HAY_CORCHETES.test(v));
  nodo.pendiente = pendiente;
  if (esq.pendienteSi === 'enlace' && !pendiente && typeof nodo.etiqueta === 'string') nodo.etiqueta = nodo.etiqueta.replace(/\s*\(pendiente\)\s*$/i, '');
}

/** Recorre los campos de un nivel (y reparte el seguimiento de «pendiente» a sus textos). */
function aplicarCampos(esquemas, tx, sitio, donde, pend) {
  if (sitio === null || typeof sitio !== 'object') return; // (un grupo puede colgar de una lista, como las redes: se buscan por su nombre)
  const permitidas = new Set(esquemas.map((e) => e.n));
  if (esObjeto(tx)) {
    const sobran = Object.keys(tx).filter((k) => !permitidas.has(k));
    if (sobran.length) aviso(donde, `campo(s) no permitido(s) ignorado(s): ${sobran.join(', ')}.`);
  }
  for (const e of esquemas) aplicarNodo(e, tx?.[e.n], sitio, `${donde}.${e.n}`, pend);
}

function aplicarNodo(e, tx, padre, donde, pend) {
  if (e.t === 'i18n' || e.t === 'plano') {
    if (!esObjeto(padre)) return;
    if (tx === undefined) return aviso(donde, 'falta en content/textos; se conserva el texto del sitio.');
    return aplicarHoja(e, tx, padre, donde, pend);
  }
  const sub = e.destino ? e.destino(padre) : padre?.[e.n];
  if (sub === undefined || sub === null) {
    aviso(donde, 'no existe en el sitio; se ignora.');
    return;
  }
  if (e.t === 'grupo') {
    if (tx === undefined) return aviso(donde, 'falta en content/textos; se conserva el texto del sitio.');
    if (!esObjeto(tx)) return aviso(donde, 'se esperaba un grupo de campos; se ignora.');
    const propio = e.pendienteSi ? { valores: [] } : null;
    aplicarCampos(e.campos, tx, sub, donde, propio);
    if (propio) cerrarPendiente(e, sub, propio);
    return;
  }
  // lista de tamaño fijo, por posición
  if (!Array.isArray(sub)) return aviso(donde, 'en el sitio no es una lista; se ignora.');
  if (tx === undefined) return aviso(donde, 'falta en content/textos; se conserva el texto del sitio.');
  if (!Array.isArray(tx) || tx.length !== sub.length) {
    aviso(donde, `la lista debe tener ${sub.length} ítems (tiene ${Array.isArray(tx) ? tx.length : 'otra forma'}); no se agregan ni se quitan ítems, esa lista se ignora.`);
    return;
  }
  sub.forEach((nodo, i) => {
    const propio = e.pendienteSi ? { valores: [] } : null;
    aplicarCampos(e.campos, tx[i], nodo, `${donde}[${i + 1}]`, propio);
    if (propio) cerrarPendiente(e, nodo, propio);
  });
}

/** Enlaces que dependen de otros datos: se mantienen iguales sin que el cliente tenga que repetirlos. */
function sincronizar(site, antes) {
  const redes = site.settings?.contacto?.redes;
  if (Array.isArray(redes)) {
    const wa = redes.find((r) => r.red === 'whatsapp');
    const numero = site.settings.contacto.whatsapp_numero;
    if (wa && /^https:\/\/wa\.me\/\d+$/.test(wa.url) && /^\d{8,15}$/.test(numero)) wa.url = `https://wa.me/${numero}`;
    // el botón «Síguenos en LinkedIn» de Novedades apunta a la misma página que la red LinkedIn si ya apuntaba (no se pide dos veces)
    const li = redes.find((r) => r.red === 'linkedin');
    const nov = site.sections?.find((s) => s.key === 'novedades')?.content?.boton;
    if (li && nov && antes.linkedin && nov.href === antes.linkedin) nov.href = li.url;
  }
  // el título y la descripción «generales» son el respaldo del SEO en español: se mantienen iguales a él
  const seoEs = site.settings?.seo?.es;
  if (seoEs && site.settings.site) {
    if (seoEs.title) site.settings.site.title = seoEs.title;
    if (seoEs.description) site.settings.site.description = seoEs.description;
  }
}

function main() {
  const t0 = Date.now();
  const textoSite = fs.readFileSync(RUTA_SITE, 'utf8');
  const site = JSON.parse(textoSite);
  const antes = { linkedin: site.settings?.contacto?.redes?.find((r) => r.red === 'linkedin')?.url };

  if (!fs.existsSync(DIR_TEXTOS)) {
    console.log('build-textos: no hay carpeta content/textos/; no se cambia nada.');
    return;
  }
  const esperados = new Set(RAICES.map((r) => `${r.archivo}.json`));
  for (const f of fs.readdirSync(DIR_TEXTOS)) if (!esperados.has(f)) aviso(`content/textos/${f}`, 'archivo que no es de ninguna sección; se ignora.');

  for (const raiz of RAICES) {
    const ruta = path.join(DIR_TEXTOS, `${raiz.archivo}.json`);
    if (!fs.existsSync(ruta)) {
      aviso(`content/textos/${raiz.archivo}.json`, 'no existe; se conserva el texto del sitio.');
      continue;
    }
    let tx;
    try {
      tx = JSON.parse(fs.readFileSync(ruta, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      console.error(`\nERROR en los textos: content/textos/${raiz.archivo}.json no es un JSON válido (${e.message}). Corrige o restaura el archivo (el sitio publicado no se toca).\n`);
      process.exit(1);
    }
    const base = raiz.destino(site);
    if (!esObjeto(base)) {
      aviso(`${raiz.archivo}`, 'la sección no existe en site.json; se ignora.');
      continue;
    }
    // los archivos que cuelgan de un sitio distinto al raíz de la sección llevan `destino` en cada grupo de primer nivel
    aplicarCampos(raiz.campos, tx, base, raiz.archivo, null);
  }

  sincronizar(site, antes);

  const nuevoTexto = JSON.stringify(site, null, 2) + '\n';
  const cambio = nuevoTexto !== textoSite;
  if (cambio) fs.writeFileSync(RUTA_SITE, nuevoTexto);
  console.log(`build-textos: ${aplicados} textos revisados, ${avisos.length} aviso(s), site.json ${cambio ? 'actualizado' : 'sin cambios'} (${Date.now() - t0} ms).`);
}

main();
