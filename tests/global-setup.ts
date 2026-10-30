// Compila los tres builds que usan las pruebas y deriva los datos de la plantilla (sin fotos).
//  dist           build final, SIN VITE_FORM_ENDPOINT (el formulario debe avisar que no está conectado)
//  dist-endpoint  mismo sitio con un endpoint de prueba (las pruebas lo interceptan con page.route)
//  dist-redirect  endpoint local (http://127.0.0.1:4183/exec) para probar el 302 de Apps Script con servidores reales
//  dist-visual    datos de la plantilla: ocultar_pendientes=false, sin las 13 fotos y con las leyendas originales (para comparar con original.html)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const ENDPOINT_PRUEBA = 'https://script.google.com/macros/s/PRUEBA_AKfycb/exec';

/** Los 13 huecos de foto, con la misma clave que usa tests/plantilla-fotos.json. */
function huecos(site: any): Record<string, any> {
  const sec = (k: string) => site.sections.find((s: any) => s.key === k).content;
  const prod = (slug: string) => site.products.find((p: any) => p.slug === slug).data;
  const h: Record<string, any> = { hero: sec('hero').foto, nosotros: sec('nosotros').foto };
  for (let i = 0; i < 3; i++) h[`proyectos.${i}`] = sec('proyectos').items[i].foto;
  h['cocoa-beans'] = prod('cocoa-beans').foto;
  h['cocoa-products'] = prod('cocoa-products').foto;
  for (let i = 0; i < 6; i++) h[`galeria.${i}`] = sec('galeria').fotos[i];
  return h;
}

/**
 * Datos de la plantilla exacta: lo mismo que site.json, pero con los 13 huecos de foto vacíos, con sus
 * leyendas, etiquetas y medidas ORIGINALES (tests/plantilla-fotos.json, tomadas de la plantilla) y los
 * pendientes visibles. Las leyendas honestas de site.json solo valen para el sitio con fotos.
 */
function derivarPlantilla(): string {
  const site = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'data', 'site.json'), 'utf8'));
  const original = JSON.parse(fs.readFileSync(path.join(AQUI, 'plantilla-fotos.json'), 'utf8'));
  const h = huecos(site);
  for (const [ruta, foto] of Object.entries<any>(h)) {
    if (!original[ruta]) throw new Error(`plantilla-fotos.json no tiene el hueco ${ruta}`);
    if (typeof foto.media_id === 'number') delete site.media[String(foto.media_id)];
    foto.media_id = null;
    Object.assign(foto, structuredClone(original[ruta]));
  }
  site.settings.site.ocultar_pendientes = false;
  const dir = path.join(AQUI, '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const destino = path.join(dir, 'site-plantilla.json');
  fs.writeFileSync(destino, JSON.stringify(site, null, 2));
  return destino;
}

function compilar(salida: string, env: Record<string, string>) {
  execSync(`npx vite build --outDir ${salida} --emptyOutDir`, { cwd: RAIZ, stdio: 'pipe', env: { ...process.env, ...env } });
}

export default function globalSetup() {
  // las fotos del sitio salen de content/originales: se generan antes de compilar (vite build no pasa por el prebuild de npm)
  execSync('node scripts/build-media.mjs', { cwd: RAIZ, stdio: 'pipe' });
  // y los textos del panel (content/textos) se aplican sobre site.json, igual que en el prebuild
  execSync('node scripts/build-textos.mjs', { cwd: RAIZ, stdio: 'pipe' });
  execSync('npx tsc --noEmit', { cwd: RAIZ, stdio: 'pipe' });
  compilar('dist', { VITE_FORM_ENDPOINT: '' });
  compilar('dist-endpoint', { VITE_FORM_ENDPOINT: ENDPOINT_PRUEBA });
  compilar('dist-redirect', { VITE_FORM_ENDPOINT: 'http://127.0.0.1:4183/exec' });
  compilar('dist-visual', { VITE_FORM_ENDPOINT: '', SITE_JSON: derivarPlantilla() });
}
