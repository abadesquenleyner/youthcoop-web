// Prueba de google-apps-script/Code.gs sin Google: se ejecuta en un contexto de Node con simulacros de
// SpreadsheetApp, LockService y ContentService. Comprueba validación, deduplicación, honeypot, encabezados,
// formato de texto (anti fórmulas), bloqueo y las respuestas JSON.
//   node --test apps-script.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CODIGO = fs.readFileSync(path.join(AQUI, '..', 'google-apps-script', 'Code.gs'), 'utf8');

/** Hoja de cálculo simulada: matriz de valores + formatos por celda. */
function crearEntorno({ bloqueoDisponible = true, hojaInicial = null, lanzarEnEscritura = false } = {}) {
  const estado = { valores: hojaInicial ? hojaInicial.map((f) => [...f]) : [], formatos: [], bloqueos: { tryLock: 0, release: 0 }, logs: [], congeladas: 0, hojasCreadas: 0 };
  let existe = hojaInicial !== null;
  const celda = (m, r, c) => (m[r - 1] ? m[r - 1][c - 1] : undefined);
  const hoja = {
    getLastRow: () => {
      let ult = 0;
      estado.valores.forEach((f, i) => {
        if (f.some((v) => v !== '' && v !== undefined && v !== null)) ult = i + 1;
      });
      return ult;
    },
    getRange: (fila, col, nf = 1, nc = 1) => ({
      getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (_, j) => celda(estado.valores, fila + i, col + j) ?? '')),
      setValues: (m) => {
        if (lanzarEnEscritura) throw new Error('fallo simulado');
        m.forEach((f, i) =>
          f.forEach((v, j) => {
            (estado.valores[fila - 1 + i] ??= [])[col - 1 + j] = v;
          }),
        );
      },
      setNumberFormats: (m) => {
        m.forEach((f, i) =>
          f.forEach((v, j) => {
            (estado.formatos[fila - 1 + i] ??= [])[col - 1 + j] = v;
          }),
        );
      },
      setFontWeight: () => {},
    }),
    setFrozenRows: () => estado.congeladas++,
  };
  const libro = {
    getSheetByName: (n) => (n === 'Solicitudes' && existe ? hoja : null),
    insertSheet: (n) => {
      assert.equal(n, 'Solicitudes');
      existe = true;
      estado.hojasCreadas++;
      return hoja;
    },
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => libro, openById: () => libro, flush: () => {} },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => (estado.bloqueos.tryLock++, bloqueoDisponible),
        releaseLock: () => estado.bloqueos.release++,
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (s) => ({ s, mime: null, setMimeType(m) { this.mime = m; return this; }, getContent() { return this.s; } }),
    },
    console: { log: (...a) => estado.logs.push(a.join(' ')), error: (...a) => estado.logs.push('ERROR ' + a.join(' ')) },
  };
  vm.createContext(ctx);
  vm.runInContext(CODIGO, ctx, { filename: 'Code.gs' });
  const enviar = (cuerpo) => {
    const contents = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    const out = ctx.doPost({ postData: { contents, type: 'text/plain' } });
    assert.equal(out.mime, 'JSON');
    return JSON.parse(out.getContent());
  };
  return { ctx, estado, enviar };
}

const ENCAB = ['Fecha', 'ID', 'Tipo', 'Nombre', 'Empresa', 'Correo', 'Teléfono', 'País', 'Productos (gramos)', 'Dirección', 'EORI', 'EIN', 'Tax ID', 'Courier', 'Volumen', 'Incoterm', 'Certificación', 'Embarque', 'Mensaje', 'Idioma'];

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const muestras = (o = {}) => ({
  id: ID(1), tipo: 'muestras', lang: 'es', nombre: 'Ana Pérez', empresa: 'Café Corp', correo: 'ana@cafecorp.de', telefono: '+49 30 1',
  pais: 'Alemania', mensaje: 'Hola', productos: [{ value: 'Lupuna', label: 'Lupuna', gramos: 300 }, { value: 'Cacao en grano', label: 'Cacao en grano', gramos: 500 }],
  website: '', direccion: 'Hauptstr. 1', eori: 'DE123', courier: 'DHL', ...o,
});
const cotizacion = (o = {}) => ({
  id: ID(2), tipo: 'cotizacion', lang: 'en', nombre: 'Marta', empresa: 'Torrefazione', correo: 'marta@t.it', telefono: '', pais: 'Italia', mensaje: '',
  productos: [{ value: 'Licor de cacao', label: 'Licor de cacao', gramos: null }], website: '', volumen: '2 contenedores', incoterm: 'CIF', certificacion: 'Orgánico UE', embarque: '2027-03', ...o,
});

test('doGet responde {ok:true, code:"ready"} sin escribir nada', () => {
  const { ctx, estado } = crearEntorno();
  const r = JSON.parse(ctx.doGet().getContent());
  assert.deepEqual(r, { ok: true, code: 'ready' });
  assert.equal(estado.valores.length, 0);
});

test('muestras: crea la hoja y los encabezados, escribe UNA fila con el orden pedido y suelta el bloqueo', () => {
  const { estado, enviar } = crearEntorno();
  const r = enviar(muestras());
  assert.deepEqual(r, { ok: true, code: 'saved' });
  assert.equal(estado.hojasCreadas, 1);
  assert.deepEqual(estado.valores[0], ENCAB);
  assert.equal(estado.valores.length, 2);
  const f = estado.valores[1];
  assert.equal(Object.prototype.toString.call(f[0]), '[object Date]', 'fecha'); // Date de otro contexto: no sirve instanceof
  assert.deepEqual(f.slice(1), [ID(1), 'muestras', 'Ana Pérez', 'Café Corp', 'ana@cafecorp.de', '+49 30 1', 'Alemania', 'Lupuna (300 g); Cacao en grano (500 g)', 'Hauptstr. 1', 'DE123', '', '', 'DHL', '', '', '', '', 'Hola', 'es']);
  assert.deepEqual(estado.bloqueos, { tryLock: 1, release: 1 });
  // todas las columnas menos la fecha en texto plano (un "=..." no puede ejecutarse como fórmula)
  assert.equal(estado.formatos[1][0], 'yyyy-mm-dd hh:mm:ss');
  assert.ok(estado.formatos[1].slice(1).every((x) => x === '@'));
  assert.equal(estado.formatos[1].length, ENCAB.length);
});

test('cotización: sin gramos, con volumen/incoterm/certificación/embarque y sin campos de muestras', () => {
  const { estado, enviar } = crearEntorno();
  assert.deepEqual(enviar(cotizacion()), { ok: true, code: 'saved' });
  const f = estado.valores[1];
  assert.deepEqual(f.slice(1), [ID(2), 'cotizacion', 'Marta', 'Torrefazione', 'marta@t.it', '', 'Italia', 'Licor de cacao', '', '', '', '', '', '2 contenedores', 'CIF', 'Orgánico UE', '2027-03', '', 'en']);
});

test('deduplica por id: el reintento no agrega otra fila y responde duplicate', () => {
  const { estado, enviar } = crearEntorno();
  enviar(muestras());
  const r = enviar(muestras({ nombre: 'Distinto pero mismo id' }));
  assert.deepEqual(r, { ok: true, code: 'duplicate', duplicate: true });
  assert.equal(estado.valores.length, 2);
  assert.equal(enviar(muestras({ id: ID(9) })).code, 'saved');
  assert.equal(estado.valores.length, 3);
});

test('honeypot lleno: responde ok/ignored y no escribe ni siquiera la hoja', () => {
  const { estado, enviar } = crearEntorno();
  assert.deepEqual(enviar(muestras({ website: 'http://spam.example' })), { ok: true, code: 'ignored' });
  assert.equal(estado.valores.length, 0);
  assert.equal(estado.hojasCreadas, 0);
  assert.equal(estado.bloqueos.tryLock, 0);
});

test('validación igual que el sitio: campos obligatorios de muestras', () => {
  const { estado, enviar } = crearEntorno();
  const r = enviar(muestras({ nombre: '  ', empresa: '', correo: 'sin-arroba', productos: [], pais: '', direccion: ' ' }));
  assert.deepEqual(r, { ok: false, code: 'invalid', faltan: ['nombre', 'empresa', 'correo', 'producto', 'pais', 'direccion'] });
  assert.equal(estado.valores.length, 0);
});

test('EORI obligatorio solo en muestras a países de la UE/Reino Unido', () => {
  const { enviar } = crearEntorno();
  assert.deepEqual(enviar(muestras({ eori: '' })), { ok: false, code: 'invalid', faltan: ['eori'] });
  assert.deepEqual(enviar(muestras({ id: ID(3), pais: 'Reino Unido', eori: '' })), { ok: false, code: 'invalid', faltan: ['eori'] });
  assert.equal(enviar(muestras({ id: ID(4), pais: 'Estados Unidos', eori: '', ein: '12-345' })).code, 'saved');
  assert.equal(enviar(muestras({ id: ID(5), pais: 'Canadá', eori: '' })).code, 'saved');
  assert.equal(enviar(cotizacion({ id: ID(6), pais: 'Francia' })).code, 'saved'); // cotización no pide EORI ni dirección
});

test('la lista de países con EORI coincide con src/data/site.json', () => {
  const site = JSON.parse(fs.readFileSync(path.join(AQUI, '..', 'src', 'data', 'site.json'), 'utf8'));
  const del_sitio = site.countries.filter((p) => p.region === 'eori').map((p) => p.value).sort();
  const { ctx } = crearEntorno();
  assert.deepEqual([...ctx.PAISES_EORI].sort(), del_sitio);
  assert.equal(del_sitio.length, 28);
});

test('rechaza cuerpos ilegibles, ids/tipos inválidos y cuerpos enormes', () => {
  const { estado, enviar } = crearEntorno();
  assert.deepEqual(enviar('esto no es json'), { ok: false, code: 'bad_request' });
  assert.deepEqual(enviar('[1,2]'), { ok: false, code: 'bad_request' });
  assert.deepEqual(enviar(''), { ok: false, code: 'bad_request' });
  assert.deepEqual(enviar(muestras({ id: '' })), { ok: false, code: 'bad_request' });
  assert.deepEqual(enviar(muestras({ id: 'a b c' })), { ok: false, code: 'bad_request' });
  assert.deepEqual(enviar(muestras({ tipo: 'otro' })), { ok: false, code: 'bad_request' });
  assert.deepEqual(enviar(muestras({ mensaje: 'x'.repeat(60000) })), { ok: false, code: 'bad_request' });
  assert.equal(estado.valores.length, 0);
});

test('doPost sin evento (ejecutado desde el editor sin datos) no revienta', () => {
  const { ctx } = crearEntorno();
  assert.deepEqual(JSON.parse(ctx.doPost().getContent()), { ok: false, code: 'bad_request' });
});

test('texto: recorta, quita caracteres de control y limita longitudes; un valor que parece fórmula queda como texto', () => {
  const { estado, enviar } = crearEntorno();
  const r = enviar(muestras({ nombre: '  =IMPORTXML("http://x")\u0000\u0007  ', mensaje: 'm'.repeat(6000), telefono: '+51 999' }));
  assert.equal(r.code, 'saved');
  const f = estado.valores[1];
  assert.equal(f[3], '=IMPORTXML("http://x")');
  assert.equal(estado.formatos[1][3], '@', 'formato texto plano para esa celda');
  assert.equal(f[18].length, 5000);
  assert.equal(f[6], '+51 999');
});

test('gramos inválidos o productos mal formados se descartan sin romper', () => {
  const { estado, enviar } = crearEntorno();
  const r = enviar(muestras({ productos: [null, 'x', { value: '' }, { value: 'Pacay', gramos: -5 }, { value: 'Lupuna', label: 'Lupuna', gramos: 100.4 }] }));
  assert.equal(r.code, 'saved');
  assert.equal(estado.valores[1][8], 'Pacay; Lupuna (100 g)');
});

test('encabezados: completa los que faltan sin pisar los existentes', () => {
  const previo = [['Fecha', 'ID', 'Tipo', 'Nombre PERSONALIZADO', '', 'Correo']];
  const { estado, enviar } = crearEntorno({ hojaInicial: previo });
  assert.equal(enviar(muestras()).code, 'saved');
  assert.equal(estado.valores[0][3], 'Nombre PERSONALIZADO');
  assert.equal(estado.valores[0][4], 'Empresa');
  assert.deepEqual(estado.valores[0].slice(5), ENCAB.slice(5));
  assert.equal(estado.valores.length, 2);
  assert.equal(estado.hojasCreadas, 0);
});

test('hoja existente con datos: agrega al final y deduplica contra las filas previas', () => {
  const previo = [ENCAB, [new Date(), ID(1), 'muestras', 'Previa', 'X', 'a@b.co', '', 'Francia', 'Lupuna', '', '', '', '', '', '', '', '', '', '', 'es']];
  const { estado, enviar } = crearEntorno({ hojaInicial: previo });
  assert.equal(enviar(muestras({ id: ID(1) })).code, 'duplicate');
  assert.equal(enviar(muestras({ id: ID(7) })).code, 'saved');
  assert.equal(estado.valores.length, 3);
  assert.equal(estado.valores[2][1], ID(7));
});

test('si no se obtiene el bloqueo responde busy y no escribe ni intenta soltarlo', () => {
  const { estado, enviar } = crearEntorno({ bloqueoDisponible: false });
  assert.deepEqual(enviar(muestras()), { ok: false, code: 'busy' });
  assert.equal(estado.valores.length, 0);
  assert.deepEqual(estado.bloqueos, { tryLock: 1, release: 0 });
});

test('un fallo interno responde {ok:false, code:"error"}, se registra y el bloqueo se libera', () => {
  const { estado, enviar } = crearEntorno({ lanzarEnEscritura: true });
  assert.deepEqual(enviar(muestras()), { ok: false, code: 'error' });
  assert.deepEqual(estado.bloqueos, { tryLock: 1, release: 1 });
  assert.ok(estado.logs.some((l) => l.startsWith('ERROR doPost')));
});

test('probarDesdeEditor guarda una fila de prueba reconocible', () => {
  const { ctx, estado } = crearEntorno();
  ctx.probarDesdeEditor();
  assert.equal(estado.valores.length, 2);
  assert.equal(estado.valores[1][3], 'PRUEBA (borrar)');
  assert.match(estado.logs[0], /"code":"saved"/);
});
