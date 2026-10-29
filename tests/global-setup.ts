// Compila los tres builds que usan las pruebas y deriva los datos de la plantilla (sin fotos).
//  dist           build final, SIN VITE_FORM_ENDPOINT (el formulario debe avisar que no está conectado)
//  dist-endpoint  mismo sitio con un endpoint de prueba (las pruebas lo interceptan con page.route)
//  dist-redirect  endpoint local (http://127.0.0.1:4183/exec) para probar el 302 de Apps Script con servidores reales
//  dist-visual    datos de la plantilla: ocultar_pendientes=false y sin las 7 fotos (para comparar con original.html)
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const ENDPOINT_PRUEBA = 'https://script.google.com/macros/s/PRUEBA_AKfycb/exec';

/** Datos de la plantilla exacta: lo mismo que site.json, pero con los huecos de foto vacíos y los pendientes visibles. */
function derivarPlantilla(): string {
  const site = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'data', 'site.json'), 'utf8'));
  const fotos = new Set<number>(
    Object.entries<any>(site.media)
      .filter(([, m]) => m.url.endsWith('.webp'))
      .map(([id]) => Number(id)),
  );
  const vaciar = (v: any): void => {
    if (Array.isArray(v)) return v.forEach(vaciar);
    if (v && typeof v === 'object') {
      if (typeof v.media_id === 'number' && fotos.has(v.media_id)) {
        v.media_id = null;
        v.pendiente = true;
      }
      Object.values(v).forEach(vaciar);
    }
  };
  vaciar(site.sections);
  vaciar(site.products);
  for (const id of fotos) delete site.media[String(id)];
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
  execSync('npx tsc --noEmit', { cwd: RAIZ, stdio: 'pipe' });
  compilar('dist', { VITE_FORM_ENDPOINT: '' });
  compilar('dist-endpoint', { VITE_FORM_ENDPOINT: ENDPOINT_PRUEBA });
  compilar('dist-redirect', { VITE_FORM_ENDPOINT: 'http://127.0.0.1:4183/exec' });
  compilar('dist-visual', { VITE_FORM_ENDPOINT: '', SITE_JSON: derivarPlantilla() });
}
