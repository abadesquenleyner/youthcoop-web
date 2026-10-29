// Formulario de muestras y cotización.
//  - Sin VITE_FORM_ENDPOINT (build dist): muestra un aviso de error y NO finge éxito ni envía nada.
//  - Con endpoint (build dist-endpoint, interceptado con page.route): payload correcto, botón deshabilitado
//    mientras envía, deduplicación por id, respuestas de error/inválidas/no-JSON, redirección estilo Apps Script.
import { test, expect, type Page, type Route } from '@playwright/test';
import http from 'node:http';
import { BASE, ENDPOINT_PRUEBA, URL_ENDPOINT, URL_FINAL } from './comun';

const ENVIAR = '#formulario button[type=submit]';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const check = (valor: string) => `label.check:has(input[value="${valor}"])`;
const fila = (valor: string) => `.fila:has(input[value="${valor}"])`;
const JSON_CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json; charset=utf-8' };

async function abrir(page: Page, url: string, idioma = 'es') {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem('yc-idioma', l);
    } catch {}
  }, idioma);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#formulario');
  await page.locator('#formulario').scrollIntoViewIfNeeded();
}

async function muestrasEU(page: Page) {
  await page.fill('input[name=nombre]', 'Ana Pérez');
  await page.fill('input[name=empresa]', 'Café Corp GmbH');
  await page.fill('input[name=correo]', 'ana@cafecorp.de');
  await page.fill('input[name=telefono]', '+49 30 123456');
  await page.click(check('Lupuna'));
  await page.click(check('Cacao en grano'));
  for (let i = 0; i < 2; i++) await page.click(`${fila('Cacao en grano')} button[data-paso="100"]`); // 300 -> 500 g
  await page.selectOption('#pais', 'Alemania');
  await page.fill('textarea[name=direccion]', 'Hauptstr. 1, 10115 Berlin');
  await page.fill('input[name=eori]', 'DE123456789012345');
  await page.fill('input[name=courier]', 'DHL cuenta 123');
  await page.fill('textarea[name=mensaje]', 'Hola, queremos probar.');
}

const PAYLOAD_EU = {
  tipo: 'muestras',
  lang: 'es',
  nombre: 'Ana Pérez',
  empresa: 'Café Corp GmbH',
  correo: 'ana@cafecorp.de',
  telefono: '+49 30 123456',
  pais: 'Alemania',
  mensaje: 'Hola, queremos probar.',
  productos: [
    { value: 'Lupuna', label: 'Lupuna', gramos: 300 },
    { value: 'Cacao en grano', label: 'Cacao en grano', gramos: 500 },
  ],
  website: '',
  direccion: 'Hauptstr. 1, 10115 Berlin',
  eori: 'DE123456789012345',
  courier: 'DHL cuenta 123',
};

interface Captura {
  method: string;
  url: string;
  contentType: string;
  body: any;
  crudo: string;
}

/** Intercepta el endpoint de prueba; `responder` decide la respuesta de cada envío. */
async function interceptar(page: Page, responder: (n: number, route: Route) => Promise<void> | void) {
  const capturas: Captura[] = [];
  await page.route(ENDPOINT_PRUEBA, async (route) => {
    const req = route.request();
    const crudo = req.postData() ?? '';
    let body: any = null;
    try {
      body = JSON.parse(crudo);
    } catch {}
    capturas.push({ method: req.method(), url: req.url(), contentType: req.headers()['content-type'] ?? '', body, crudo });
    await responder(capturas.length, route);
  });
  return capturas;
}
const ok = (route: Route) => route.fulfill({ status: 200, headers: JSON_CORS, body: JSON.stringify({ ok: true, code: 'saved' }) });

test.describe('sin VITE_FORM_ENDPOINT', () => {
  test('validaciones iguales que el sitio original (ES y EN)', async ({ page }) => {
    await abrir(page, URL_FINAL);
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveText('Completa: nombre, empresa, correo válido, al menos un producto, país, dirección de entrega.');
    await expect(page.locator('#aviso')).toHaveClass(/error/);
    await page.click('.idioma button[data-lang=en]');
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveText('Please complete: name, company, valid email, at least one product, country, delivery address.');
  });

  test('con el formulario completo muestra un error claro y NO finge éxito ni envía nada', async ({ page }) => {
    const salientes: string[] = [];
    page.on('request', (r) => {
      if (r.method() !== 'GET' || /script\.google|googleusercontent/.test(r.url())) salientes.push(`${r.method()} ${r.url()}`);
    });
    await abrir(page, URL_FINAL);
    await muestrasEU(page);
    await page.click(ENVIAR);
    const aviso = page.locator('#aviso');
    await expect(aviso).toHaveClass(/error/);
    await expect(aviso).not.toHaveClass(/\bok\b/);
    await expect(aviso).toContainText('NO se envió');
    await expect(aviso).toContainText('gerencia@youthcoop.pe');
    await expect(aviso).not.toContainText('Recibimos tu solicitud');
    // no se perdió lo escrito, el botón sigue activo y no salió ninguna petición
    await expect(page.locator('input[name=nombre]')).toHaveValue('Ana Pérez');
    await expect(page.locator(ENVIAR)).toBeEnabled();
    expect(salientes).toEqual([]);
    // mismo aviso en inglés
    await page.click('.idioma button[data-lang=en]');
    await expect(aviso).toContainText('was NOT sent');
  });
});

test.describe('con endpoint (simulado con page.route)', () => {
  test('muestras a la UE: payload correcto, éxito y formulario limpio', async ({ page }) => {
    const capturas = await interceptar(page, (_n, route) => ok(route));
    await abrir(page, URL_ENDPOINT);
    await muestrasEU(page);
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveText('Recibimos tu solicitud. Te respondemos en menos de 48 horas.');
    await expect(page.locator('#aviso')).toHaveClass(/\bok\b/);

    expect(capturas).toHaveLength(1);
    const c = capturas[0];
    expect(c.method).toBe('POST');
    expect(c.url).toBe(ENDPOINT_PRUEBA);
    expect(c.contentType, 'text/plain evita el preflight CORS').toMatch(/^text\/plain/);
    const { id, ...resto } = c.body;
    expect(id).toMatch(UUID);
    expect(resto).toEqual(PAYLOAD_EU);

    await expect(page.locator('input[name=nombre]')).toHaveValue('');
    await expect(page.locator('input[name=eori]')).toHaveValue('');
    await expect(page.locator(`${check('Lupuna')} input`)).not.toBeChecked();
    await expect(page.locator(ENVIAR)).toBeEnabled();
  });

  test('muestras a EE. UU. (EIN) y a otro país (Tax ID): solo viaja el campo de su región', async ({ page }) => {
    const capturas = await interceptar(page, (_n, route) => ok(route));
    await abrir(page, URL_ENDPOINT);
    for (const [pais, campo, valor] of [
      ['Estados Unidos', 'ein', '12-3456789'],
      ['Canadá', 'taxid', 'BN 123456789'],
    ] as const) {
      await page.fill('input[name=nombre]', 'Bob');
      await page.fill('input[name=empresa]', 'Roasters Inc');
      await page.fill('input[name=correo]', 'bob@roasters.com');
      await page.click(check('Pacay'));
      await page.selectOption('#pais', pais);
      await page.fill('textarea[name=direccion]', '1 Main St');
      await page.fill(`input[name=${campo}]`, valor);
      await page.click(ENVIAR);
      await expect(page.locator('#aviso')).toHaveClass(/\bok\b/);
    }
    expect(capturas).toHaveLength(2);
    const [us, ca] = capturas.map((c) => c.body);
    expect(us).toMatchObject({ pais: 'Estados Unidos', ein: '12-3456789', productos: [{ value: 'Pacay', label: 'Pacay', gramos: 300 }] });
    expect(us).not.toHaveProperty('eori');
    expect(us).not.toHaveProperty('taxid');
    expect(ca).toMatchObject({ pais: 'Canadá', taxid: 'BN 123456789' });
    expect(ca).not.toHaveProperty('ein');
    expect(ca.id).not.toBe(us.id);
  });

  test('cotización (en inglés): payload sin gramos ni datos de muestras', async ({ page }) => {
    const capturas = await interceptar(page, (_n, route) => ok(route));
    await abrir(page, URL_ENDPOINT, 'en');
    await page.click('label.seg:has(input[value=cotizacion])');
    await page.fill('input[name=nombre]', 'Marta Rossi');
    await page.fill('input[name=empresa]', 'Torrefazione SRL');
    await page.fill('input[name=correo]', 'marta@torrefazione.it');
    await page.click(check('Licor de cacao'));
    await page.click(check('Nibs de cacao'));
    await page.selectOption('#pais', 'Italia');
    await page.fill('input[name=volumen]', '2 contenedores de 20 pies');
    await page.selectOption('select[name=incoterm]', 'CIF');
    await page.fill('input[name=certificacion]', 'Orgánico UE');
    await page.fill('input[name=embarque]', '2027-03');
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveText('We received your request. We will reply within 48 hours.');

    expect(capturas).toHaveLength(1);
    const { id, ...resto } = capturas[0].body;
    expect(id).toMatch(UUID);
    expect(resto).toEqual({
      tipo: 'cotizacion',
      lang: 'en',
      nombre: 'Marta Rossi',
      empresa: 'Torrefazione SRL',
      correo: 'marta@torrefazione.it',
      telefono: '',
      pais: 'Italia',
      mensaje: '',
      productos: [
        { value: 'Licor de cacao', label: 'Licor de cacao', gramos: null },
        { value: 'Nibs de cacao', label: 'Nibs de cacao', gramos: null },
      ],
      website: '',
      volumen: '2 contenedores de 20 pies',
      incoterm: 'CIF',
      certificacion: 'Orgánico UE',
      embarque: '2027-03',
    });
  });

  test('el botón queda deshabilitado mientras envía y un segundo envío no sale', async ({ page }) => {
    let soltar!: () => void;
    const puerta = new Promise<void>((r) => (soltar = r));
    const capturas = await interceptar(page, async (_n, route) => {
      await puerta;
      await ok(route);
    });
    await abrir(page, URL_ENDPOINT);
    await muestrasEU(page);
    await page.click(ENVIAR);
    await expect(page.locator(ENVIAR)).toBeDisabled();
    await expect(page.locator('#formulario')).toHaveAttribute('aria-busy', 'true');
    await page.evaluate(() => (document.getElementById('formulario') as HTMLFormElement).requestSubmit()); // intento de doble envío
    await page.waitForTimeout(300);
    expect(capturas).toHaveLength(1);
    soltar();
    await expect(page.locator('#aviso')).toHaveClass(/\bok\b/);
    await expect(page.locator(ENVIAR)).toBeEnabled();
    expect(capturas).toHaveLength(1);
  });

  test('error de red o del script: aviso de error, conserva lo escrito y reutiliza el mismo id al reintentar', async ({ page }) => {
    const capturas = await interceptar(page, (n, route) => (n === 1 ? route.abort('failed') : n === 2 ? route.fulfill({ status: 200, headers: JSON_CORS, body: JSON.stringify({ ok: false, code: 'error' }) }) : ok(route)));
    await abrir(page, URL_ENDPOINT);
    await muestrasEU(page);
    await page.click(ENVIAR); // 1: la red falla
    await expect(page.locator('#aviso')).toHaveText('No pudimos enviar tu solicitud. Inténtalo de nuevo en unos minutos.');
    await expect(page.locator('#aviso')).toHaveClass(/error/);
    await expect(page.locator('input[name=nombre]')).toHaveValue('Ana Pérez');
    await page.click(ENVIAR); // 2: el script responde {ok:false,code:error}
    await expect(page.locator('#aviso')).toHaveClass(/error/);
    await expect(page.locator('#aviso')).not.toContainText('Recibimos');
    await page.click(ENVIAR); // 3: éxito
    await expect(page.locator('#aviso')).toHaveClass(/\bok\b/);
    expect(capturas).toHaveLength(3);
    expect(new Set(capturas.map((c) => c.body.id)).size, 'mismo id en los 3 intentos (la hoja deduplica)').toBe(1);

    // un envío nuevo, con otros datos, lleva otro id
    await muestrasEU(page);
    await page.fill('input[name=nombre]', 'Otra Persona');
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveClass(/\bok\b/);
    expect(capturas[3].body.id).not.toBe(capturas[0].body.id);
  });

  test('si el script marca campos inválidos se muestra «Completa: …» con los nombres del sitio', async ({ page }) => {
    await interceptar(page, (_n, route) => route.fulfill({ status: 200, headers: JSON_CORS, body: JSON.stringify({ ok: false, code: 'invalid', faltan: ['nombre', 'eori'] }) }));
    await abrir(page, URL_ENDPOINT);
    await muestrasEU(page);
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveText('Completa: nombre, EORI.');
    await expect(page.locator('#aviso')).toHaveClass(/error/);
  });

  test('una respuesta que no es JSON (p. ej. página de error de Google) nunca cuenta como éxito', async ({ page }) => {
    await interceptar(page, (_n, route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/html' }, body: '<html><body>Error</body></html>' }));
    await abrir(page, URL_ENDPOINT);
    await muestrasEU(page);
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveText('No pudimos enviar tu solicitud. Inténtalo de nuevo en unos minutos.');
    await expect(page.locator('#aviso')).toHaveClass(/error/);
  });
});

// Comportamiento de red real (sin simulacros del navegador): el POST text/plain recibe un 302 como el de Apps Script
// y el JSON llega por otra URL. Un servidor local hace de script.google.com (:4183) y de script.googleusercontent.com (:4184).
test.describe('redirección estilo Apps Script (servidores locales)', () => {
  const vistas: { servidor: string; method: string; url: string; contentType: string; body: string; origin: string }[] = [];
  let respuestaEco = { ok: true, code: 'saved' } as Record<string, unknown>;
  const servidores: http.Server[] = [];

  const crear = (puerto: number, nombre: string, manejar: (req: http.IncomingMessage, res: http.ServerResponse, cuerpo: string) => void) =>
    new Promise<void>((listo) => {
      const s = http.createServer((req, res) => {
        const trozos: Buffer[] = [];
        req.on('data', (c) => trozos.push(c));
        req.on('end', () => {
          const cuerpo = Buffer.concat(trozos).toString('utf8');
          vistas.push({ servidor: nombre, method: req.method ?? '', url: req.url ?? '', contentType: String(req.headers['content-type'] ?? ''), body: cuerpo, origin: String(req.headers['origin'] ?? '') });
          manejar(req, res, cuerpo);
        });
      });
      servidores.push(s);
      s.listen(puerto, '127.0.0.1', () => listo());
    });

  test.beforeAll(async () => {
    // :4183 = script.google.com (/exec responde 302 al eco, con CORS abierto en la redirección)
    await crear(4183, 'exec', (req, res) => {
      if (req.method === 'OPTIONS') {
        res.writeHead(204); // sin Access-Control-Allow-*: si el navegador hiciera preflight, el envío fallaría
        return res.end();
      }
      res.writeHead(302, { Location: 'http://127.0.0.1:4184/macros/echo?user_content_key=PRUEBA', 'Access-Control-Allow-Origin': '*' });
      res.end();
    });
    // :4184 = script.googleusercontent.com (el eco devuelve el JSON con CORS abierto)
    await crear(4184, 'eco', (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(respuestaEco));
    });
  });
  test.afterAll(async () => {
    await Promise.all(servidores.map((s) => new Promise((r) => s.close(() => r(null)))));
  });
  test.beforeEach(() => {
    vistas.length = 0;
    respuestaEco = { ok: true, code: 'saved' };
  });

  test('POST text/plain sin preflight, 302 seguido, JSON legible: {ok:true} = éxito; {ok:false,code:"invalid"} = «Completa: …»', async ({ page }) => {
    const URL_REDIRECT = BASE + '/redirect/';
    await abrir(page, URL_REDIRECT);
    await muestrasEU(page);
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveClass(/\bok\b/);
    await expect(page.locator('#aviso')).toHaveText('Recibimos tu solicitud. Te respondemos en menos de 48 horas.');
    expect(vistas.map((v) => `${v.servidor}:${v.method}`), 'sin OPTIONS (no hay preflight) y el eco se pide con GET').toEqual(['exec:POST', 'eco:GET']);
    const post = vistas[0];
    expect(post.contentType).toMatch(/^text\/plain/);
    expect(post.origin).toBe(BASE);
    const { id, ...resto } = JSON.parse(post.body);
    expect(id).toMatch(UUID);
    expect(resto).toEqual(PAYLOAD_EU);

    // el script dice que faltan campos -> el sitio lo muestra y no da éxito
    respuestaEco = { ok: false, code: 'invalid', faltan: ['correo'] };
    await muestrasEU(page);
    await page.click(ENVIAR);
    await expect(page.locator('#aviso')).toHaveText('Completa: correo válido.');
    await expect(page.locator('#aviso')).toHaveClass(/error/);
  });
});
