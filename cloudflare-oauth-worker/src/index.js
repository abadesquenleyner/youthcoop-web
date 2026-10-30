// Proxy OAuth de GitHub para Decap CMS, en un Cloudflare Worker (gratis).
//
// Decap CMS (el panel /admin del sitio) no puede guardar el secreto de la OAuth App en el navegador, así que abre una
// ventana hacia este Worker, que habla con GitHub y le devuelve el token al panel. Rutas (las que Decap espera):
//   GET /auth      redirige a GitHub para que la persona inicie sesión y autorice
//   GET /callback  GitHub vuelve aquí con un código; se cambia por un token y se le entrega al panel con postMessage
//
// Variables y secretos (NINGUNO va escrito en archivos del repositorio):
//   GITHUB_CLIENT_ID      secreto de Wrangler   Client ID de la OAuth App de GitHub
//   GITHUB_CLIENT_SECRET  secreto de Wrangler   Client Secret de la OAuth App
//   ALLOWED_ORIGINS       variable (wrangler.toml)  orígenes que pueden recibir el token, separados por coma
//                         (p. ej. "https://tudominio.com,https://www.tudominio.com"). OBLIGATORIA.
//   GITHUB_SCOPE          variable (opcional)   "public_repo" (repo público, por defecto) o "repo" (repo privado)

const COOKIE_ESTADO = 'decap_oauth_state';

const textoPlano = (estado, cuerpo) => new Response(cuerpo, { status: estado, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

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

/** Comparación en tiempo constante (el "state" es un valor secreto de un solo uso). */
function iguales(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Página que se abre en la ventana emergente: completa el "apretón de manos" de Decap.
 * Decap escucha en la ventana principal; esta página le avisa ("authorizing:github"), Decap contesta y recién entonces
 * se le manda el resultado, SOLO si el origen de quien contesta está en ALLOWED_ORIGINS.
 */
function paginaResultado(estado, contenido, permitidos) {
  // </script> o <!-- dentro del JSON no deben poder cerrar el script: se escapan
  const seguro = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const mensaje = `authorization:github:${estado}:${JSON.stringify(contenido)}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Iniciando sesión…</title></head><body>
<p style="font-family:sans-serif">Iniciando sesión… esta ventana se cerrará sola.</p>
<script>
(function () {
  var permitidos = ${seguro(permitidos)};
  var mensaje = ${seguro(mensaje)};
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
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // borrar la cookie del state: ya se usó
      'set-cookie': `${COOKIE_ESTADO}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax`,
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
      'referrer-policy': 'no-referrer',
    },
  });
}

async function iniciar(request, env) {
  const url = new URL(request.url);
  const estado = crypto.randomUUID();
  const destino = new URL('https://github.com/login/oauth/authorize');
  destino.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  destino.searchParams.set('redirect_uri', `${url.origin}/callback`);
  destino.searchParams.set('scope', env.GITHUB_SCOPE || 'public_repo');
  destino.searchParams.set('state', estado);
  return new Response(null, {
    status: 302,
    headers: {
      location: destino.toString(),
      'cache-control': 'no-store',
      'set-cookie': `${COOKIE_ESTADO}=${estado}; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax`,
    },
  });
}

async function volver(request, env, permitidos) {
  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  if (error) return paginaResultado('error', { message: `GitHub respondió: ${url.searchParams.get('error_description') || error}` }, permitidos);

  const code = url.searchParams.get('code');
  const estado = url.searchParams.get('state');
  if (!code || !iguales(estado, cookie(request, COOKIE_ESTADO))) {
    return paginaResultado('error', { message: 'La sesión de inicio expiró o no es válida. Cierra esta ventana y vuelve a intentarlo desde /admin.' }, permitidos);
  }

  let datos;
  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'decap-oauth-worker' },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/callback` }),
    });
    datos = await r.json();
  } catch {
    return paginaResultado('error', { message: 'No se pudo hablar con GitHub. Inténtalo de nuevo en un momento.' }, permitidos);
  }
  if (!datos || !datos.access_token) {
    return paginaResultado('error', { message: `GitHub no entregó el acceso${datos && datos.error_description ? `: ${datos.error_description}` : ''}.` }, permitidos);
  }
  return paginaResultado('success', { token: datos.access_token, provider: 'github' }, permitidos);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') return textoPlano(405, 'Método no permitido');

    if (url.pathname === '/' || url.pathname === '') return textoPlano(200, 'Proxy OAuth de GitHub para Decap CMS: funcionando.');
    if (url.pathname !== '/auth' && url.pathname !== '/callback') return textoPlano(404, 'No encontrado');

    // sin configuración completa no se hace nada (evita publicar un Worker a medias)
    const permitidos = origenesPermitidos(env);
    const faltan = [!env.GITHUB_CLIENT_ID && 'GITHUB_CLIENT_ID', !env.GITHUB_CLIENT_SECRET && 'GITHUB_CLIENT_SECRET', !permitidos.length && 'ALLOWED_ORIGINS'].filter(Boolean);
    if (faltan.length) return textoPlano(500, `Worker sin configurar: faltan ${faltan.join(', ')}. Ver cloudflare-oauth-worker/README.md.`);
    if (permitidos.some((o) => !/^https?:\/\/[^/]+$/.test(o))) return textoPlano(500, 'ALLOWED_ORIGINS debe tener orígenes como https://tudominio.com (sin ruta ni barra final).');

    return url.pathname === '/auth' ? iniciar(request, env) : volver(request, env, permitidos);
  },
};
