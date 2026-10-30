// Servidor estático mínimo que imita GitHub Pages de un sitio de proyecto:
//   node servidor-estatico.mjs <puerto> <prefijo>=<carpeta> [<prefijo>=<carpeta> ...]
// Cada carpeta se sirve SOLO bajo su prefijo (p. ej. /youthcoop/). Todo lo demás responde 404, así que un
// recurso pedido con ruta absoluta desde la raíz (/assets/..., /media/...) falla igual que en Pages.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [puerto, ...montajes] = process.argv.slice(2);
const mapa = montajes.map((m) => {
  const i = m.indexOf('=');
  return { prefijo: m.slice(0, i), carpeta: path.resolve(m.slice(i + 1)) };
});
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.yml': 'text/yaml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const ruta = decodeURIComponent(url.pathname);
    const noEncontrado = () => {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
    };
    for (const { prefijo, carpeta } of mapa) {
      if (ruta === prefijo.replace(/\/$/, '')) {
        res.writeHead(301, { Location: prefijo + url.search });
        return res.end();
      }
      if (!ruta.startsWith(prefijo)) continue;
      let rel = ruta.slice(prefijo.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const archivo = path.resolve(carpeta, rel);
      if (!archivo.startsWith(carpeta + path.sep) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) return noEncontrado();
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      return fs.createReadStream(archivo).pipe(res);
    }
    noEncontrado();
  })
  .listen(Number(puerto), '127.0.0.1', () => console.log(`servidor estatico en :${puerto}`));
