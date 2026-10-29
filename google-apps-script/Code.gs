/**
 * YOUTH COOP · Recepción de solicitudes del sitio web en Google Sheets
 * ---------------------------------------------------------------------------
 * Pegar este archivo completo en el editor de Apps Script de la hoja de cálculo
 * (Extensiones > Apps Script) y desplegarlo como "Aplicación web"
 * (Ejecutar como: Yo · Quién tiene acceso: Cualquier persona).
 * Pasos detallados en google-apps-script/README.md.
 *
 * Qué hace
 *  - doPost(e): recibe el JSON que envía el formulario del sitio (Content-Type text/plain),
 *    valida los campos obligatorios igual que el sitio, ignora el honeypot lleno, no repite
 *    una solicitud con el mismo id y escribe UNA FILA por solicitud en la hoja "Solicitudes".
 *  - Responde siempre JSON: {ok: true|false, code: "..."}.
 *      {ok:true,  code:"saved"}                          fila escrita
 *      {ok:true,  code:"duplicate", duplicate:true}      el id ya estaba en la hoja (reintento)
 *      {ok:true,  code:"ignored"}                        honeypot lleno (bot): no se escribe nada
 *      {ok:false, code:"invalid", faltan:["nombre",..]}  faltan campos obligatorios
 *      {ok:false, code:"bad_request"}                    cuerpo ilegible, tipo/id inválidos o demasiado grande
 *      {ok:false, code:"busy"}                           no se obtuvo el bloqueo a tiempo: reintentar
 *      {ok:false, code:"error"}                          fallo interno (ver Ejecuciones en Apps Script)
 *  - No envía correos. No guarda contraseñas ni claves.
 *
 * Si cambias los campos del formulario del sitio, actualiza también ENCABEZADOS y filaDe().
 */

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

/** Nombre de la pestaña donde se guardan las solicitudes (se crea si no existe). */
var HOJA = 'Solicitudes';

/**
 * Déjalo vacío si este script se creó desde la propia hoja (Extensiones > Apps Script).
 * Si el script es independiente, pon aquí el ID de la hoja (el texto largo de su URL entre /d/ y /edit).
 */
var SPREADSHEET_ID = '';

/** Segundos máximos de espera por el bloqueo antes de responder "busy". */
var ESPERA_BLOQUEO_MS = 25000;

/** Tamaño máximo del cuerpo recibido (caracteres). */
var MAX_CUERPO = 50000;

/** Encabezados de la hoja, en el orden de las columnas. */
var ENCABEZADOS = [
  'Fecha', 'ID', 'Tipo', 'Nombre', 'Empresa', 'Correo', 'Teléfono', 'País',
  'Productos (gramos)', 'Dirección', 'EORI', 'EIN', 'Tax ID', 'Courier', 'Volumen',
  'Incoterm', 'Certificación', 'Embarque', 'Mensaje', 'Idioma'
];

/**
 * Países cuyo EORI es obligatorio al pedir muestras (region "eori" de src/data/site.json:
 * UE y Reino Unido). Debe coincidir con el valor (`value`) de cada país del formulario.
 */
var PAISES_EORI = [
  'Alemania', 'Austria', 'Bulgaria', 'Bélgica', 'Chipre', 'Croacia', 'Dinamarca', 'Eslovaquia',
  'Eslovenia', 'España', 'Estonia', 'Finlandia', 'Francia', 'Grecia', 'Hungría', 'Irlanda',
  'Italia', 'Letonia', 'Lituania', 'Luxemburgo', 'Malta', 'Países Bajos', 'Polonia', 'Portugal',
  'Reino Unido', 'República Checa', 'Rumania', 'Suecia'
];

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
var FORMATO_FECHA = 'yyyy-mm-dd hh:mm:ss';

// ---------------------------------------------------------------------------
// Puntos de entrada
// ---------------------------------------------------------------------------

/** Abrir la URL /exec en el navegador sirve para comprobar que el despliegue responde. No escribe nada. */
function doGet() {
  return json_({ ok: true, code: 'ready' });
}

function doPost(e) {
  var lock = null;
  try {
    var cuerpo = e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
    if (!cuerpo || cuerpo.length > MAX_CUERPO) return json_({ ok: false, code: 'bad_request' });

    var d;
    try {
      d = JSON.parse(cuerpo);
    } catch (err) {
      return json_({ ok: false, code: 'bad_request' });
    }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return json_({ ok: false, code: 'bad_request' });

    // Honeypot: las personas no ven el campo "website"; si viene lleno es un bot. Se responde "ok" sin guardar.
    if (texto_(d.website, 200) !== '') return json_({ ok: true, code: 'ignored' });

    var s = normalizar_(d);
    if (!s) return json_({ ok: false, code: 'bad_request' });

    var faltan = validar_(s);
    if (faltan.length) return json_({ ok: false, code: 'invalid', faltan: faltan });

    lock = LockService.getScriptLock();
    if (!lock.tryLock(ESPERA_BLOQUEO_MS)) {
      lock = null; // no se obtuvo: no hay nada que liberar
      return json_({ ok: false, code: 'busy' });
    }

    var hoja = hoja_();
    asegurarEncabezados_(hoja);
    if (existeId_(hoja, s.id)) return json_({ ok: true, code: 'duplicate', duplicate: true });

    escribirFila_(hoja, filaDe_(s));
    SpreadsheetApp.flush(); // asegura la escritura antes de soltar el bloqueo
    return json_({ ok: true, code: 'saved' });
  } catch (err) {
    console.error('doPost: ' + (err && err.stack ? err.stack : err));
    return json_({ ok: false, code: 'error' });
  } finally {
    if (lock) lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Normalización y validación (misma lógica que el formulario del sitio)
// ---------------------------------------------------------------------------

/** Texto recortado, sin caracteres de control y con un tope de longitud. */
function texto_(v, max) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return '';
  var t = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return t.length > max ? t.substring(0, max) : t;
}

/** Devuelve la solicitud limpia, o null si el id o el tipo no son válidos. */
function normalizar_(d) {
  var id = texto_(d.id, 64);
  if (!ID_RE.test(id)) return null;
  var tipo = texto_(d.tipo, 20);
  if (tipo !== 'muestras' && tipo !== 'cotizacion') return null;

  var productos = [];
  if (Array.isArray(d.productos)) {
    for (var i = 0; i < d.productos.length && productos.length < 20; i++) {
      var p = d.productos[i];
      if (!p || typeof p !== 'object') continue;
      var value = texto_(p.value, 100);
      if (!value) continue;
      var g = typeof p.gramos === 'number' && isFinite(p.gramos) && p.gramos >= 0 ? Math.round(p.gramos) : null;
      productos.push({ value: value, label: texto_(p.label, 100) || value, gramos: g });
    }
  }

  return {
    id: id,
    tipo: tipo,
    lang: texto_(d.lang, 5) === 'en' ? 'en' : 'es',
    nombre: texto_(d.nombre, 200),
    empresa: texto_(d.empresa, 200),
    correo: texto_(d.correo, 200),
    telefono: texto_(d.telefono, 60),
    pais: texto_(d.pais, 100),
    mensaje: texto_(d.mensaje, 5000),
    productos: productos,
    direccion: texto_(d.direccion, 1000),
    eori: texto_(d.eori, 100),
    ein: texto_(d.ein, 100),
    taxid: texto_(d.taxid, 100),
    courier: texto_(d.courier, 200),
    volumen: texto_(d.volumen, 200),
    incoterm: texto_(d.incoterm, 100),
    certificacion: texto_(d.certificacion, 200),
    embarque: texto_(d.embarque, 20)
  };
}

/**
 * Campos obligatorios que faltan. Las claves son las del formulario del sitio
 * (settings.formulario.mensajes.campos): nombre, empresa, correo, producto, pais, direccion, eori.
 */
function validar_(s) {
  var faltan = [];
  if (!s.nombre) faltan.push('nombre');
  if (!s.empresa) faltan.push('empresa');
  if (!EMAIL_RE.test(s.correo)) faltan.push('correo');
  if (!s.productos.length) faltan.push('producto');
  if (!s.pais) faltan.push('pais');
  if (s.tipo === 'muestras' && !s.direccion) faltan.push('direccion');
  if (s.tipo === 'muestras' && PAISES_EORI.indexOf(s.pais) !== -1 && !s.eori) faltan.push('eori');
  return faltan;
}

// ---------------------------------------------------------------------------
// Hoja de cálculo
// ---------------------------------------------------------------------------

function hoja_() {
  var libro = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!libro) throw new Error('No hay hoja de cálculo: crea el script desde la hoja o completa SPREADSHEET_ID.');
  return libro.getSheetByName(HOJA) || libro.insertSheet(HOJA);
}

/** Escribe los encabezados que falten en la fila 1 (no pisa los que ya existen). */
function asegurarEncabezados_(hoja) {
  var n = ENCABEZADOS.length;
  var rango = hoja.getRange(1, 1, 1, n);
  var actuales = rango.getValues()[0];
  var cambiado = false;
  for (var i = 0; i < n; i++) {
    if (String(actuales[i] === null || actuales[i] === undefined ? '' : actuales[i]).trim() === '') {
      actuales[i] = ENCABEZADOS[i];
      cambiado = true;
    }
  }
  if (cambiado) {
    rango.setValues([actuales]);
    hoja.getRange(1, 1, 1, n).setFontWeight('bold');
    hoja.setFrozenRows(1);
  }
}

/** ¿Ya hay una fila con este id? (columna B). */
function existeId_(hoja, id) {
  var ultima = hoja.getLastRow();
  if (ultima < 2) return false;
  var ids = hoja.getRange(2, 2, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return true;
  }
  return false;
}

/** "Lupuna (300 g); Cacao en grano (500 g)"; en cotización no hay gramos. */
function productosTexto_(productos) {
  var partes = [];
  for (var i = 0; i < productos.length; i++) {
    var p = productos[i];
    partes.push(p.label + (p.gramos !== null ? ' (' + p.gramos + ' g)' : ''));
  }
  return partes.join('; ');
}

/** Valores de la fila en el orden de ENCABEZADOS. Muestras y cotización dejan en blanco lo que no aplica. */
function filaDe_(s) {
  var muestras = s.tipo === 'muestras';
  return [
    new Date(), s.id, s.tipo, s.nombre, s.empresa, s.correo, s.telefono, s.pais,
    productosTexto_(s.productos),
    muestras ? s.direccion : '',
    muestras ? s.eori : '',
    muestras ? s.ein : '',
    muestras ? s.taxid : '',
    muestras ? s.courier : '',
    muestras ? '' : s.volumen,
    muestras ? '' : s.incoterm,
    muestras ? '' : s.certificacion,
    muestras ? '' : s.embarque,
    s.mensaje,
    s.lang
  ];
}

/**
 * Escribe la fila al final. Todas las columnas menos la fecha van como TEXTO PLANO ("@"), así un valor
 * que empiece por = + - @ (p. ej. "=IMPORTXML(...)") queda como texto y nunca se ejecuta como fórmula.
 */
function escribirFila_(hoja, valores) {
  var fila = hoja.getLastRow() + 1;
  var rango = hoja.getRange(fila, 1, 1, valores.length);
  var formatos = [];
  for (var i = 0; i < valores.length; i++) formatos.push(i === 0 ? FORMATO_FECHA : '@');
  rango.setNumberFormats([formatos]);
  rango.setValues([valores]);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Ayuda para probar desde el editor (Ejecutar > probarDesdeEditor)
// ---------------------------------------------------------------------------

/**
 * Simula un envío del sitio. Sirve para autorizar el script la primera vez y para ver en el Registro de
 * ejecución la respuesta. Escribe UNA fila de prueba ("PRUEBA (borrar)"): bórrala de la hoja después.
 */
function probarDesdeEditor() {
  var cuerpo = {
    id: 'prueba-' + new Date().getTime(),
    tipo: 'muestras', lang: 'es',
    nombre: 'PRUEBA (borrar)', empresa: 'Prueba S.A.', correo: 'prueba@example.com', telefono: '',
    pais: 'Perú', mensaje: 'Fila de prueba creada desde el editor',
    productos: [{ value: 'Lupuna', label: 'Lupuna', gramos: 300 }],
    direccion: 'Calle de prueba 123', website: ''
  };
  var r = doPost({ postData: { contents: JSON.stringify(cuerpo) } });
  console.log(r.getContent());
}
