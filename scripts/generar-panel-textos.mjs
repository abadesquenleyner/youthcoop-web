// Herramienta de mantenimiento (no corre en el build): mantiene al día, a partir de scripts/textos-esquema.mjs,
//   1. los archivos content/textos/*.json (con --inicial: los extrae de src/data/site.json, con el mismo texto que ya tiene el sitio), y
//   2. las colecciones «Textos por sección», «Productos» y «Contacto y ajustes» de public/admin/config.yml
//      (el bloque entre las marcas «TEXTOS (generado)»; no se edita a mano: se cambia el esquema y se vuelve a generar).
//
//   node scripts/generar-panel-textos.mjs            reescribe el bloque de config.yml
//   node scripts/generar-panel-textos.mjs --inicial  además crea los content/textos/*.json que falten, desde site.json (con --forzar sobrescribe también los que existen)
//   node scripts/generar-panel-textos.mjs --check    no escribe nada: sale con error si config.yml o content/textos no coinciden con el esquema
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aAmigable, aHtml } from './textos-lib.mjs';
import { RAICES } from './textos-esquema.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUTA_SITE = path.join(RAIZ, 'src', 'data', 'site.json');
const RUTA_CONFIG = path.join(RAIZ, 'public', 'admin', 'config.yml');
const DIR_TEXTOS = path.join(RAIZ, 'content', 'textos');
const INICIO = '# >>> TEXTOS (generado por scripts/generar-panel-textos.mjs; no editar a mano: cambia scripts/textos-esquema.mjs y vuelve a generar)';
const FIN = '# <<< TEXTOS (fin del bloque generado)';
const CHECK = process.argv.includes('--check');
const INICIAL = process.argv.includes('--inicial');
const FORZAR = process.argv.includes('--forzar');

const falla = (m) => {
  console.error(`ERROR: ${m}`);
  process.exit(1);
};
const opcionesDe = (e) => ({ rico: e.rico !== false, marca: !!e.marca, conEspacio: !!e.conEspacio });

// ---------- 1. valores iniciales desde site.json ----------
function extraer(campos, padre, donde) {
  const out = {};
  for (const e of campos) {
    const aqui = `${donde}.${e.n}`;
    if (e.t === 'i18n' || e.t === 'plano') {
      const v = padre?.[e.n];
      if (v == null) falla(`${aqui}: no existe en site.json.`);
      const una = (html) => {
        const t = aAmigable(html, opcionesDe(e));
        if (aHtml(t, opcionesDe(e)) !== html) falla(`${aqui}: el texto «${html}» no sobrevive a la ida y vuelta (${JSON.stringify(t)}).`);
        if (t.length > e.max) falla(`${aqui}: ${t.length} caracteres, más que el máximo ${e.max}.`);
        if (e.patron && !new RegExp(e.patron[0]).test(t)) falla(`${aqui}: no cumple su patrón (${t}).`);
        return t;
      };
      if (e.t === 'plano') {
        if (typeof v !== 'string') falla(`${aqui}: en site.json no es un texto simple.`);
        out[e.n] = una(v);
      } else {
        out[e.n] = typeof v === 'string' ? { es: una(v), en: una(v) } : { es: una(v.es), en: una(v.en) };
      }
    } else if (e.t === 'grupo') {
      out[e.n] = extraer(e.campos, e.destino ? e.destino(padre) : padre?.[e.n], aqui);
    } else {
      const arr = e.destino ? e.destino(padre) : padre?.[e.n];
      if (!Array.isArray(arr)) falla(`${aqui}: no es una lista en site.json.`);
      if (e.cuenta != null && arr.length !== e.cuenta) falla(`${aqui}: el esquema dice ${e.cuenta} ítems y site.json tiene ${arr.length}.`);
      if (e.cuenta == null && (arr.length < e.min || arr.length > e.max)) falla(`${aqui}: ${arr.length} ítems fuera de ${e.min}-${e.max}.`);
      out[e.n] = arr.map((item, i) => extraer(e.campos, item, `${aqui}[${i + 1}]`));
    }
  }
  return out;
}

// ---------- 2. colecciones de Decap ----------
const escapaRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function campoTexto(e, extra, conHint = true) {
  const patron = e.patron
    ? [e.patron[0], e.patron[1].replace(/\.$/, '')] // Decap ya agrega el punto final al mostrar el mensaje
    : [
        `^${(e.requiere ?? []).map((f) => `(?=[\\s\\S]*${escapaRegex(f)})`).join('')}[\\s\\S]{0,${e.max}}$`,
        e.requiere?.length ? `Máximo ${e.max} caracteres y conserva ${e.requiere.join(' y ')}` : `Máximo ${e.max} caracteres: con más, el diseño de la página se desordena`,
      ];
  const partes = conHint ? [e.hint, e.max <= 40 && !e.patron ? `Espacio limitado: hasta ${e.max} caracteres.` : null].filter(Boolean) : [];
  return { widget: e.multi ? 'text' : 'string', ...extra, pattern: patron, ...(partes.length ? { hint: partes.join(' ') } : {}) };
}

function nodoDecap(e) {
  if (e.t === 'plano') {
    return { label: e.et, name: e.n, ...campoTexto(e, { required: !e.opc }) };
  }
  if (e.t === 'i18n') {
    const es = { label: 'Español', name: 'es', ...campoTexto(e, { required: !e.opc }) };
    const en = { label: 'Inglés · vacío = se usa el español', name: 'en', ...campoTexto(e, { required: false }, false) };
    return { label: e.et, name: e.n, widget: 'object', collapsed: false, fields: [es, en] };
  }
  if (e.t === 'grupo') {
    return { label: e.et, name: e.n, widget: 'object', collapsed: !!e.colapsado, ...(e.hint ? { hint: e.hint } : {}), fields: e.campos.map(nodoDecap) };
  }
  const min = e.cuenta ?? e.min;
  const max = e.cuenta ?? e.max;
  return {
    label: e.et,
    label_singular: e.sing,
    name: e.n,
    widget: 'list',
    allow_add: false,
    allow_remove: false,
    allow_reorder: false,
    collapsed: true,
    summary: e.res,
    min,
    max,
    fields: e.campos.map(nodoDecap),
  };
}

// ---------- serializador mínimo de YAML (cadenas entre comillas dobles = JSON) ----------
const esEscalar = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const escalar = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
const sencilla = (o) => Object.values(o).every((v) => esEscalar(v) || (Array.isArray(v) && v.every(esEscalar)));
const enLinea = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.map(escalar).join(', ')}]` : escalar(v)}`).join(', ')} }`;

function mapa(o, ind) {
  const out = [];
  for (const [k, v] of Object.entries(o)) {
    if (esEscalar(v)) out.push(`${ind}${k}: ${escalar(v)}`);
    else if (Array.isArray(v) && v.every(esEscalar)) out.push(`${ind}${k}: [${v.map(escalar).join(', ')}]`);
    else if (Array.isArray(v)) {
      out.push(`${ind}${k}:`);
      out.push(...secuencia(v, `${ind}  `));
    } else {
      out.push(`${ind}${k}:`);
      out.push(...mapa(v, `${ind}  `));
    }
  }
  return out;
}
function secuencia(arr, ind) {
  const out = [];
  for (const el of arr) {
    if (esEscalar(el)) out.push(`${ind}- ${escalar(el)}`);
    else if (sencilla(el) && enLinea(el).length <= 260) out.push(`${ind}- ${enLinea(el)}`);
    else {
      const l = mapa(el, `${ind}  `);
      l[0] = `${ind}- ${l[0].trimStart()}`;
      out.push(...l);
    }
  }
  return out;
}

const COLECCIONES = [
  { col: 'textos', label: 'Textos por sección', descripcion: 'Cambia los textos de cada parte de la página, en español y en inglés. Elige una sección de la lista.' },
  { col: 'productos', label: 'Productos', descripcion: 'Nombres, descripciones y datos de los cafés y cacaos.' },
  { col: 'ajustes', label: 'Contacto y ajustes', descripcion: 'Correos, WhatsApp, direcciones, redes, título para Google, datos legales y avisos del formulario.' },
];

function bloqueYaml() {
  const colecciones = COLECCIONES.map((c) => ({
    name: c.col,
    label: c.label,
    description: c.descripcion,
    editor: { preview: false },
    files: RAICES.filter((r) => r.col === c.col).map((r) => ({
      name: r.archivo,
      label: r.etiqueta,
      description: r.descripcion,
      file: `content/textos/${r.archivo}.json`,
      format: 'json',
      fields: r.campos.map(nodoDecap),
    })),
  }));
  return [INICIO, ...secuencia(colecciones, '  '), FIN].join('\n');
}

function aplicarBloque(config, bloque) {
  const a = config.indexOf(INICIO);
  const b = config.indexOf(FIN);
  if (a >= 0 && b > a) return config.slice(0, a) + bloque + config.slice(b + FIN.length);
  return config.replace(/\s*$/, '\n\n') + bloque + '\n';
}

// ---------- ejecución ----------
const site = JSON.parse(fs.readFileSync(RUTA_SITE, 'utf8'));
const iniciales = Object.fromEntries(RAICES.map((r) => [r.archivo, extraer(r.campos, r.destino(site), r.archivo)]));
const config = fs.readFileSync(RUTA_CONFIG, 'utf8');
const nuevaConfig = aplicarBloque(config, bloqueYaml());

if (CHECK) {
  let ok = true;
  if (nuevaConfig !== config) {
    console.error('public/admin/config.yml no coincide con el esquema: ejecuta `node scripts/generar-panel-textos.mjs`.');
    ok = false;
  }
  const forma = (v) => (Array.isArray(v) ? [v.length, ...v.map(forma)] : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, forma(x)])) : 0);
  for (const r of RAICES) {
    const ruta = path.join(DIR_TEXTOS, `${r.archivo}.json`);
    if (!fs.existsSync(ruta)) {
      console.error(`falta content/textos/${r.archivo}.json`);
      ok = false;
      continue;
    }
    if (JSON.stringify(forma(JSON.parse(fs.readFileSync(ruta, 'utf8')))) !== JSON.stringify(forma(iniciales[r.archivo]))) {
      console.error(`content/textos/${r.archivo}.json no tiene la misma forma que el esquema.`);
      ok = false;
    }
  }
  console.log(ok ? 'generar-panel-textos --check: config.yml y content/textos coinciden con el esquema.' : 'generar-panel-textos --check: hay diferencias.');
  process.exit(ok ? 0 : 1);
}

if (INICIAL) {
  fs.mkdirSync(DIR_TEXTOS, { recursive: true });
  let escritos = 0;
  for (const r of RAICES) {
    const destino = path.join(DIR_TEXTOS, `${r.archivo}.json`);
    if (fs.existsSync(destino) && !FORZAR) continue; // nunca se pisan los textos que ya editó el cliente
    fs.writeFileSync(destino, JSON.stringify(iniciales[r.archivo], null, 2) + '\n');
    escritos++;
  }
  console.log(`content/textos: ${escritos} archivo(s) escrito(s)${escritos < RAICES.length ? ` (los ${RAICES.length - escritos} que ya existían se conservan; --forzar los sobrescribe con los textos de site.json)` : ''}.`);
}
if (nuevaConfig !== config) fs.writeFileSync(RUTA_CONFIG, nuevaConfig);
console.log(`public/admin/config.yml: ${nuevaConfig !== config ? 'bloque de textos actualizado' : 'sin cambios'}.`);
