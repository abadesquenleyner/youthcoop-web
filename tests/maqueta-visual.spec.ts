// Sitio CON fotos, video y textos reales (los que se publican, con los pendientes visibles) vs la maqueta original.
// Las cajas de las fotos (los huecos rayados "FOTO" de la maqueta y las fotos del sitio) se pintan de un mismo color en ambos lados;
// fuera de ellas la tolerancia es 0 píxeles: texto, color, tipografía, espacios y orden deben ser idénticos.
// Se mide la página completa y cada sección (header, hero, cifras, nosotros, modelo, proyectos, oferta, calidad, trazabilidad,
// galería, novedades, contacto y footer) en 1440 y 390 px, en español (claro y oscuro) y en inglés.
// El build de producción (con los pendientes ocultos, a propósito) se compara aparte: las secciones que no ocultan nada deben ser idénticas.
import { test, expect, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { AQUI, HAY_REFERENCIA, REFERENCIA, REFERENCIA_RUTA, URL_FINAL, URL_REAL } from './comun';
import { SECCIONES, capturarPagina, compararCapturas, type Captura, type OpcionesCaptura } from './maqueta-comun';

const SALIDA = path.join(AQUI, 'visual-diff', 'maqueta');
fs.mkdirSync(SALIDA, { recursive: true });

test.skip(!HAY_REFERENCIA, `No existe la plantilla de referencia (${REFERENCIA_RUTA}); defínela con REFERENCIA_HTML`);

const cache = new Map<string, Promise<Captura>>();
/** Cada captura se hace una sola vez por prueba (la maqueta se reutiliza entre pruebas). */
function captura(browser: Browser, nombre: string, url: string, ancho: number, op: OpcionesCaptura) {
  const clave = `${nombre}|${ancho}|${op.esquema ?? 'light'}|${op.idioma ?? 'es'}`;
  let p = cache.get(clave);
  if (!p) {
    p = capturarPagina(browser, url, ancho, op);
    cache.set(clave, p);
  }
  return p;
}

const CASOS: Array<{ ancho: number; esquema: 'light' | 'dark'; idioma: 'es' | 'en' }> = [];
for (const ancho of [1440, 390]) {
  CASOS.push({ ancho, esquema: 'light', idioma: 'es' }, { ancho, esquema: 'light', idioma: 'en' }, { ancho, esquema: 'dark', idioma: 'es' });
}

for (const caso of CASOS) {
  const etiqueta = `${caso.ancho}-${caso.idioma}-${caso.esquema === 'light' ? 'claro' : 'oscuro'}`;
  test(`maqueta vs sitio con fotos y textos reales ${etiqueta}: 0 px fuera de las cajas de las fotos`, async ({ browser }) => {
    const ref = await captura(browser, 'maqueta', REFERENCIA, caso.ancho, caso);
    const sitio = await captura(browser, 'real', URL_REAL, caso.ancho, caso);
    const resumen: string[] = [];
    const fallos: string[] = [];

    const total = compararCapturas(ref, sitio, null);
    resumen.push(`${etiqueta} completa: ${total.distintos} px de ${total.total} · maqueta ${total.tam[0]}x${total.tam[1]} sitio ${total.tam[2]}x${total.tam[3]}`);
    if (!total.mismoTamano) fallos.push(`tamaño de la página: maqueta ${total.tam[0]}x${total.tam[1]} vs sitio ${total.tam[2]}x${total.tam[3]}`);
    if (total.distintos > 0) {
      fs.writeFileSync(path.join(SALIDA, `${etiqueta}-completa-diff.png`), PNG.sync.write(total.diff));
      fallos.push(`página completa: ${total.distintos} px distintos`);
    }
    for (const [nombre] of SECCIONES) {
      const r = compararCapturas(ref, sitio, nombre);
      resumen.push(`  ${nombre.padEnd(13)} ${String(r.distintos).padStart(6)} px · ${r.tam[0]}x${r.tam[1]} vs ${r.tam[2]}x${r.tam[3]}`);
      if (!r.mismoTamano) fallos.push(`${nombre}: tamaño ${r.tam[0]}x${r.tam[1]} vs ${r.tam[2]}x${r.tam[3]}`);
      if (r.distintos > 0) {
        fs.writeFileSync(path.join(SALIDA, `${etiqueta}-${nombre}-diff.png`), PNG.sync.write(r.diff));
        fallos.push(`${nombre}: ${r.distintos} px distintos`);
      }
    }
    console.log(resumen.join('\n'));
    expect(fallos, fallos.join(' · ')).toEqual([]);
  });
}

// Producción: ocultar_pendientes=true quita a propósito cifras, líneas de impacto, fichas, logos, publicaciones de LinkedIn, etc.
// (README: «Lo siguiente no se inventó»). Las secciones que no tienen nada pendiente deben seguir idénticas a la maqueta.
const SIN_PENDIENTES: Record<number, string[]> = {
  1440: ['header', 'hero', 'nosotros', 'modelo', 'calidad', 'galeria'],
  390: ['header', 'hero', 'nosotros', 'modelo'],
};
for (const ancho of [1440, 390]) {
  test(`maqueta vs build de producción ${ancho}: las secciones sin pendientes son idénticas`, async ({ browser }) => {
    const ref = await captura(browser, 'maqueta', REFERENCIA, ancho, {});
    const prod = await captura(browser, 'produccion', URL_FINAL, ancho, {});
    const fallos: string[] = [];
    for (const nombre of SIN_PENDIENTES[ancho]) {
      const r = compararCapturas(ref, prod, nombre);
      console.log(`producción ${ancho} ${nombre}: ${r.distintos} px · ${r.tam[0]}x${r.tam[1]} vs ${r.tam[2]}x${r.tam[3]}`);
      if (!r.mismoTamano || r.distintos > 0) {
        fs.writeFileSync(path.join(SALIDA, `produccion-${ancho}-${nombre}-diff.png`), PNG.sync.write(r.diff));
        fallos.push(`${nombre}: ${r.distintos} px, ${r.tam.join('x')}`);
      }
    }
    expect(fallos, fallos.join(' · ')).toEqual([]);
  });
}
