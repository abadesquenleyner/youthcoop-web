// Comparación visual: plantilla original (file://) vs la copia estática compilada con los datos de la plantilla
// (ocultar_pendientes=false y sin fotos; ver global-setup.ts). 1440 y 390 px, ES, tema claro, página completa,
// animaciones congeladas. Criterio: idénticas píxel a píxel (0 píxeles distintos y mismo tamaño).
import { test, expect, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { AQUI, CSS_CONGELAR, HAY_REFERENCIA, REFERENCIA, REFERENCIA_RUTA, URL_VISUAL, esperarFuentes } from './comun';

const SALIDA = path.join(AQUI, 'visual-diff');
fs.mkdirSync(SALIDA, { recursive: true });

function comparar(a: Buffer, b: Buffer) {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  const w = Math.max(A.width, B.width);
  const h = Math.max(A.height, B.height);
  const pad = (P: PNG) => {
    if (P.width === w && P.height === h) return P;
    const O = new PNG({ width: w, height: h });
    for (let i = 0; i < O.data.length; i += 4) {
      O.data[i] = 255;
      O.data[i + 1] = 0;
      O.data[i + 2] = 255;
      O.data[i + 3] = 255;
    }
    PNG.bitblt(P, O, 0, 0, P.width, P.height, 0, 0);
    return O;
  };
  const PA = pad(A);
  const PB = pad(B);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(PA.data, PB.data, diff.data, w, h, { threshold: 0, includeAA: true });
  const exacto = A.width === B.width && A.height === B.height && A.data.equals(B.data);
  return { n, exacto, total: w * h, diff, ref: [A.width, A.height], sitio: [B.width, B.height] };
}

async function capturar(browser: Browser, url: string, ancho: number) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 }, colorScheme: 'light', locale: 'es-PE', reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('yc-idioma', 'es');
    } catch {}
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('footer .legal');
  await page.addStyleTag({ content: CSS_CONGELAR });
  await esperarFuentes(page);
  const png = await page.screenshot({ fullPage: true });
  await ctx.close();
  return png;
}

test.skip(!HAY_REFERENCIA, `No existe la plantilla de referencia (${REFERENCIA_RUTA}); defínela con REFERENCIA_HTML`);

for (const ancho of [1440, 390]) {
  test(`visual ${ancho} es claro: idéntica a reference/original.html`, async ({ browser }) => {
    const [ref, sitio] = await Promise.all([capturar(browser, REFERENCIA, ancho), capturar(browser, URL_VISUAL, ancho)]);
    const r = comparar(ref, sitio);
    const nombre = `${ancho}-es-light`;
    fs.writeFileSync(path.join(SALIDA, `${nombre}-referencia.png`), ref);
    fs.writeFileSync(path.join(SALIDA, `${nombre}-sitio.png`), sitio);
    if (r.n > 0) fs.writeFileSync(path.join(SALIDA, `${nombre}-diff.png`), PNG.sync.write(r.diff));
    else fs.rmSync(path.join(SALIDA, `${nombre}-diff.png`), { force: true });
    console.log(`${nombre}: ${r.n} px distintos de ${r.total} · bit a bit=${r.exacto} · ref=${r.ref} sitio=${r.sitio}`);
    expect(r.sitio, 'misma altura y ancho que la plantilla').toEqual(r.ref);
    expect(r.n, `píxeles distintos en ${nombre}`).toBe(0);
    expect(r.exacto, 'idéntica bit a bit').toBe(true);
  });
}
