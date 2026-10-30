// Panel /admin (Decap CMS): se publica con el sitio, funciona bajo una subruta tipo GitHub Pages, no contamina el resto del sitio
// y carga con la versión fija del CDN. No inicia sesión (eso requiere GitHub): comprueba que el panel arranca y pide entrar.
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { BASE, RAIZ, URL_FINAL } from './comun';

const ADMIN = `${BASE}/youthcoop/admin/`;

test('el build publica /admin con config.yml y los 13 huecos de foto, sin copiar los originales', async ({ request }) => {
  const html = await request.get(ADMIN);
  expect(html.status()).toBe(200);
  const cuerpo = await html.text();
  expect(cuerpo).toContain('href="config.yml"'); // relativa: sirve en la raíz y en la subruta
  expect(cuerpo).toMatch(/decap-cms@3\.\d+\.\d+\/dist\/decap-cms\.js/); // versión fija, no @latest ni @3
  expect(cuerpo).toMatch(/integrity="sha384-[A-Za-z0-9+/]{64}"/); // huella SRI
  expect(cuerpo).toContain('noindex');

  const yml = await request.get(`${ADMIN}config.yml`);
  expect(yml.status()).toBe(200);
  const cfg = await yml.text();
  expect(cfg).toMatch(/^\s+name: github$/m);
  expect(cfg).toMatch(/^\s+branch: main$/m);
  expect(cfg).toMatch(/^\s+repo: \S+\/\S+/m);
  expect(cfg).toMatch(/^\s+base_url: https:\/\/\S+/m);
  expect(cfg).toMatch(/^publish_mode: simple$/m);
  expect(cfg).toMatch(/^media_folder: content\/originales$/m);
  expect(cfg).toMatch(/^public_folder: content\/originales$/m); // sin barra inicial: Decap muestra las miniaturas
  // cada hueco de content/fotos.json está en el panel
  const fotos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'content', 'fotos.json'), 'utf8'));
  expect(Object.keys(fotos)).toHaveLength(13);
  for (const clave of Object.keys(fotos)) expect(cfg, `hueco ${clave} en config.yml`).toMatch(new RegExp(`name: ${clave}$`, 'm'));

  // los originales y el JSON de contenido no se publican en la web
  for (const ruta of ['content/fotos.json', 'content/originales/hero.webp']) {
    expect((await request.get(`${BASE}/youthcoop/${ruta}`)).status(), ruta).toBe(404);
  }
});

test('el panel carga con Decap desde el CDN y muestra el inicio de sesión (captura 1440 px)', async ({ page, request }) => {
  const cdn = await request.head('https://unpkg.com/decap-cms@3.17.3/dist/decap-cms.js', { timeout: 10_000 }).catch(() => null);
  test.skip(!cdn || !cdn.ok(), 'sin acceso al CDN (unpkg.com): no se puede cargar Decap');

  await page.setViewportSize({ width: 1440, height: 900 });
  const consola: string[] = [];
  page.on('pageerror', (e) => consola.push(String(e)));
  await page.goto(ADMIN, { waitUntil: 'networkidle' });
  // la configuración se leyó bien (sin «Error loading the CMS configuration») y pide iniciar sesión (con GitHub, o «Iniciar sesión» si hay un decap-server local abierto)
  await expect(page.getByRole('button', { name: /Iniciar sesión|Login/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Config Errors|Errores de configuración/)).toHaveCount(0);
  expect(consola, 'sin errores de JavaScript en el panel').toEqual([]);
  fs.mkdirSync(path.join(RAIZ, 'tests', 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(RAIZ, 'tests', 'test-results', 'admin-1440.png') });
});

test('la web pública no enlaza ni carga nada del panel', async ({ page }) => {
  const peticiones: string[] = [];
  page.on('request', (r) => peticiones.push(r.url()));
  await page.goto(URL_FINAL, { waitUntil: 'networkidle' });
  expect(await page.$$('a[href*="admin"]')).toHaveLength(0);
  expect(peticiones.filter((u) => /\/admin|decap|unpkg/.test(u))).toEqual([]);
});
