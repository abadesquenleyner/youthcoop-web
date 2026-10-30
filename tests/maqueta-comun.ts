// Utilidades de las pruebas "sitio con fotos y textos reales vs maqueta": captura de página completa y por sección,
// extracción de las cajas de las fotos (los huecos rayados "FOTO" de la maqueta) y comparación de píxeles con esas cajas enmascaradas.
import type { Browser, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { CSS_CONGELAR, esperarFuentes } from './comun';

/** Secciones de la página, en orden, con el selector que sirve igual en la maqueta y en el sitio. */
export const SECCIONES: Array<[string, string]> = [
  ['header', 'header#encabezado'],
  ['hero', 'main > section#inicio'],
  ['cifras', 'main > .cifras'],
  ['nosotros', 'main > section#nosotros'],
  ['modelo', 'main > section#modelo'],
  ['proyectos', 'main > section#proyectos'],
  ['oferta', 'main > section#oferta'],
  ['calidad', 'main > section#calidad'],
  ['trazabilidad', 'main > section#trazabilidad'],
  ['galeria', 'main > section#galeria'],
  ['novedades', 'main > section#novedades'],
  ['contacto', 'main > section#contacto'],
  ['footer', 'body footer'],
];

export interface Caja {
  /** x, y (de la página), ancho y alto, en píxeles CSS */
  rect: [number, number, number, number];
  radio: string;
  aspecto: string;
  /** clase del contenedor y orden dentro de la página, para emparejar la caja de la maqueta con la del sitio */
  padre: string;
  indice: number;
}

export interface Captura {
  png: Buffer;
  alto: number;
  ancho: number;
  secciones: Record<string, [number, number, number, number] | null>;
  cajas: Caja[];
}

/** Lo que se mide dentro de la página (la maqueta y el sitio usan los mismos nombres de clase). */
async function medir(page: Page, secciones: Array<[string, string]>) {
  return page.evaluate((secs) => {
    const redondea = (v: number) => Math.round(v * 100) / 100;
    const rect = (e: Element): [number, number, number, number] => {
      const r = e.getBoundingClientRect();
      return [redondea(r.x + scrollX), redondea(r.y + scrollY), redondea(r.width), redondea(r.height)];
    };
    const out: Record<string, [number, number, number, number] | null> = {};
    for (const [n, sel] of secs) {
      const e = document.querySelector(sel);
      out[n] = e ? rect(e) : null;
    }
    const cajas = [...document.querySelectorAll('.foto')].map((e, i) => {
      const cs = getComputedStyle(e);
      return {
        rect: rect(e),
        radio: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '),
        aspecto: cs.aspectRatio,
        padre: (e.parentElement?.className ?? '').toString(),
        indice: i,
      };
    });
    return { secciones: out, cajas, alto: document.documentElement.scrollHeight, ancho: document.documentElement.scrollWidth };
  }, secciones);
}

export interface OpcionesCaptura {
  esquema?: 'light' | 'dark';
  idioma?: 'es' | 'en';
}

export async function capturarPagina(browser: Browser, url: string, ancho: number, op: OpcionesCaptura = {}): Promise<Captura> {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 }, colorScheme: op.esquema ?? 'light', locale: 'es-PE', reducedMotion: 'no-preference' });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('yc-idioma', l);
    } catch {
      /* sin almacenamiento */
    }
  }, op.idioma ?? 'es');
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('footer .legal');
  await page.addStyleTag({ content: CSS_CONGELAR });
  // las imágenes con loading="lazy" solo se piden al acercarse: se recorre la página y se espera a que todas terminen
  const alto0 = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= alto0; y += 400) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(40);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(async () => {
    await Promise.all([...document.images].map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = () => r(null); }))));
  });
  await esperarFuentes(page);
  const m = await medir(page, SECCIONES);
  const png = await page.screenshot({ fullPage: true });
  await ctx.close();
  return { png, alto: m.alto, ancho: m.ancho, secciones: m.secciones, cajas: m.cajas };
}

export interface Resultado {
  distintos: number;
  total: number;
  mismoTamano: boolean;
  tam: [number, number, number, number];
  diff: PNG;
}

function recortar(P: PNG, x: number, y: number, w: number, h: number): PNG {
  const O = new PNG({ width: w, height: h });
  for (let i = 0; i < O.data.length; i += 4) {
    O.data[i] = 255;
    O.data[i + 1] = 0;
    O.data[i + 2] = 255;
    O.data[i + 3] = 255;
  }
  const cw = Math.max(0, Math.min(w, P.width - x));
  const ch = Math.max(0, Math.min(h, P.height - y));
  if (cw > 0 && ch > 0) PNG.bitblt(P, O, x, y, cw, ch, 0, 0);
  return O;
}

function enmascarar(P: PNG, cajas: Array<[number, number, number, number]>, origenX = 0, origenY = 0) {
  for (const [x, y, w, h] of cajas) {
    const x0 = Math.max(0, Math.floor(x) - origenX);
    const y0 = Math.max(0, Math.floor(y) - origenY);
    const x1 = Math.min(P.width, Math.ceil(x + w) - origenX);
    const y1 = Math.min(P.height, Math.ceil(y + h) - origenY);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * P.width + xx) * 4;
        P.data[i] = 0;
        P.data[i + 1] = 255;
        P.data[i + 2] = 0;
        P.data[i + 3] = 255;
      }
    }
  }
}

type R4 = [number, number, number, number];
const mover = (cajas: R4[], dx: number, dy: number): R4[] => cajas.map(([x, y, w, h]) => [x + dx, y + dy, w, h]);

/**
 * Compara dos capturas completas o una sección de ambas. `region` recorta la misma sección en cada captura (cada una con su propio
 * rectángulo); si el alto o el ancho no coinciden, el sobrante cuenta como diferente. Antes de comparar, las cajas de las fotos de
 * la maqueta y del sitio (unidas) se pintan del mismo color en ambos: lo que queda fuera debe ser idéntico.
 */
export function compararCapturas(a: Captura, b: Captura, region: string | null): Resultado {
  const A = PNG.sync.read(a.png);
  const B = PNG.sync.read(b.png);
  const cajasA: R4[] = a.cajas.map((c) => c.rect);
  const cajasB: R4[] = b.cajas.map((c) => c.rect);
  let PA: PNG;
  let PB: PNG;
  let tam: R4;
  if (region) {
    const ra = a.secciones[region];
    const rb = b.secciones[region];
    if (!ra || !rb) throw new Error(`falta la sección ${region} (${ra ? 'sitio' : 'maqueta'})`);
    const xa = Math.floor(ra[0]);
    const ya = Math.floor(ra[1]);
    const xb = Math.floor(rb[0]);
    const yb = Math.floor(rb[1]);
    const wa = Math.ceil(ra[0] + ra[2]) - xa;
    const ha = Math.ceil(ra[1] + ra[3]) - ya;
    const wb = Math.ceil(rb[0] + rb[2]) - xb;
    const hb = Math.ceil(rb[1] + rb[3]) - yb;
    tam = [wa, ha, wb, hb];
    const w = Math.max(wa, wb);
    const h = Math.max(ha, hb);
    PA = recortar(A, xa, ya, w, h);
    PB = recortar(B, xb, yb, w, h);
    // las cajas de cada lado, en el sistema del recorte propio; las del otro lado se trasladan según el origen de su sección
    enmascarar(PA, [...cajasA, ...mover(cajasB, xa - xb, ya - yb)], xa, ya);
    enmascarar(PB, [...cajasB, ...mover(cajasA, xb - xa, yb - ya)], xb, yb);
  } else {
    tam = [A.width, A.height, B.width, B.height];
    const w = Math.max(A.width, B.width);
    const h = Math.max(A.height, B.height);
    PA = recortar(A, 0, 0, w, h);
    PB = recortar(B, 0, 0, w, h);
    enmascarar(PA, [...cajasA, ...cajasB]);
    enmascarar(PB, [...cajasA, ...cajasB]);
  }
  const diff = new PNG({ width: PA.width, height: PA.height });
  const distintos = pixelmatch(PA.data, PB.data, diff.data, PA.width, PA.height, { threshold: 0, includeAA: true });
  return { distintos, total: PA.width * PA.height, mismoTamano: tam[0] === tam[2] && tam[1] === tam[3], tam, diff };
}

export interface CajaFoto {
  rect: [number, number, number, number];
  radio: string;
  aspecto: string;
  margen: string;
  overflow: string;
  posicion: string;
  padre: string;
  /** rect de la imagen o del video dentro de la caja (en la maqueta no hay: es la propia caja) */
  hijo: [number, number, number, number];
}

/** Solo las cajas de las fotos (más ligera que una captura completa). */
export async function capturarCajas(browser: Browser, url: string, ancho: number): Promise<CajaFoto[]> {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 900 }, colorScheme: 'light', locale: 'es-PE' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('yc-idioma', 'es');
    } catch {
      /* sin almacenamiento */
    }
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('footer .legal');
  await page.addStyleTag({ content: CSS_CONGELAR });
  await esperarFuentes(page);
  const r = await page.evaluate(() => {
    const redondea = (v: number) => Math.round(v * 100) / 100;
    const rect = (e: Element): [number, number, number, number] => {
      const b = e.getBoundingClientRect();
      return [redondea(b.x + scrollX), redondea(b.y + scrollY), redondea(b.width), redondea(b.height)];
    };
    return [...document.querySelectorAll('.foto')].map((e) => {
      const cs = getComputedStyle(e);
      const hijo = e.querySelector('.foto-img');
      return {
        rect: rect(e),
        radio: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].join(' '),
        aspecto: cs.aspectRatio,
        margen: cs.margin,
        overflow: cs.overflow,
        posicion: cs.position,
        padre: (e.parentElement?.className ?? '').toString(),
        hijo: hijo ? rect(hijo) : rect(e),
      };
    });
  });
  await ctx.close();
  return r;
}