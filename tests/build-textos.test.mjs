// Pruebas de scripts/build-textos.mjs (textos que edita el cliente en el panel) en una COPIA temporal (BUILD_TEXTOS_RAIZ):
// no tocan content/textos ni src/data/site.json del proyecto.
//   cd tests && npm run test:textos
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aHtml, aTextoPlano, sanearRico } from '../scripts/textos-lib.mjs';
import { RAICES } from '../scripts/textos-esquema.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'build-textos.mjs');
const GENERADOR = path.join(RAIZ, 'scripts', 'generar-panel-textos.mjs');
let tmp;
let original; // site.json tal como está en el proyecto

const ruta = (...p) => path.join(tmp, ...p);
const sha = (f) => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const leerSite = () => JSON.parse(fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8'));
const leerTx = (n) => JSON.parse(fs.readFileSync(ruta('content', 'textos', `${n}.json`), 'utf8'));
const guardarTx = (n, o) => fs.writeFileSync(ruta('content', 'textos', `${n}.json`), JSON.stringify(o, null, 2) + '\n');
const editarTx = (n, fn) => {
  const o = leerTx(n);
  fn(o);
  guardarTx(n, o);
};
const correr = () => spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, BUILD_TEXTOS_RAIZ: tmp, GITHUB_ACTIONS: '' }, encoding: 'utf8' });
const sec = (site, k) => site.sections.find((s) => s.key === k).content;
const prod = (site, slug) => site.products.find((p) => p.slug === slug).data;

before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'build-textos-'));
  original = fs.readFileSync(path.join(RAIZ, 'src', 'data', 'site.json'), 'utf8');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
// cada prueba parte del estado del proyecto (textos iniciales + site.json actual)
beforeEach(() => {
  fs.rmSync(ruta('content'), { recursive: true, force: true });
  fs.cpSync(path.join(RAIZ, 'content', 'textos'), ruta('content', 'textos'), { recursive: true });
  fs.mkdirSync(ruta('src', 'data'), { recursive: true });
  fs.writeFileSync(ruta('src', 'data', 'site.json'), original);
});

test('con los textos iniciales, site.json queda byte a byte igual (el sitio no cambia) y sin avisos', () => {
  const r = correr();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8'), original);
  assert.match(r.stdout, /0 aviso\(s\), site\.json sin cambios/);
  assert.equal(r.stderr, '');
});

test('es idempotente: la segunda corrida no escribe nada', () => {
  editarTx('hero', (h) => {
    h.titulo.es = 'Título nuevo';
    h.titulo.en = 'New title';
  });
  const a = correr();
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /site\.json actualizado/);
  const f = ruta('src', 'data', 'site.json');
  const huella = sha(f);
  const mtime = fs.statSync(f).mtimeMs;
  const b = correr();
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stdout, /site\.json sin cambios/);
  assert.equal(sha(f), huella);
  assert.equal(fs.statSync(f).mtimeMs, mtime);
});

test('cambiar el título ES y EN de hero.json cambia solo ese texto en site.json', () => {
  editarTx('hero', (h) => {
    h.titulo.es = 'Café y cacao con *nombre* propio';
    h.titulo.en = 'Coffee and cocoa with a **name**';
    h.cta_principal.label.es = 'Pide muestras';
  });
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  const site = leerSite();
  assert.deepEqual(sec(site, 'hero').titulo, { es: 'Café y cacao con <em>nombre</em> propio', en: 'Coffee and cocoa with a <strong>name</strong>' });
  assert.deepEqual(sec(site, 'hero').cta_principal.label, { es: 'Pide muestras', en: 'Request samples' });
  // todo lo demás igual
  const esperado = JSON.parse(original);
  sec(esperado, 'hero').titulo = sec(site, 'hero').titulo;
  sec(esperado, 'hero').cta_principal.label = sec(site, 'hero').cta_principal.label;
  assert.deepEqual(site, esperado);
});

test('un campo que no está en la lista blanca se ignora (claves, enlaces, íconos, banderas, secciones nuevas...)', () => {
  editarTx('hero', (h) => {
    h.campo_nuevo = 'x';
    h.cta_principal.href = 'javascript:alert(1)';
    h.cta_principal.label.otro = 'y';
    h.foto = { media_id: 99, pendiente: true };
    h.titulo.es = 'Solo cambia esto';
  });
  editarTx('modelo', (m) => {
    m.pilares[0].icono = 'hackeado';
    m.pilares[0].id = 'otro-id';
    m.pilares[0].visible = false;
    m.pilares[0].titulo.es = 'Pilar renombrado';
  });
  editarTx('header', (h) => {
    h.nav[0].href = 'https://malo.example';
    h.logo_oscuro = { media_id: 77 };
  });
  editarTx('ajustes', (a) => {
    a.notificaciones = { correo_activo: true };
    a.tema = { '--marron': '#000' };
    a.formulario = { gramos_max: 1 };
    a.contacto.direcciones[0].id = 'x';
  });
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /no permitido/);
  const site = leerSite();
  const esperado = JSON.parse(original);
  sec(esperado, 'hero').titulo.es = 'Solo cambia esto';
  sec(esperado, 'modelo').pilares[0].titulo.es = 'Pilar renombrado';
  assert.deepEqual(site, esperado);
  assert.equal(JSON.stringify(site).includes('campo_nuevo'), false);
  assert.equal(JSON.stringify(site).includes('javascript:'), false);
});

test('un HTML malicioso queda saneado: sin <script>, onerror, onclick, enlaces ni estilos', () => {
  editarTx('hero', (h) => {
    h.titulo.es = 'Hola <script>alert(1)</script><img src=x onerror="alert(2)"><em onclick="x()">cursiva</em> <a href="javascript:alert(3)">enlace</a> <b>neg</b> <span style="color:red" class="x">t</span>';
    h.titulo.en = '<iframe src="https://malo.example"></iframe>Hi <scr<script>ipt>alert(4)</script>there <svg onload=alert(5)></svg>ok <style>body{display:none}</style>end<script>alert(6)';
  });
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  const t = sec(leerSite(), 'hero').titulo;
  assert.equal(t.es, 'Hola <em>cursiva</em> enlace <b>neg</b> t');
  for (const malo of ['script', 'onerror', 'onclick', 'onload', 'javascript', 'iframe', 'style', 'svg', '<img', '<a ', 'alert']) {
    assert.equal(t.es.toLowerCase().includes(malo) || t.en.toLowerCase().includes(malo), false, `quedó «${malo}» en ${JSON.stringify(t)}`);
  }
  assert.equal(t.en, 'Hi &lt;scrthere ok end'); // los restos que no son etiquetas válidas quedan como texto inofensivo
});

test('saneado: unidad (lista blanca, etiquetas sin cerrar, símbolos sueltos, texto crudo)', () => {
  assert.equal(sanearRico('<em>abierta'), '<em>abierta</em>');
  assert.equal(sanearRico('cerrada</strong> sola'), 'cerrada sola');
  assert.equal(sanearRico('a < b > c'), 'a &lt; b &gt; c');
  assert.equal(sanearRico('x<br/>y<BR>z'), 'x<br>y<br>z');
  assert.equal(sanearRico('<span class="pendiente">[dato]</span>'), '<span class="pendiente">[dato]</span>');
  assert.equal(sanearRico('<span class="otra">t</span>'), 't');
  assert.equal(sanearRico('<!-- comentario -->visible'), 'visible');
  assert.equal(aHtml('**a** *b*\nc'), '<strong>a</strong> <em>b</em><br>c');
  assert.equal(aHtml('5 * 3 = 15'), '5 * 3 = 15');
  assert.equal(aHtml('Ej.: [msnm]', { marca: true }), 'Ej.: <span class="pendiente">[msnm]</span>');
  assert.equal(aHtml('Ej.: [msnm]'), 'Ej.: [msnm]');
  assert.equal(aTextoPlano('<b>84+</b>\n<script>x()</script>'), '84+');
  assert.equal(aHtml('Completa:', { conEspacio: true }), 'Completa: ');
});

test('marcas sencillas: Enter = salto de línea, **negrita**, *cursiva*; los textos crudos (nombres, puntajes) no admiten marcas', () => {
  editarTx('footer', (f) => {
    f.descripcion.es = 'Primera línea\n**Segunda** en *cursiva*';
  });
  editarTx('productos', (p) => {
    p.lupuna.puntaje = '<b>85+</b>';
    p.lupuna.name = 'Lupuna **X**';
  });
  assert.equal(correr().status, 0);
  const site = leerSite();
  assert.equal(sec(site, 'footer').descripcion.es, 'Primera línea<br><strong>Segunda</strong> en <em>cursiva</em>');
  assert.equal(prod(site, 'lupuna').puntaje, '85+');
  assert.equal(prod(site, 'lupuna').name, 'Lupuna **X**'); // texto crudo: se muestra tal cual, sin convertir
});

test('un texto obligatorio vacío no borra nada (avisa y conserva el anterior); el inglés vacío usa el español', () => {
  editarTx('hero', (h) => {
    h.titulo.es = '   ';
    h.titulo.en = 'Only English';
    h.bajada.es = 'Nueva bajada';
    h.bajada.en = '';
    h.sellos = '';
  });
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /hero\.titulo\.es: está vacío/);
  assert.match(r.stderr, /hero\.sellos: está vacío/);
  const h = sec(leerSite(), 'hero');
  assert.equal(h.titulo.es, JSON.parse(original).sections[1].content.titulo.es); // conservó el español anterior
  assert.equal(h.titulo.en, 'Only English');
  assert.deepEqual(h.bajada, { es: 'Nueva bajada', en: 'Nueva bajada' });
  assert.equal(h.sellos, 'Orgánico UE · NOP · COR · RTPO · Fairtrade · EUDR');
});

test('los opcionales sí pueden quedar vacíos (descripción en inglés para Google)', () => {
  editarTx('ajustes', (a) => {
    a.seo.en.description = 'English description';
  });
  assert.equal(correr().status, 0);
  assert.equal(leerSite().settings.seo.en.description, 'English description');
  editarTx('ajustes', (a) => {
    a.seo.en.description = '';
  });
  assert.equal(correr().status, 0);
  assert.equal(leerSite().settings.seo.en.description, '');
});

test('los avisos del formulario conservan {n}, {total} y {email}; el correo y el RUC se validan', () => {
  editarTx('formulario', (f) => {
    f.mensajes.resumen_plural.es = 'Varias muestras';
    f.mensajes.sin_endpoint.en = 'Not connected';
    f.mensajes.completa.es = 'Falta:';
  });
  editarTx('ajustes', (a) => {
    a.contacto.email_comercial = 'no-es-un-correo';
    a.legal.ruc = '123';
  });
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /resumen_plural\.es: debe conservar \{n\}/);
  assert.match(r.stderr, /sin_endpoint\.en: debe conservar \{email\}/);
  assert.match(r.stderr, /email_comercial/);
  assert.match(r.stderr, /ruc/);
  const site = leerSite();
  const orig = JSON.parse(original);
  assert.deepEqual(site.settings.formulario.mensajes.resumen_plural, orig.settings.formulario.mensajes.resumen_plural);
  assert.deepEqual(site.settings.formulario.mensajes.sin_endpoint, orig.settings.formulario.mensajes.sin_endpoint);
  assert.equal(site.settings.contacto.email_comercial, orig.settings.contacto.email_comercial);
  assert.equal(site.settings.legal.ruc, orig.settings.legal.ruc);
  assert.equal(site.settings.formulario.mensajes.completa.es, 'Falta: '); // conserva el espacio final que usa el sitio al armar el aviso
});

test('las listas no cambian de tamaño: con otro número de ítems esa lista se ignora (no se corre ningún texto de lugar)', () => {
  editarTx('modelo', (m) => {
    m.pilares.splice(1, 1); // «borró» un pilar
    m.pilares[0].titulo.es = 'No debe aplicarse';
    m.titulo.es = 'Esto sí se aplica';
  });
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /modelo\.pilares: la lista debe tener 5 ítems/);
  const site = leerSite();
  const esperado = JSON.parse(original);
  sec(esperado, 'modelo').titulo.es = 'Esto sí se aplica';
  assert.deepEqual(site, esperado);
});

test('las listas se editan ítem por ítem sin tocar ids, íconos ni orden', () => {
  editarTx('modelo', (m) => {
    m.pilares[2].titulo = { es: 'Malezas nuevas', en: 'New weeds' };
    m.pilares[2].texto.es = 'Texto *nuevo*';
  });
  assert.equal(correr().status, 0);
  const site = leerSite();
  const p = sec(site, 'modelo').pilares;
  const o = sec(JSON.parse(original), 'modelo').pilares;
  assert.equal(p.length, 5);
  assert.deepEqual(p.map((x) => [x.id, x.icono, x.visible]), o.map((x) => [x.id, x.icono, x.visible]));
  assert.deepEqual(p[2].titulo, { es: 'Malezas nuevas', en: 'New weeds' });
  assert.equal(p[2].texto.es, 'Texto <em>nuevo</em>');
  assert.equal(p[2].texto.en, o[2].texto.en);
});

test('un texto suelto sigue suelto si ES y EN son iguales; con textos distintos pasa a ES/EN', () => {
  editarTx('proyectos', (p) => {
    p.items[0].nombre = { es: 'Café + Árbol 2', en: 'Café + Árbol 2' };
    p.items[1].nombre = { es: 'Cacao Bosque+', en: 'Cocoa Forest+' };
  });
  assert.equal(correr().status, 0);
  const it = sec(leerSite(), 'proyectos').items;
  assert.equal(it[0].nombre, 'Café + Árbol 2');
  assert.deepEqual(it[1].nombre, { es: 'Cacao Bosque+', en: 'Cocoa Forest+' });
});

test('pendientes: se publican solos cuando se escribe el dato real y vuelven a ocultarse si se vuelve a poner [dato]', () => {
  const orig = JSON.parse(original);
  assert.equal(sec(orig, 'cifras').items[3].pendiente, true);
  editarTx('cifras', (c) => {
    c.items[3].valor = '120';
  });
  editarTx('oferta', (o) => {
    o.ficha[1].dd = { es: '1,200 – 1,800 msnm', en: '1,200 – 1,800 masl' };
  });
  editarTx('proyectos', (p) => {
    p.items[1].impacto.texto = { es: '30 ha en agroforestería', en: '30 ha of agroforestry' };
  });
  editarTx('productos', (p) => {
    p.cocoa_beans.filas[1].dd = 'Trinitario';
  });
  assert.equal(correr().status, 0);
  let site = leerSite();
  assert.equal(sec(site, 'cifras').items[3].valor, '120');
  assert.equal(sec(site, 'cifras').items[3].pendiente, false);
  assert.deepEqual(sec(site, 'oferta').ficha[1].dd, { es: '1,200 – 1,800 msnm', en: '1,200 – 1,800 masl' });
  assert.equal(sec(site, 'oferta').ficha[1].pendiente, false);
  assert.equal(sec(site, 'proyectos').items[1].impacto.pendiente, false);
  assert.equal(prod(site, 'cocoa-beans').filas[1].dd, 'Trinitario');
  assert.equal(prod(site, 'cocoa-beans').filas[1].pendiente, false);
  // los demás pendientes siguen ocultos
  assert.equal(sec(site, 'oferta').ficha[2].pendiente, true);
  assert.equal(sec(site, 'oferta').ficha[4].pendiente, true);
  // y se vuelve a ocultar si se pone otra vez un [dato] (el [dato] se pinta con el estilo de pendiente)
  editarTx('oferta', (o) => {
    o.ficha[1].dd = '[msnm / masl]';
  });
  assert.equal(correr().status, 0);
  site = leerSite();
  assert.equal(sec(site, 'oferta').ficha[1].pendiente, true);
  const dd = sec(site, 'oferta').ficha[1].dd;
  assert.equal(typeof dd === 'string' ? dd : dd.es, '<span class="pendiente">[msnm / masl]</span>');
});

test('redes: el número de WhatsApp actualiza su enlace y TikTok se publica al poner su enlace; el botón de LinkedIn sigue a la red', () => {
  editarTx('ajustes', (a) => {
    a.contacto.whatsapp_numero = '51999888777';
    a.contacto.redes.tiktok.url = 'https://www.tiktok.com/@youthcoop';
    a.contacto.redes.linkedin.url = 'https://www.linkedin.com/company/nueva/';
  });
  assert.equal(correr().status, 0);
  const s = leerSite();
  const red = (n) => s.settings.contacto.redes.find((r) => r.red === n);
  assert.equal(red('whatsapp').url, 'https://wa.me/51999888777');
  assert.equal(red('tiktok').url, 'https://www.tiktok.com/@youthcoop');
  assert.equal(red('tiktok').pendiente, false);
  assert.equal(red('tiktok').etiqueta, 'TikTok');
  assert.equal(sec(s, 'novedades').boton.href, 'https://www.linkedin.com/company/nueva/');
  // un enlace peligroso no se acepta
  editarTx('ajustes', (a) => {
    a.contacto.redes.instagram.url = 'javascript:alert(1)';
  });
  const r = correr();
  assert.match(r.stderr, /instagram\.url/);
  assert.equal(leerSite().settings.contacto.redes.find((x) => x.red === 'instagram').url, 'https://www.instagram.com/youthcoop.pe/');
});

test('el título para Google se copia al index (settings.site) y se vacía el de TikTok vuelve a pendiente', () => {
  editarTx('ajustes', (a) => {
    a.seo.es.title = 'YOUTH COOP · Café y cacao';
    a.seo.es.description = 'Descripción nueva.';
    a.contacto.redes.tiktok.url = '';
  });
  assert.equal(correr().status, 0);
  const s = leerSite();
  assert.equal(s.settings.site.title, 'YOUTH COOP · Café y cacao');
  assert.equal(s.settings.site.description, 'Descripción nueva.');
  assert.equal(s.settings.seo.es.title, 'YOUTH COOP · Café y cacao');
  const tt = s.settings.contacto.redes.find((r) => r.red === 'tiktok');
  assert.equal(tt.url, '#');
  assert.equal(tt.pendiente, true);
});

test('un archivo que no es JSON válido detiene el build sin tocar site.json; un archivo que falta solo avisa', () => {
  fs.writeFileSync(ruta('content', 'textos', 'hero.json'), '{ "titulo": ');
  const r = correr();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /hero\.json no es un JSON válido/);
  assert.equal(fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8'), original);
  fs.rmSync(ruta('content', 'textos', 'hero.json'));
  const r2 = correr();
  assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stderr, /hero\.json: no existe/);
  assert.equal(fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8'), original);
});

test('tipos equivocados y textos enormes se rechazan con aviso', () => {
  editarTx('hero', (h) => {
    h.titulo.es = 12345;
    h.bajada.es = 'x'.repeat(2500);
    h.sellos = ['a'];
  });
  const r = correr();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /no es un texto/);
  assert.match(r.stderr, /2500 caracteres/);
  assert.equal(fs.readFileSync(ruta('src', 'data', 'site.json'), 'utf8'), original);
});

test('el esquema no expone claves técnicas ni nada de notificaciones, tema o estructura', () => {
  const nombres = new Set();
  const recorrer = (campos) => {
    for (const c of campos) {
      nombres.add(c.n);
      if (c.campos) recorrer(c.campos);
    }
  };
  for (const r of RAICES) recorrer(r.campos);
  for (const prohibido of ['id', 'key', 'href', 'icono', 'color', 'media_id', 'visible', 'pendiente', 'active', 'value', 'group', 'position', 'slug', 'kind', 'total', 'on', 'notificaciones', 'correo_activo', 'tema', 'embed_url', 'campo', 'requerido', 'gramos_min', 'gramos_max', 'paso', 'por_defecto', 'lang_default', 'html_lang', 'ocultar_pendientes', 'canonical', 'og_image', 'region', 'grupo']) {
    assert.equal(nombres.has(prohibido), false, `el esquema expone «${prohibido}»`);
  }
  // el panel (config.yml) tampoco: sus campos de texto son exactamente los del esquema
  const cfg = fs.readFileSync(path.join(RAIZ, 'public', 'admin', 'config.yml'), 'utf8');
  const bloque = cfg.slice(cfg.indexOf('# >>> TEXTOS'));
  for (const prohibido of ['notificaciones', 'media_id', 'href', 'embed_url', 'ocultar_pendientes', 'gramos_max']) assert.equal(bloque.includes(prohibido), false, `config.yml menciona ${prohibido}`);
});

test('config.yml y content/textos coinciden con el esquema (npm run panel -- --check)', () => {
  const r = spawnSync(process.execPath, [GENERADOR, '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test('los textos iniciales cubren las 13 secciones, los 5 productos y los ajustes', () => {
  const archivos = fs.readdirSync(path.join(RAIZ, 'content', 'textos')).sort();
  const secciones = ['header', 'hero', 'cifras', 'nosotros', 'modelo', 'proyectos', 'oferta', 'calidad', 'trazabilidad', 'galeria', 'novedades', 'contacto', 'footer'];
  for (const s of [...secciones, 'productos', 'ajustes', 'formulario']) assert.ok(archivos.includes(`${s}.json`), `falta ${s}.json`);
  assert.equal(archivos.length, 16);
  const p = JSON.parse(fs.readFileSync(path.join(RAIZ, 'content', 'textos', 'productos.json'), 'utf8'));
  assert.deepEqual(Object.keys(p), ['lupuna', 'capirona', 'pacay', 'cocoa_beans', 'cocoa_products']);
});
