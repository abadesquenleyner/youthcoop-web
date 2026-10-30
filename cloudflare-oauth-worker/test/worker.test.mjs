// Pruebas del Worker de acceso al panel. Ejecutar:  cd cloudflare-oauth-worker ; npm test   (Node 20+, sin dependencias)
// No usan secretos reales: la contraseña, el token y el SESSION_SECRET de abajo son valores inventados solo para probar.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import worker from '../src/index.js';
import { generarHash } from '../hash-password.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WORKER = 'https://panel.example.workers.dev';
const ORIGEN_OK = 'https://youthcoop.pe';
const ORIGEN_MAL = 'https://sitio-malo.example';
const CLAVE = 'clave-de-prueba-123';
const TOKEN = 'github_pat_TOKEN_DE_PRUEBA_0000';

const HASH = generarHash(CLAVE);

let contadorIp = 0;
let ip;
beforeEach(() => { ip = `203.0.113.${++contadorIp}`; });

function kvFalso() {
  const m = new Map();
  return {
    m,
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
}

const entorno = (extra = {}) => ({
  ALLOWED_ORIGINS: `${ORIGEN_OK},https://www.youthcoop.pe`,
  PANEL_USER: 'cliente',
  PANEL_PASS_HASH: HASH,
  GITHUB_REPO_TOKEN: TOKEN,
  SESSION_SECRET: 'x'.repeat(48),
  RETARDO_FALLO_MS: '0',
  ...extra,
});

/** Abre /auth y devuelve lo necesario para enviar el formulario. */
async function abrirFormulario(env, cabeceras = {}) {
  const r = await worker.fetch(new Request(`${WORKER}/auth`, { headers: { 'cf-connecting-ip': ip, ...cabeceras } }), env);
  const html = await r.text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
  const setCookie = r.headers.get('set-cookie') || '';
  const cookie = /^(panel_csrf=[^;]*)/.exec(setCookie)?.[1];
  return { r, html, csrf, cookie };
}

async function enviar(env, { usuario = 'cliente', clave = CLAVE, csrf, cookie, cabeceras = {} }) {
  const cuerpo = new URLSearchParams({ usuario, clave, csrf: csrf ?? '' });
  return worker.fetch(
    new Request(`${WORKER}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip, ...(cookie ? { cookie } : {}), ...cabeceras },
      body: cuerpo,
    }),
    env,
  );
}

/** Flujo completo: abre el formulario y lo envía. */
async function entrar(env, datos = {}) {
  const f = await abrirFormulario(env);
  return enviar(env, { csrf: f.csrf, cookie: f.cookie, ...datos });
}

/** Ejecuta el script de la página de cierre con una ventana falsa y devuelve lo que envió al "opener". */
function ejecutarPagina(html, origenesQueContestan) {
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(script, 'la página debe traer un script');
  const enviados = [];
  let cerrada = false;
  let oyente = null;
  const ventana = {
    opener: { postMessage: (mensaje, origen) => enviados.push({ mensaje, origen }) },
    addEventListener: (tipo, fn) => { if (tipo === 'message') oyente = fn; },
    removeEventListener: () => { oyente = null; },
    close: () => { cerrada = true; },
  };
  vm.runInNewContext(script, { window: ventana, document: { body: {} } });
  const saludo = enviados.length;
  for (const origen of origenesQueContestan) if (oyente) oyente({ origin: origen });
  return { enviados, saludo, cerrada: () => cerrada };
}

// ---------- acceso correcto ----------

test('login correcto: devuelve página que entrega el token SOLO al origen permitido', async () => {
  const env = entorno();
  const r = await entrar(env);
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /authorization:github:success:/);

  const { enviados, cerrada } = ejecutarPagina(html, [ORIGEN_OK]);
  // 1) el saludo del apretón de manos (sin datos) y 2) el resultado, dirigido al origen exacto
  assert.equal(enviados[0].mensaje, 'authorizing:github');
  assert.equal(enviados.length, 2);
  assert.equal(enviados[1].origen, ORIGEN_OK);
  assert.equal(enviados[1].mensaje, `authorization:github:success:${JSON.stringify({ token: TOKEN, provider: 'github' })}`);
  assert.ok(cerrada());
  // el token nunca va con destino "*"
  assert.ok(enviados.filter((e) => e.origen === '*').every((e) => !e.mensaje.includes(TOKEN)));
});

test('login correcto: si contesta un origen NO permitido no se envía el token', async () => {
  const r = await entrar(entorno());
  const { enviados } = ejecutarPagina(await r.text(), [ORIGEN_MAL, 'null', 'http://youthcoop.pe']);
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].mensaje, 'authorizing:github');
  assert.ok(enviados.every((e) => !e.mensaje.includes(TOKEN)));
});

test('login correcto: cabeceras de seguridad y cookie anti-CSRF borrada', async () => {
  const r = await entrar(entorno());
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'nonce-/);
  assert.doesNotMatch(r.headers.get('content-security-policy'), /unsafe-inline/);
  assert.match(r.headers.get('set-cookie'), /Max-Age=0/);
});

test('el usuario se compara exacto (mayúsculas distintas fallan)', async () => {
  const r = await entrar(entorno(), { usuario: 'Cliente' });
  assert.equal(r.status, 401);
});

// ---------- acceso incorrecto ----------

test('contraseña errónea: 401, vuelve a mostrar el formulario y NO devuelve el token', async () => {
  const r = await entrar(entorno(), { clave: 'otra-clave-incorrecta' });
  assert.equal(r.status, 401);
  const html = await r.text();
  assert.doesNotMatch(html, new RegExp(TOKEN));
  assert.doesNotMatch(html, /authorization:github/);
  assert.match(html, /Usuario o contraseña incorrectos/);
  assert.match(html, /name="csrf"/); // formulario nuevo con token nuevo
});

test('usuario erróneo con contraseña correcta: mismo mensaje genérico y sin token', async () => {
  const r = await entrar(entorno(), { usuario: 'intruso' });
  assert.equal(r.status, 401);
  const html = await r.text();
  assert.doesNotMatch(html, new RegExp(TOKEN));
  assert.match(html, /Usuario o contraseña incorrectos/);
});

// ---------- origen no permitido ----------

test('/auth con Referer de un origen no permitido: 403, sin formulario', async () => {
  const f = await abrirFormulario(entorno(), { referer: `${ORIGEN_MAL}/admin/` });
  assert.equal(f.r.status, 403);
  assert.doesNotMatch(f.html, /<form/);
});

test('/auth con Referer permitido o sin Referer: muestra el formulario', async () => {
  const a = await abrirFormulario(entorno(), { referer: `${ORIGEN_OK}/admin/` });
  assert.equal(a.r.status, 200);
  assert.match(a.html, /<form method="post" action="\/login"/);
  const b = await abrirFormulario(entorno());
  assert.equal(b.r.status, 200);
});

test('POST /login con cabecera Origin ajena: 403 (aunque todo lo demás sea válido)', async () => {
  const env = entorno();
  const f = await abrirFormulario(env);
  const r = await enviar(env, { csrf: f.csrf, cookie: f.cookie, cabeceras: { origin: ORIGEN_MAL } });
  assert.equal(r.status, 403);
  assert.doesNotMatch(await r.text(), new RegExp(TOKEN));
});

test('el formulario de login trae CSP estricta y cabeceras de protección', async () => {
  const f = await abrirFormulario(entorno());
  const csp = f.r.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|script-src/);
  assert.equal(f.r.headers.get('x-frame-options'), 'DENY');
  assert.equal(f.r.headers.get('cache-control'), 'no-store');
  assert.match(f.r.headers.get('set-cookie'), /HttpOnly/);
  assert.match(f.r.headers.get('set-cookie'), /Secure/);
  assert.match(f.r.headers.get('set-cookie'), /SameSite=Strict/);
});

// ---------- CSRF ----------

test('CSRF: sin token, token alterado, cookie ajena o sin cookie se rechazan', async () => {
  const env = entorno();
  const f = await abrirFormulario(env);
  const otro = await abrirFormulario(env);

  const sinToken = await enviar(env, { csrf: '', cookie: f.cookie });
  assert.equal(sinToken.status, 403);

  const [n, e, firma] = f.csrf.split('.');
  const alterado = await enviar(env, { csrf: `${n}.${Number(e) + 999}.${firma}`, cookie: f.cookie });
  assert.equal(alterado.status, 403);

  const firmaMala = await enviar(env, { csrf: `${n}.${e}.${firma.slice(0, -2)}AA`, cookie: f.cookie });
  assert.equal(firmaMala.status, 403);

  const cookieAjena = await enviar(env, { csrf: f.csrf, cookie: otro.cookie });
  assert.equal(cookieAjena.status, 403);

  const sinCookie = await enviar(env, { csrf: f.csrf, cookie: '' });
  assert.equal(sinCookie.status, 403);

  for (const r of [sinToken, alterado, firmaMala, cookieAjena, sinCookie]) {
    assert.doesNotMatch(await r.text(), new RegExp(TOKEN));
  }
});

test('CSRF: firmado con otro SESSION_SECRET se rechaza', async () => {
  const f = await abrirFormulario(entorno({ SESSION_SECRET: 'y'.repeat(48) }));
  const r = await enviar(entorno(), { csrf: f.csrf, cookie: f.cookie });
  assert.equal(r.status, 403);
});

test('CSRF: es de un solo uso (reenviar el mismo formulario falla)', async () => {
  const env = entorno();
  const f = await abrirFormulario(env);
  const uno = await enviar(env, { csrf: f.csrf, cookie: f.cookie });
  assert.equal(uno.status, 200);
  const dos = await enviar(env, { csrf: f.csrf, cookie: f.cookie });
  assert.equal(dos.status, 403);
  assert.doesNotMatch(await dos.text(), new RegExp(TOKEN));
});

test('CSRF: vence a los 10 minutos', async (t) => {
  const env = entorno();
  const f = await abrirFormulario(env);
  const ahora = Date.now();
  t.mock.method(Date, 'now', () => ahora + 11 * 60 * 1000);
  const r = await enviar(env, { csrf: f.csrf, cookie: f.cookie });
  assert.equal(r.status, 403);
});

// ---------- bloqueo por fallos ----------

async function cincoFallos(env) {
  const estados = [];
  for (let i = 0; i < 5; i++) estados.push((await entrar(env, { clave: `mala-${i}` })).status);
  return estados;
}

test('bloqueo: 5 fallos seguidos bloquean la IP, incluso con la contraseña correcta (KV)', async () => {
  const kv = kvFalso();
  const env = entorno({ LIMITES: kv });
  assert.deepEqual(await cincoFallos(env), [401, 401, 401, 401, 429]);

  const bloqueado = await entrar(env); // contraseña correcta
  assert.equal(bloqueado.status, 429);
  assert.ok(Number(bloqueado.headers.get('retry-after')) > 0);
  const html = await bloqueado.text();
  assert.doesNotMatch(html, new RegExp(TOKEN));
  assert.match(html, /Demasiados intentos/);
});

test('bloqueo: funciona también sin KV (memoria de la instancia)', async () => {
  const env = entorno();
  assert.deepEqual(await cincoFallos(env), [401, 401, 401, 401, 429]);
  assert.equal((await entrar(env)).status, 429);
});

test('bloqueo: otra IP no queda bloqueada', async () => {
  const env = entorno({ LIMITES: kvFalso() });
  await cincoFallos(env);
  ip = '198.51.100.77';
  assert.equal((await entrar(env)).status, 200);
});

test('bloqueo: se levanta a los 15 minutos', async (t) => {
  const env = entorno({ LIMITES: kvFalso() });
  await cincoFallos(env);
  const ahora = Date.now();
  t.mock.method(Date, 'now', () => ahora + 16 * 60 * 1000);
  const r = await entrar(env);
  assert.equal(r.status, 200);
});

test('un acierto antes del quinto fallo reinicia el contador', async () => {
  const env = entorno({ LIMITES: kvFalso() });
  for (let i = 0; i < 4; i++) assert.equal((await entrar(env, { clave: 'mala' })).status, 401);
  assert.equal((await entrar(env)).status, 200);
  for (let i = 0; i < 4; i++) assert.equal((await entrar(env, { clave: 'mala' })).status, 401);
});

test('retardo tras fallo: por defecto ~1 s por intento fallido', async () => {
  const env = entorno();
  delete env.RETARDO_FALLO_MS;
  const t0 = performance.now();
  await entrar(env, { clave: 'mala' });
  assert.ok(performance.now() - t0 >= 900, 'debe esperar cerca de 1 s');
});

// ---------- configuración y rutas ----------

test('sin secretos o con configuración inválida el Worker responde 500 y no muestra formulario', async () => {
  for (const faltante of ['PANEL_USER', 'PANEL_PASS_HASH', 'GITHUB_REPO_TOKEN', 'SESSION_SECRET', 'ALLOWED_ORIGINS']) {
    const env = entorno();
    delete env[faltante];
    const r = await worker.fetch(new Request(`${WORKER}/auth`), env);
    assert.equal(r.status, 500, faltante);
    assert.match(await r.text(), new RegExp(faltante));
  }
  const cortos = await worker.fetch(new Request(`${WORKER}/auth`), entorno({ SESSION_SECRET: 'corto' }));
  assert.equal(cortos.status, 500);
  const hashMalo = await worker.fetch(new Request(`${WORKER}/auth`), entorno({ PANEL_PASS_HASH: 'texto-plano' }));
  assert.equal(hashMalo.status, 500);
  const iterAlto = await worker.fetch(new Request(`${WORKER}/auth`), entorno({ PANEL_PASS_HASH: HASH.replace('$100000$', '$500000$') }));
  assert.equal(iterAlto.status, 500);
});

test('los secretos con salto de línea final (por Get-Clipboard) funcionan', async () => {
  const env = entorno({ PANEL_USER: 'cliente\r\n', PANEL_PASS_HASH: `${HASH}\r\n`, GITHUB_REPO_TOKEN: `${TOKEN}\r\n`, SESSION_SECRET: `${'x'.repeat(48)}\r\n` });
  const r = await entrar(env);
  assert.equal(r.status, 200);
  const { enviados } = ejecutarPagina(await r.text(), [ORIGEN_OK]);
  assert.ok(enviados[1].mensaje.includes(`"token":"${TOKEN}"`));
});

test('rutas: / responde, /callback ya no existe, métodos incorrectos se rechazan', async () => {
  const env = entorno();
  assert.equal((await worker.fetch(new Request(`${WORKER}/`), env)).status, 200);
  assert.equal((await worker.fetch(new Request(`${WORKER}/callback?code=x&state=y`), env)).status, 404);
  assert.equal((await worker.fetch(new Request(`${WORKER}/login`), env)).status, 405);
  assert.equal((await worker.fetch(new Request(`${WORKER}/auth`, { method: 'POST' }), env)).status, 405);
});

test('no se escriben usuario, contraseña ni token en los registros', async (t) => {
  const registros = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, m, (...a) => registros.push(a.join(' ')));
  const env = entorno();
  await entrar(env, { clave: 'mala-clave-secreta' });
  await entrar(env);
  assert.equal(registros.join('\n'), '');
});

test('el nombre escrito se devuelve escapado en el formulario (sin inyección HTML)', async () => {
  const r = await entrar(entorno(), { usuario: '"><script>alert(1)</script>' });
  const html = await r.text();
  assert.equal(r.status, 401);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&quot;&gt;&lt;script&gt;/);
});

// ---------- script de hash ----------

test('hash-password.mjs: lee de STDIN, emite el formato esperado y el Worker lo acepta', async () => {
  const script = path.join(AQUI, '..', 'hash-password.mjs');
  const salida = execFileSync(process.execPath, [script], { input: 'otra-clave-larga-456\r\n', encoding: 'utf8' }).trim();
  assert.match(salida, /^pbkdf2\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  const env = entorno({ PANEL_PASS_HASH: salida });
  assert.equal((await entrar(env, { clave: 'otra-clave-larga-456' })).status, 200);
  assert.equal((await entrar(env, { clave: CLAVE })).status, 401);
});

test('hash-password.mjs: rechaza contraseñas cortas y no imprime nada en stdout', () => {
  const script = path.join(AQUI, '..', 'hash-password.mjs');
  const r = spawnSync(process.execPath, [script], { input: 'corta', encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /al menos 12/);
});

test('hash-password.mjs: dos hashes de la misma contraseña usan sal distinta', () => {
  assert.notEqual(generarHash(CLAVE), generarHash(CLAVE));
});
