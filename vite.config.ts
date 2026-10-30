import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));

// SITE_JSON (opcional): ruta de otro archivo de datos con la misma forma que src/data/site.json.
// Solo lo usan las pruebas visuales (datos de la plantilla sin fotos). Por defecto: src/data/site.json.
const datos = process.env.SITE_JSON ? path.resolve(process.env.SITE_JSON) : path.join(aqui, 'src', 'data', 'site.json');

const escaparHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Pone en el index.html (lo que ven Google, WhatsApp y las vistas previas antes de que cargue el JavaScript) el título y la
 * descripción que se editan en el panel (settings.seo.es). Si algo falta, se queda lo que ya tiene el index.html.
 */
function seoEnIndex(): Plugin {
  return {
    name: 'yc-seo-en-index',
    transformIndexHtml(html) {
      try {
        const s = JSON.parse(fs.readFileSync(datos, 'utf8'));
        const titulo: string = s.settings?.seo?.es?.title || s.settings?.site?.title || '';
        const desc: string = s.settings?.seo?.es?.description || s.settings?.site?.description || '';
        if (titulo) html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escaparHtml(titulo)}</title>`);
        if (desc) html = html.replace(/(<meta name="description" content=")[^"]*(")/, (_m, a: string, b: string) => a + escaparHtml(desc) + b);
      } catch {
        /* sin datos legibles: se deja el index.html como está */
      }
      return html;
    },
  };
}

export default defineConfig({
  // './' = rutas relativas: el mismo build funciona en la raíz o en cualquier subruta de GitHub Pages
  // (https://usuario.github.io/repositorio/) sin tocar nada.
  base: './',
  plugins: [react(), seoEnIndex()],
  resolve: { alias: { '@site-json': datos } },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true },
});
