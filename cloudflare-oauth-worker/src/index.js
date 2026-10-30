// Inicio de sesión con USUARIO y CONTRASEÑA para el panel /admin (Decap CMS), en un Cloudflare Worker (plan gratis).
//
// Decap CMS (backend "github") abre una ventana hacia este Worker y espera recibir un token de GitHub con postMessage.
// Aquí el cliente NO usa GitHub: escribe usuario y contraseña en un formulario propio; si son correctos, el Worker le
// entrega al panel un token fine-grained guardado como secreto (GITHUB_REPO_TOKEN, limitado a UN repositorio).
//
// Rutas:
//   GET  /        texto de estado
//   GET  /auth    muestra el formulario de acceso (la ruta que Decap abre)
//   POST /login   valida el formulario y, si es correcto, cierra la ventana entregando el token al panel
//
// Secretos (se cargan con `npx wrangler secret put`; NINGUNO va escrito en archivos del repositorio):
//   PANEL_USER          nombre de usuario del cliente
//   PANEL_PASS_HASH     hash de la contraseña, formato pbkdf2$iteraciones$salBase64$hashBase64 (ver hash-password.mjs)
//   GITHUB_REPO_TOKEN   token fine-grained de GitHub (solo el repo youthcoop-web, Contents: read and write)
//   SESSION_SECRET      cadena aleatoria larga (mínimo 32 caracteres) para firmar el token anti-CSRF del formulario
// Variables (wrangler.toml):
//   ALLOWED_ORIGINS     orígenes que pueden recibir el token, separados por coma. OBLIGATORIA.
// Binding opcional (recomendado):
//   LIMITES             espacio KV para contar intentos fallidos por IP y marcar como usado cada formulario.
//                       Sin él, los contadores viven solo en la memoria de cada instancia del Worker (mejor esfuerzo).
// Variable opcional de pruebas:
//   RETARDO_FALLO_MS    pausa tras un intento fallido (por defecto 1000)

const ITER_MAX = 100000; // tope de iteraciones PBKDF2 del plan gratis de Workers
const MAX_FALLOS = 5;
const BLOQUEO_S = 15 * 60;
const CSRF_VIGENCIA_S = 10 * 60;
const COOKIE_CSRF = 'panel_csrf';

const enc = new TextEncoder();

// ---------- utilidades ----------

const secreto = (v) => (typeof v === 'string' ? v.trim() : '');

function origenesPermitidos(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function cookie(request, nombre) {
  for (const parte of (request.headers.get('cookie') || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return '';
}

const aBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const aleatorioB64Url = (n) => aBase64(crypto.getRandomValues(new Uint8Array(n))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function escaparHtml(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Comparación en tiempo constante de dos arreglos de bytes. */
function igualesBytes(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

/** Compara dos textos en tiempo constante sin importar su largo (se comparan sus huellas SHA-256). */
async function igualesTexto(a, b) {
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  return igualesBytes(new Uint8Array(ha), new Uint8Array(hb));
}

const dormir = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

const textoPlano = (estado, cuerpo) =>
  new Response(cuerpo, { status: estado, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

// ---------- contraseña (PBKDF2-SHA256) ----------

function parsearHash(valor) {
  const m = /^pbkdf2\$(\d{1,6})\$([A-Za-z0-9+/]+=*)\$([A-Za-z0-9+/]+=*)$/.exec(secreto(valor));
  if (!m) return null;
  const iter = Number(m[1]);
  if (!Number.isInteger(iter) || iter < 1000 || iter > ITER_MAX) return null;
  try {
    const sal = deBase64(m[2]);
    const hash = deBase64(m[3]);
    if (sal.length < 8 || hash.length < 16) return null;
    return { iter, sal, hash };
  } catch {
    return null;
  }
}

async function derivar(clave, sal, iter, bytes) {
  const llave = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, llave, bytes * 8));
}

async function claveCorrecta(clave, hashGuardado) {
  const h = parsearHash(hashGuardado);
  if (!h) return false;
  return igualesBytes(await derivar(clave, h.sal, h.iter, h.hash.length), h.hash);
}

// ---------- almacén de contadores (KV si existe; si no, memoria de la instancia) ----------

const memoria = new Map();

function almacen(env) {
  const kv = env.LIMITES;
  if (kv && typeof kv.get === 'function' && typeof kv.put === 'function') {
    return {
      async get(k) {
        const v = await kv.get(k);
        if (!v) return null;
        try { return JSON.parse(v); } catch { return null; }
      },
      // KV exige un TTL mínimo de 60 s
      put: (k, v, ttlS) => kv.put(k, JSON.stringify(v), { expirationTtl: Math.max(60, ttlS) }),
      del: (k) => kv.delete(k),
    };
  }
  return {
    async get(k) {
      const r = memoria.get(k);
      if (!r) return null;
      if (r.exp <= Date.now()) { memoria.delete(k); return null; }
      return r.v;
    },
    async put(k, v, ttlS) {
      if (memoria.size > 5000) memoria.clear(); // evita crecer sin límite
      memoria.set(k, { v, exp: Date.now() + ttlS * 1000 });
    },
    async del(k) { memoria.delete(k); },
  };
}

const ipDe = (request) => request.headers.get('cf-connecting-ip') || 'sin-ip';

async function bloqueadoHasta(alm, ip) {
  const r = await alm.get(`fallos:${ip}`);
  return r && r.hasta && r.hasta > Date.now() ? r.hasta : 0;
}

async function registrarFallo(alm, ip) {
  const k = `fallos:${ip}`;
  const r = await alm.get(k);
  const ahora = Date.now();
  const n = r && !(r.hasta && r.hasta <= ahora) ? r.n + 1 : 1;
  const hasta = n >= MAX_FALLOS ? ahora + BLOQUEO_S * 1000 : 0;
  await alm.put(k, { n, hasta }, BLOQUEO_S);
  return hasta;
}

// ---------- token anti-CSRF (HMAC con SESSION_SECRET + cookie + un solo uso) ----------

async function llaveHmac(env) {
  return crypto.subtle.importKey('raw', enc.encode(secreto(env.SESSION_SECRET)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function crearCsrf(env) {
  const nonce = aleatorioB64Url(18);
  const exp = Math.floor(Date.now() / 1000) + CSRF_VIGENCIA_S;
  const carga = `${nonce}.${exp}`;
  const firma = aBase64(await crypto.subtle.sign('HMAC', await llaveHmac(env), enc.encode(carga))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { nonce, token: `${carga}.${firma}` };
}

/** Devuelve el nonce si el token es válido, no venció, coincide con la cookie y no se usó antes; si no, null. */
async function validarCsrf(env, token, nonceCookie, alm) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3 || !nonceCookie) return null;
  const [nonce, exp, firma] = partes;
  if (!/^\d{1,12}$/.test(exp) || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  if (!(await igualesTexto(nonce, nonceCookie))) return null;
  let firmaBytes;
  try { firmaBytes = deBase64(firma.replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  const ok = await crypto.subtle.verify('HMAC', await llaveHmac(env), firmaBytes, enc.encode(`${nonce}.${exp}`));
  if (!ok) return null;
  if (await alm.get(`csrf:${nonce}`)) return null; // ya usado
  await alm.put(`csrf:${nonce}`, { u: 1 }, CSRF_VIGENCIA_S + 60);
  return nonce;
}

// ---------- páginas ----------

const CABECERAS_PAGINA = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  pragma: 'no-cache',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  // same-origin y no no-referrer: con no-referrer el navegador manda "Origin: null" al enviar el formulario y /login lo rechaza
  'referrer-policy': 'same-origin',
};

const cookieCsrf = (valor, maxAge) => `${COOKIE_CSRF}=${valor}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Strict`;

async function paginaLogin(env, { estado = 200, mensaje = '', usuario = '', extra = {} } = {}) {
  const { nonce, token } = await crearCsrf(env);
  const nonceCsp = aleatorioB64Url(12);
  const aviso = mensaje ? `<p class="aviso" role="alert">${escaparHtml(mensaje)}</p>` : '';
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Entrar al panel · YOUTH COOP</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&display=swap">
<style nonce="${nonceCsp}">
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;background:#4E3632;font-family:'Outfit',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#4E3632}
main{width:100%;max-width:380px;background:#fff;border-radius:16px;padding:32px 28px;border-top:6px solid #FC5300;box-shadow:0 10px 30px rgba(0,0,0,.3)}
h1{margin:0 0 4px;font-size:26px;font-weight:700}
.sub{margin:0 0 22px;font-size:16px;line-height:1.4}
label{display:block;margin:14px 0 6px;font-size:16px;font-weight:600}
input{width:100%;padding:12px 14px;font:inherit;font-size:17px;color:#4E3632;border:2px solid #4E3632;border-radius:10px;background:#fff}
input:focus{outline:3px solid #FC5300;outline-offset:1px}
button{width:100%;margin-top:22px;padding:14px;font:inherit;font-size:19px;font-weight:700;color:#fff;background:#FC5300;border:0;border-radius:10px;cursor:pointer}
button:hover{background:#d94600}
button:focus-visible{outline:3px solid #4E3632;outline-offset:2px}
.aviso{margin:0 0 6px;padding:10px 12px;border-radius:8px;background:#fdebe3;border:1px solid #FC5300;font-size:16px;line-height:1.4}
</style></head><body>
<main>
<h1>Panel YOUTH COOP</h1>
<p class="sub">Escribe tu usuario y contraseña para cambiar las fotos y los textos de la web.</p>
${aviso}
<form method="post" action="/login" autocomplete="on">
<input type="hidden" name="csrf" value="${escaparHtml(token)}">
<label for="usuario">Usuario</label>
<input id="usuario" name="usuario" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="100" required value="${escaparHtml(usuario)}"${usuario ? '' : ' autofocus'}>
<label for="clave">Contraseña</label>
<input id="clave" name="clave" type="password" autocomplete="current-password" maxlength="200" required${usuario ? ' autofocus' : ''}>
<button type="submit">Entrar</button>
</form>
</main></body></html>`;
  return new Response(html, {
    status: estado,
    headers: {
      ...CABECERAS_PAGINA,
      'content-security-policy': `default-src 'none'; style-src 'nonce-${nonceCsp}' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
      'set-cookie': cookieCsrf(nonce, CSRF_VIGENCIA_S),
      ...extra,
    },
  });
}

/**
 * Página que se carga tras un acceso correcto: completa el "apretón de manos" de Decap.
 * Decap escucha en la ventana principal; esta página le avisa ("authorizing:github"), Decap contesta y recién entonces
 * se le manda el resultado, SOLO si el origen de quien contesta está en ALLOWED_ORIGINS (nunca se envía a "*").
 */
function paginaResultado(estado, contenido, permitidos) {
  // </script> o <!-- dentro del JSON no deben poder cerrar el script: se escapan
  const seguro = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const mensaje = `authorization:github:${estado}:${JSON.stringify(contenido)}`;
  const nonceCsp = aleatorioB64Url(12);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Iniciando sesión…</title></head><body>
<p style="font-family:sans-serif">Iniciando sesión… esta ventana se cerrará sola.</p>
<script nonce="${nonceCsp}">
(function () {
  var permitidos = ${seguro(permitidos)};
  var mensaje = ${seguro(mensaje)};
  if (!window.opener) { document.body.textContent = 'Esta ventana debe abrirse desde el panel (youthcoop.pe/admin). Ciérrala y vuelve a empezar.'; return; }
  function recibir(e) {
    if (permitidos.indexOf(e.origin) === -1) return;
    window.removeEventListener('message', recibir, false);
    window.opener.postMessage(mensaje, e.origin);
    window.close();
  }
  window.addEventListener('message', recibir, false);
  window.opener.postMessage('authorizing:github', '*');
})();
</script></body></html>`;
  return new Response(html, {
    status: 200,
    headers: {
      ...CABECERAS_PAGINA,
      'content-security-policy': `default-src 'none'; script-src 'nonce-${nonceCsp}'; frame-ancestors 'none'; base-uri 'none'`,
      'set-cookie': cookieCsrf('', 0), // borrar la cookie anti-CSRF: ya se usó
    },
  });
}

// ---------- rutas ----------

function faltaConfiguracion(env, permitidos) {
  const faltan = [
    !secreto(env.PANEL_USER) && 'PANEL_USER',
    !secreto(env.PANEL_PASS_HASH) && 'PANEL_PASS_HASH',
    !secreto(env.GITHUB_REPO_TOKEN) && 'GITHUB_REPO_TOKEN',
    !secreto(env.SESSION_SECRET) && 'SESSION_SECRET',
    !permitidos.length && 'ALLOWED_ORIGINS',
  ].filter(Boolean);
  if (faltan.length) return `Worker sin configurar: faltan ${faltan.join(', ')}. Ver cloudflare-oauth-worker/README.md.`;
  if (permitidos.some((o) => !/^https?:\/\/[^/]+$/.test(o))) return 'ALLOWED_ORIGINS debe tener orígenes como https://tudominio.com (sin ruta ni barra final).';
  if (secreto(env.SESSION_SECRET).length < 32) return 'SESSION_SECRET es demasiado corto (mínimo 32 caracteres).';
  // Un token con espacios, saltos internos o caracteres raros hace fallar el fetch de Decap ("Invalid value")
  const tk = secreto(env.GITHUB_REPO_TOKEN);
  if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(tk)) {
    // Diagnóstico sin revelar el token: largo, prefijo esperado y códigos de los caracteres no válidos
    const raros = [...new Set([...tk].filter((c) => !/[A-Za-z0-9_]/.test(c)).map((c) => c.codePointAt(0)))].slice(0, 10);
    return `GITHUB_REPO_TOKEN no tiene el formato de un token de GitHub (github_pat_...). Vuelve a copiarlo y cargarlo. [largo ${tk.length}, empieza bien: ${/^(github_pat_|ghp_)/.test(tk) ? 'sí' : 'no'}, caracteres no válidos: ${raros.join(',') || 'ninguno'}]`;
  }
  if (!parsearHash(env.PANEL_PASS_HASH)) return 'PANEL_PASS_HASH no tiene el formato esperado (pbkdf2$iteraciones$sal$hash, iteraciones hasta 100000). Genéralo con hash-password.mjs.';
  return '';
}

async function mostrarFormulario(request, env, permitidos) {
  // Decap abre esta ventana desde el panel: si el navegador manda Referer y no es un origen permitido, se rechaza.
  const ref = request.headers.get('referer');
  if (ref) {
    let origen = '';
    try { origen = new URL(ref).origin; } catch { /* Referer inválido */ }
    if (!origen || !permitidos.includes(origen)) return textoPlano(403, 'Origen no permitido.');
  }
  return paginaLogin(env);
}

async function iniciarSesion(request, env, permitidos) {
  const url = new URL(request.url);
  // El formulario solo se acepta si viene de la propia página del Worker
  const origenPeticion = request.headers.get('origin');
  if (origenPeticion && origenPeticion !== url.origin) return textoPlano(403, 'Origen no permitido.');

  let datos;
  try { datos = await request.formData(); } catch { return textoPlano(400, 'Formulario inválido.'); }
  const usuario = String(datos.get('usuario') || '').slice(0, 100);
  const clave = String(datos.get('clave') || '').slice(0, 200);

  const alm = almacen(env);
  const nonce = await validarCsrf(env, datos.get('csrf'), cookie(request, COOKIE_CSRF), alm);
  if (!nonce) return paginaLogin(env, { estado: 403, mensaje: 'La página de acceso caducó. Escribe tus datos otra vez.' });

  const ip = ipDe(request);
  const hasta = await bloqueadoHasta(alm, ip);
  if (hasta) return bloqueo(env, hasta);

  // Se calculan SIEMPRE las dos comparaciones (usuario y contraseña) para no revelar cuál falló
  const [usuarioOk, claveOk] = await Promise.all([igualesTexto(usuario, secreto(env.PANEL_USER)), claveCorrecta(clave, env.PANEL_PASS_HASH)]);
  if (!(usuarioOk && claveOk)) {
    const nuevoBloqueo = await registrarFallo(alm, ip);
    await dormir(env.RETARDO_FALLO_MS === undefined ? 1000 : Number(env.RETARDO_FALLO_MS) || 0);
    if (nuevoBloqueo) return bloqueo(env, nuevoBloqueo);
    return paginaLogin(env, { estado: 401, mensaje: 'Usuario o contraseña incorrectos.', usuario });
  }

  await alm.del(`fallos:${ip}`);
  return paginaResultado('success', { token: secreto(env.GITHUB_REPO_TOKEN), provider: 'github' }, permitidos);
}

function bloqueo(env, hasta) {
  const seg = Math.max(1, Math.ceil((hasta - Date.now()) / 1000));
  return paginaLogin(env, {
    estado: 429,
    mensaje: `Demasiados intentos fallidos. Espera ${Math.ceil(seg / 60)} minutos e inténtalo de nuevo.`,
    extra: { 'retry-after': String(seg) },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ruta = url.pathname;

    if (ruta === '/' || ruta === '') {
      if (request.method !== 'GET') return textoPlano(405, 'Método no permitido');
      return textoPlano(200, 'Acceso al panel de YOUTH COOP (Decap CMS): funcionando.');
    }
    if (ruta !== '/auth' && ruta !== '/login') return textoPlano(404, 'No encontrado');
    if ((ruta === '/auth' && request.method !== 'GET') || (ruta === '/login' && request.method !== 'POST')) {
      return textoPlano(405, 'Método no permitido');
    }

    // sin configuración completa no se hace nada (evita publicar un Worker a medias)
    const permitidos = origenesPermitidos(env);
    const error = faltaConfiguracion(env, permitidos);
    if (error) return textoPlano(500, error);

    return ruta === '/auth' ? mostrarFormulario(request, env, permitidos) : iniciarSesion(request, env, permitidos);
  },
};
