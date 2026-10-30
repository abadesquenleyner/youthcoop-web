// Geometría de las cajas de las fotos: cada hueco rayado "FOTO" de la maqueta y la foto (o video) del sitio deben ocupar
// la misma caja exacta: posición, tamaño, border-radius y aspect-ratio. Dentro de la caja la foto puede ser distinta;
// la imagen o el video debe llenar la caja sin dejar bordes, desbordar ni cambiar el radio.
import { test, expect, type Browser } from '@playwright/test';
import { HAY_REFERENCIA, REFERENCIA, REFERENCIA_RUTA, URL_FINAL, URL_REAL } from './comun';
import { capturarCajas, type CajaFoto } from './maqueta-comun';

test.skip(!HAY_REFERENCIA, `No existe la plantilla de referencia (${REFERENCIA_RUTA}); defínela con REFERENCIA_HTML`);

const cache = new Map<string, Promise<CajaFoto[]>>();
function cajas(browser: Browser, nombre: string, url: string, ancho: number) {
  const clave = `${nombre}|${ancho}`;
  let p = cache.get(clave);
  if (!p) {
    p = capturarCajas(browser, url, ancho);
    cache.set(clave, p);
  }
  return p;
}

for (const ancho of [1440, 390]) {
  test(`cajas de las fotos ${ancho}: misma posición, tamaño, radio y proporción que la maqueta`, async ({ browser }) => {
    const ref = await cajas(browser, 'maqueta', REFERENCIA, ancho);
    const sitio = await cajas(browser, 'real', URL_REAL, ancho);
    expect(ref.length, 'la maqueta tiene 13 huecos de foto').toBe(13);
    expect(sitio.length, 'el sitio tiene los mismos 13 huecos').toBe(ref.length);
    ref.forEach((c, i) => {
      const s = sitio[i];
      const donde = `caja ${i} (${c.padre})`;
      expect(s.padre, `${donde}: mismo contenedor`).toBe(c.padre);
      expect(s.rect, `${donde}: x, y, ancho y alto`).toEqual(c.rect);
      expect(s.radio, `${donde}: border-radius`).toBe(c.radio);
      expect(s.aspecto, `${donde}: aspect-ratio`).toBe(c.aspecto);
      expect(s.margen, `${donde}: margin`).toBe(c.margen);
      expect(s.overflow, `${donde}: overflow`).toBe(c.overflow);
      expect(s.posicion, `${donde}: position`).toBe(c.posicion);
    });
  });

  test(`cajas de las fotos ${ancho}: la foto llena su caja y en producción conservan tamaño, radio y proporción`, async ({ browser }) => {
    const ref = await cajas(browser, 'maqueta', REFERENCIA, ancho);
    const prod = await cajas(browser, 'produccion', URL_FINAL, ancho);
    expect(prod.length).toBe(ref.length);
    ref.forEach((c, i) => {
      const s = prod[i];
      const donde = `caja ${i} (${c.padre})`;
      // en producción los pendientes ocultos pueden mover la caja hacia arriba, pero no cambiarla
      expect(s.rect.slice(2), `${donde}: ancho y alto`).toEqual(c.rect.slice(2));
      expect(s.rect[0], `${donde}: x`).toBe(c.rect[0]);
      expect(s.radio, `${donde}: border-radius`).toBe(c.radio);
      expect(s.aspecto, `${donde}: aspect-ratio`).toBe(c.aspecto);
      expect(s.hijo, `${donde}: la foto o el video ocupa toda la caja`).toEqual(s.rect);
    });
  });
}
