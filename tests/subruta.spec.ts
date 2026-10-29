// El sitio final (7 fotos asignadas, pendientes ocultos) bajo una subruta tipo GitHub Pages (/youthcoop/) y en la raíz:
// ningún recurso da 404, las 7 fotos cargan, todo sale de la misma subruta y no hay llamadas a /api.
import { test, expect, type Page } from '@playwright/test';
import { BASE, URL_FINAL, URL_RAIZ, recorrerPagina } from './comun';

interface Trafico {
  respuestas: { url: string; status: number }[];
  fallidas: string[];
  consola: string[];
}

function vigilar(page: Page): Trafico {
  const t: Trafico = { respuestas: [], fallidas: [], consola: [] };
  page.on('response', (r) => t.respuestas.push({ url: r.url(), status: r.status() }));
  page.on('requestfailed', (r) => t.fallidas.push(`${r.url()} · ${r.failure()?.errorText}`));
  page.on('console', (m) => {
    if (m.type() === 'error') t.consola.push(m.text());
  });
  page.on('pageerror', (e) => t.consola.push(String(e)));
  return t;
}

const PROPIAS = (u: string, origen: string) => u.startsWith(origen);

for (const caso of [
  { nombre: 'subruta /youthcoop/ (servidor estilo GitHub Pages)', url: URL_FINAL, origen: BASE, prefijo: '/youthcoop/' },
  { nombre: 'raíz con vite preview', url: URL_RAIZ, origen: new URL(URL_RAIZ).origin, prefijo: '/' },
]) {
  test(`${caso.nombre}: 7 fotos, sin 404 y sin /api`, async ({ page }) => {
    const t = vigilar(page);
    await page.goto(caso.url, { waitUntil: 'networkidle' });
    await page.waitForSelector('footer .legal');
    await recorrerPagina(page);
    await page.waitForLoadState('networkidle');

    // 1) las 7 fotos asignadas cargaron, cada una con su alt y srcset de 3 anchos
    const fotos = await page.$$eval('img.foto-img', (imgs) =>
      imgs.map((i) => {
        const im = i as HTMLImageElement;
        return { src: im.currentSrc, alt: im.alt, ancho: im.naturalWidth, srcset: im.srcset.split(',').length, lazy: im.loading, completa: im.complete };
      }),
    );
    expect(fotos, 'fotos reales en el DOM').toHaveLength(7);
    for (const f of fotos) {
      expect(f.completa && f.ancho > 0, `foto cargada: ${f.src}`).toBe(true);
      expect(f.src.startsWith(caso.origen + caso.prefijo + 'media/'), `foto bajo la subruta: ${f.src}`).toBe(true);
      expect(f.alt.length, `alt de ${f.src}`).toBeGreaterThan(20);
      expect(f.srcset).toBe(3);
    }
    // el hero va eager; el resto lazy
    expect(fotos.filter((f) => f.lazy === 'eager')).toHaveLength(1);

    // 2a) las 3 variantes (480/800/1200) de cada foto existen, aunque el navegador solo baje una
    const candidatas = await page.$$eval('img.foto-img', (imgs) => imgs.flatMap((i) => (i as HTMLImageElement).srcset.split(',').map((c) => new URL(c.trim().split(' ')[0], document.baseURI).href)));
    expect(new Set(candidatas).size).toBe(21);
    for (const u of candidatas) {
      const r = await page.request.get(u);
      expect(r.status(), u).toBe(200);
      expect(r.headers()['content-type'], u).toBe('image/webp');
    }

    // 2) los logos (cabecera oscuro/claro y pie) también cargaron
    const logos = await page.$$eval('header .marca img, footer img', (imgs) => imgs.map((i) => ({ src: (i as HTMLImageElement).currentSrc, ancho: (i as HTMLImageElement).naturalWidth })));
    expect(logos.length).toBeGreaterThanOrEqual(3);
    for (const l of logos) expect(l.ancho, `logo ${l.src}`).toBeGreaterThan(0);

    // 3) ninguna respuesta propia con error y todas bajo el prefijo
    const propias = t.respuestas.filter((r) => PROPIAS(r.url, caso.origen));
    expect(propias.length, "index + js + css + 7 fotos + 3 logos").toBeGreaterThanOrEqual(13);
    const malas = propias.filter((r) => r.status >= 400);
    expect(malas, `recursos propios con error: ${JSON.stringify(malas)}`).toEqual([]);
    for (const r of propias) expect(new URL(r.url).pathname.startsWith(caso.prefijo), `fuera de la subruta: ${r.url}`).toBe(true);
    expect(propias.filter((r) => /\/api\//.test(r.url)), 'sin llamadas a /api').toEqual([]);

    // 4) nada propio falló en la red y la consola no tiene errores (las fuentes de Google se ignoran si no hay internet)
    const fallidasPropias = t.fallidas.filter((f) => PROPIAS(f, caso.origen));
    expect(fallidasPropias).toEqual([]);
    const errores = t.consola.filter((c) => !/fonts\.g|ERR_INTERNET|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|Failed to load resource/.test(c));
    expect(errores).toEqual([]);

    // 5) las anclas no navegan: el menú lleva a #contacto sin cambiar de página
    await page.click('header nav a[href="#contacto"]');
    await expect.poll(() => new URL(page.url()).hash).toBe('#contacto');
    expect(new URL(page.url()).pathname).toBe(caso.prefijo);
  });
}

test('todos los enlaces del sitio son seguros (https, mailto, tel o #ancla)', async ({ page }) => {
  await page.goto(URL_FINAL, { waitUntil: 'networkidle' });
  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
  expect(hrefs.length).toBeGreaterThan(20);
  for (const h of hrefs) expect(h, `enlace: ${h}`).toMatch(/^(https:\/\/|mailto:|tel:|#)/);
  // los externos abren en pestaña nueva sin darle acceso a la página (rel noopener)
  const externos = await page.$$eval('a[target=_blank]', (as) => as.map((a) => a.getAttribute('rel') ?? ''));
  expect(externos.length).toBeGreaterThan(3);
  for (const rel of externos) expect(rel).toContain('noopener');
});

test('el sitio no contiene rutas /admin ni referencias al backend', async ({ page }) => {
  await page.goto(URL_FINAL, { waitUntil: 'networkidle' });
  const html = await page.content();
  expect(html).not.toMatch(/\/admin|\/api\/v1|localhost:4060/);
  const resp = await page.request.get(BASE + '/youthcoop/admin');
  expect(resp.status(), 'no hay ruta /admin (404 como en Pages)').toBe(404);
});
