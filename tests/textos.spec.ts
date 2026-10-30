// Los textos editados en el panel (content/textos) llegan a la página compilada y renderizada, en español y en inglés, y lo malicioso no.
// En una copia temporal: se cambia content/textos/hero.json y otros, se corre build-textos con BUILD_TEXTOS_RAIZ, se compila con
// SITE_JSON apuntando a esa copia y se mira la página en un navegador real. El proyecto no se toca.
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { AQUI, RAIZ } from './comun';

const PUERTO = 4184;
let tmp = '';
let servidor: ChildProcess | undefined;

test.beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'textos-spec-'));
  fs.cpSync(path.join(RAIZ, 'content', 'textos'), path.join(tmp, 'content', 'textos'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'src', 'data'), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, 'src', 'data', 'site.json'), path.join(tmp, 'src', 'data', 'site.json'));

  const editar = (archivo: string, fn: (o: any) => void) => {
    const f = path.join(tmp, 'content', 'textos', `${archivo}.json`);
    const o = JSON.parse(fs.readFileSync(f, 'utf8'));
    fn(o);
    fs.writeFileSync(f, JSON.stringify(o, null, 2));
  };
  editar('hero', (h) => {
    h.titulo.es = 'TITULO-ES-PRUEBA <script>window.__xss=1</script>con *cursiva*';
    h.titulo.en = 'TITLE-EN-TEST <img src=x onerror="window.__xss=2">with **bold**';
    h.bajada.es = 'Primera línea\nSegunda línea';
    h.cta_principal.label.es = 'BOTON-ES-PRUEBA';
  });
  editar('cifras', (c) => {
    c.items[3].valor = '777';
  });
  editar('ajustes', (a) => {
    a.seo.es.title = 'TITULO-GOOGLE-PRUEBA';
    a.contacto.email_comercial = 'prueba@ejemplo.com';
  });
  editar('footer', (f) => {
    f.derechos.en = 'FOOTER-EN-PRUEBA';
  });

  const env = { ...process.env, BUILD_TEXTOS_RAIZ: tmp, SITE_JSON: path.join(tmp, 'src', 'data', 'site.json'), VITE_FORM_ENDPOINT: '' };
  execSync('node scripts/build-textos.mjs', { cwd: RAIZ, stdio: 'pipe', env });
  execSync(`npx vite build --outDir "${path.join(tmp, 'dist')}" --emptyOutDir`, { cwd: RAIZ, stdio: 'pipe', env });
  servidor = spawn(process.execPath, ['servidor-estatico.mjs', String(PUERTO), `/textos/=${path.join(tmp, 'dist')}`], { cwd: AQUI, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    const ok = await fetch(`http://127.0.0.1:${PUERTO}/textos/`).then((r) => r.ok).catch(() => false);
    if (ok) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('el servidor de prueba no arrancó');
});

test.afterAll(() => {
  servidor?.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('el texto cambiado en hero.json aparece en la página en español y en inglés, ya saneado', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('yc-idioma', 'es'));
  await page.goto(`http://127.0.0.1:${PUERTO}/textos/`, { waitUntil: 'networkidle' });

  const h1es = page.locator('h1 .es');
  await expect(h1es).toContainText('TITULO-ES-PRUEBA');
  await expect(h1es.locator('em')).toHaveText('cursiva');
  await expect(page.locator('.hero .acciones a.boton').first().locator('.es')).toHaveText('BOTON-ES-PRUEBA');
  // salto de línea del panel -> <br>
  expect(await page.locator('.hero .bajada .es br').count()).toBe(1);
  // la cifra que estaba pendiente ([000]) ahora se publica
  await expect(page.locator('.cifras')).toContainText('777');
  // título para Google y datos de contacto
  await expect(page).toHaveTitle('TITULO-GOOGLE-PRUEBA');
  await expect(page.locator('footer a[href="mailto:prueba@ejemplo.com"]')).toHaveCount(1);

  await page.locator('button[data-lang="en"]').click();
  const h1en = page.locator('h1 .en');
  await expect(h1en).toContainText('TITLE-EN-TEST');
  await expect(h1en.locator('strong')).toHaveText('bold');
  await expect(page.locator('footer .legal .en')).toHaveText('FOOTER-EN-PRUEBA');

  // nada malicioso llegó a la página
  expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
  const html = await page.content();
  expect(html).not.toContain('onerror');
  expect(html).not.toMatch(/<script>window\.__xss/);
  expect(await page.locator('h1 img, h1 script').count()).toBe(0);
});

test('el index.html compilado lleva el título y la descripción del panel (antes de cargar el JavaScript)', async ({ request }) => {
  const html = await (await request.get(`http://127.0.0.1:${PUERTO}/textos/`)).text();
  expect(html).toContain('<title>TITULO-GOOGLE-PRUEBA</title>');
  expect(html).toMatch(/<meta name="description" content="[^"]+">/);
});
