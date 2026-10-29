import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import type { Page } from '@playwright/test';

export const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.resolve(AQUI, '..');
export const BASE = 'http://127.0.0.1:4181';
export const URL_FINAL = `${BASE}/youthcoop/`;
export const URL_ENDPOINT = `${BASE}/endpoint/`;
export const URL_VISUAL = `${BASE}/visual/`;
export const URL_RAIZ = 'http://127.0.0.1:4182/';
export const ENDPOINT_PRUEBA = 'https://script.google.com/macros/s/PRUEBA_AKfycb/exec';

/** Plantilla original (solo lectura, vive en el proyecto con backend). REFERENCIA_HTML la cambia. */
export const REFERENCIA_RUTA = process.env.REFERENCIA_HTML ?? path.resolve(RAIZ, '..', 'youthcoop', 'reference', 'original.html');
export const REFERENCIA = pathToFileURL(REFERENCIA_RUTA).href;
export const HAY_REFERENCIA = fs.existsSync(REFERENCIA_RUTA);

/** Congela animaciones y fuerza visibles .aparecer y .lote (en ambos lados por igual). */
export const CSS_CONGELAR = `
*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important;caret-color:transparent!important}
.aparecer{opacity:1!important;transform:none!important}
.lotes.cinco .lote{opacity:1!important;transform:none!important}
`;

export async function esperarFuentes(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(150);
}

/** Recorre la página para que se carguen las imágenes con loading="lazy". */
export async function recorrerPagina(page: Page) {
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= alto; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}
