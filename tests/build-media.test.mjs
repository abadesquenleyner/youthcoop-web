// Pruebas de scripts/build-media.mjs en una COPIA temporal (BUILD_MEDIA_RAIZ): no tocan content/, site.json ni public/ del proyecto.
//   cd tests && npm run test:media
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'build-media.mjs');
sharp.cache(false); // en Windows sharp deja archivos abiertos y no se podrían borrar
let tmp;

const ruta = (...p) => path.join(tmp, ...p);
const leerSite = () => JSON.parse(fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8'));
const leerFotos = () => JSON.parse(fs.readFileSync(ruta('content', 'fotos.json'), 'utf8'));
const guardarFotos = (f) => fs.writeFileSync(ruta('content', 'fotos.json'), JSON.stringify(f, null, 2));
const salida = () => fs.readdirSync(ruta('public', 'media', 'fotos')).sort();
const correr = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { env: { ...process.env, BUILD_MEDIA_RAIZ: tmp }, encoding: 'utf8' });
const hueco = (site, clave) => {
  const sec = (k) => site.sections.find((s) => s.key === k).content;
  if (clave === 'hero') return sec('hero').foto;
  if (clave.startsWith('galeria_')) return sec('galeria').fotos[Number(clave.slice(8)) - 1];
  throw new Error(clave);
};
const medioDe = (clave) => {
  const s = leerSite();
  return s.media[String(hueco(s, clave).media_id)];
};
/** color medio (r,g,b) de una franja del archivo publicado */
async function colorMedio(archivo, region) {
  const { data } = await sharp(fs.readFileSync(archivo)).extract(region).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-media-'));
  fs.cpSync(path.join(RAIZ, 'content'), ruta('content'), { recursive: true });
  fs.mkdirSync(ruta('src', 'data'), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, 'src', 'data', 'site.json'), ruta('src', 'data', 'site.json'));
  fs.mkdirSync(ruta('public', 'media'), { recursive: true });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('estado inicial: 13 huecos, 38 archivos (12 x 3 variantes + video + poster) y site.json no cambia de forma', () => {
  const antes = leerSite();
  const r = correr();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(salida().length, 38);
  const despues = leerSite();
  // mismos ids de medio, mismos alt/leyendas/medidas; solo cambian las rutas de archivo
  assert.deepEqual(Object.keys(despues.media), Object.keys(antes.media));
  for (const [id, m] of Object.entries(despues.media)) {
    const a = antes.media[id];
    assert.deepEqual(m.alt, a.alt, `alt ${id}`);
    assert.equal(m.kind, a.kind);
    assert.equal(m.width, a.width, `ancho ${id}`);
    assert.equal(m.height, a.height, `alto ${id}`);
    assert.equal(m.focal_x, a.focal_x);
    assert.equal(m.focal_y, a.focal_y);
    assert.equal(m.srcset.length, a.srcset.length);
  }
  assert.equal(hueco(despues, 'hero').media_id, hueco(antes, 'hero').media_id);
  assert.deepEqual(hueco(despues, 'galeria_2').caption, hueco(antes, 'galeria_2').caption);
  assert.equal(hueco(despues, 'hero').caption, hueco(antes, 'hero').caption); // la leyenda del hero es texto simple
  const v = despues.media[String(hueco(despues, 'galeria_6').media_id)];
  assert.equal(v.kind, 'video');
  assert.match(v.url, /^media\/fotos\/galeria_6-[0-9a-f]{10}\.mp4$/);
  assert.match(v.poster, /-poster\.webp$/);
  assert.deepEqual([v.width, v.height], [1280, 720]); // leído del propio mp4
  assert.equal(v.focal_x, 58);
});

test('es idempotente: la segunda corrida no genera ni cambia nada', () => {
  const antes = salida().map((f) => [f, fs.statSync(ruta('public', 'media', 'fotos', f)).mtimeMs]);
  const site = fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8');
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 con cambios/);
  assert.match(r.stdout, /site\.json sin cambios/);
  assert.deepEqual(
    salida().map((f) => [f, fs.statSync(ruta('public', 'media', 'fotos', f)).mtimeMs]),
    antes,
  );
  assert.equal(fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8'), site);
});

test('foto vertical en un hueco 4:3: 3 variantes recortadas y el punto focal decide qué parte se ve', async () => {
  // 1200 x 2400: el rojo sube de 0 (arriba) a 255 (abajo) según la fila; el azul baja
  const W = 1200;
  const H = 2400;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set([Math.round((y / (H - 1)) * 255), 0, 255 - Math.round((y / (H - 1)) * 255)], (y * W + x) * 3);
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 95 }).toFile(ruta('content', 'originales', 'vertical.jpg'));

  const medias = {};
  for (const [nombre, fy] of [['arriba', 0], ['centro', undefined], ['abajo', 100]]) {
    const f = leerFotos();
    f.galeria_1 = { ...f.galeria_1, imagen: '/content/originales/vertical.jpg', focal_y: fy, focal_x: undefined };
    guardarFotos(f);
    const r = correr();
    assert.equal(r.status, 0, r.stderr);
    const m = medioDe('galeria_1');
    assert.deepEqual(m.srcset.map((s) => s.width), [480, 800, 1200]);
    assert.equal(m.width, 1200);
    assert.equal(m.height, 900);
    assert.deepEqual([m.focal_x, m.focal_y], [50, 50]); // ya viene recortada: object-position al centro
    for (const s of m.srcset) {
      const meta = await sharp(fs.readFileSync(ruta('public', s.url))).metadata();
      assert.equal(meta.format, 'webp');
      assert.equal(meta.width, s.width);
      assert.equal(meta.height, (s.width * 3) / 4, `proporción 4:3 en ${s.width}`);
    }
    medias[nombre] = await colorMedio(ruta('public', m.url), { left: 0, top: 0, width: 1200, height: 900 });
  }
  // recorte de 1200x900 sobre 1200x2400: arriba = rojo bajo, centro = medio, abajo = rojo alto
  assert.ok(medias.arriba.r < 60, `arriba r=${medias.arriba.r}`);
  assert.ok(Math.abs(medias.centro.r - 128) < 30, `centro r=${medias.centro.r}`);
  assert.ok(medias.abajo.r > 195, `abajo r=${medias.abajo.r}`);
  // las variantes viejas del hueco se borraron: sigue habiendo 38 archivos
  assert.equal(salida().length, 38);
  assert.ok(!salida().some((f) => f.startsWith('galeria_1-') && !f.includes(medioDe('galeria_1').url.split('-')[1])), 'quedan variantes viejas');
});

test('el giro del EXIF se respeta (foto de celular tomada de lado)', async () => {
  // 1600 x 1200 guardada con orientación 6 (girar 90° a la derecha): la mitad izquierda (roja) queda ARRIBA
  const W = 1600;
  const H = 1200;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.set(x < W / 2 ? [255, 0, 0] : [0, 0, 255], (y * W + x) * 3);
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 95 }).withMetadata({ orientation: 6 }).toFile(ruta('content', 'originales', 'de-lado.jpg'));
  const f = leerFotos();
  f.galeria_2 = { ...f.galeria_2, imagen: '/content/originales/de-lado.jpg', focal_x: 50, focal_y: 50 };
  guardarFotos(f);
  assert.equal(correr().status, 0);
  const m = medioDe('galeria_2');
  assert.equal(m.height, 900);
  const arriba = await colorMedio(ruta('public', m.url), { left: 0, top: 0, width: 1200, height: 300 });
  const abajo = await colorMedio(ruta('public', m.url), { left: 0, top: 600, width: 1200, height: 300 });
  assert.ok(arriba.r > 200 && arriba.b < 60, `arriba debe ser rojo: ${JSON.stringify(arriba)}`);
  assert.ok(abajo.b > 200 && abajo.r < 60, `abajo debe ser azul: ${JSON.stringify(abajo)}`);
});

test('PNG pequeña (600 px): no se agranda, la variante mayor es su tamaño real', async () => {
  await sharp({ create: { width: 600, height: 450, channels: 3, background: '#3a7d44' } }).png().toFile(ruta('content', 'originales', 'chica.png'));
  const f = leerFotos();
  f.galeria_3 = { ...f.galeria_3, imagen: '/content/originales/chica.png' };
  guardarFotos(f);
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /solo 600 px/);
  const m = medioDe('galeria_3');
  assert.deepEqual(m.srcset.map((s) => s.width), [480, 600]);
  assert.equal(m.width, 600);
  assert.equal(m.height, 450);
});

test('el hueco del video acepta una foto en su lugar (y vuelve a video)', async () => {
  const f = leerFotos();
  const respaldo = structuredClone(f.galeria_6);
  delete f.galeria_6.video;
  delete f.galeria_6.poster;
  f.galeria_6.imagen = '/content/originales/hero.webp'; // 1200x1500 -> recorte 4:3
  guardarFotos(f);
  assert.equal(correr().status, 0);
  let m = medioDe('galeria_6');
  assert.equal(m.kind, 'image');
  assert.equal(m.srcset.length, 3);
  assert.ok(!salida().some((x) => x.endsWith('.mp4')), 'el mp4 viejo se borra');

  f.galeria_6 = respaldo;
  guardarFotos(f);
  assert.equal(correr().status, 0);
  m = medioDe('galeria_6');
  assert.equal(m.kind, 'video');
  assert.ok(salida().some((x) => x.endsWith('.mp4')));
});

test('errores claros: archivo que no es imagen, ruta fuera de content/ y archivo inexistente', () => {
  fs.writeFileSync(ruta('content', 'originales', 'falsa.jpg'), 'esto no es una imagen');
  for (const [valor, patron] of [
    ['/content/originales/falsa.jpg', /no es una imagen/],
    ['/../../etc/passwd', /dentro de la carpeta content/],
    ['/content/originales/no-existe.jpg', /no encuentro el archivo/],
  ]) {
    const f = leerFotos();
    f.galeria_4 = { ...f.galeria_4, imagen: valor };
    guardarFotos(f);
    const r = correr();
    assert.equal(r.status, 1, valor);
    assert.match(r.stderr, patron, valor);
  }
  // un fallo no deja site.json a medias: sigue válido
  assert.ok(leerSite().media);
});
