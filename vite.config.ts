import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const aqui = path.dirname(fileURLToPath(import.meta.url));

// SITE_JSON (opcional): ruta de otro archivo de datos con la misma forma que src/data/site.json.
// Solo lo usan las pruebas visuales (datos de la plantilla sin fotos). Por defecto: src/data/site.json.
const datos = process.env.SITE_JSON ? path.resolve(process.env.SITE_JSON) : path.join(aqui, 'src', 'data', 'site.json');

export default defineConfig({
  // './' = rutas relativas: el mismo build funciona en la raíz o en cualquier subruta de GitHub Pages
  // (https://usuario.github.io/repositorio/) sin tocar nada.
  base: './',
  plugins: [react()],
  resolve: { alias: { '@site-json': datos } },
  server: { host: '127.0.0.1', port: 5175, strictPort: true },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true },
});
