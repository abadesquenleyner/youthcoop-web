// Funciones comunes de los textos editables (las usan build-textos.mjs, generar-panel-textos.mjs y las pruebas).
//
// El cliente escribe en el panel texto sencillo:
//   - Enter (salto de línea)  -> <br>
//   - **negrita**             -> <strong>negrita</strong>
//   - *cursiva*               -> <em>cursiva</em>
//   - [dato]                  -> en los campos "pendiente", se marca como pendiente (<span class="pendiente">[dato]</span>)
// Además se aceptan las etiquetas <br>, <em>, <strong>, <b> escritas a mano (nada más: la lista blanca es la misma que usa
// el sitio en src/shared/inline.tsx). Todo lo demás (<script>, <img onerror=...>, enlaces, atributos, estilos...) se elimina.

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

/** Texto sin caracteres de control, con saltos de línea \n y sin espacios en los extremos. */
export function limpiarBasico(v) {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim() : '';
}

/** Marcas sencillas -> HTML (solo genera <strong>, <em> y <br>). */
function marcasAHtml(s) {
  return s
    .replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\n/g, '<br>');
}

const BLOQUES_PELIGROSOS = /<\s*(script|style|iframe|object|embed|noscript|template|svg|math|textarea|title)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const ABIERTOS_SIN_CIERRE = /<\s*(script|style|iframe|object|embed|noscript|template|svg|math|textarea|title)\b[\s\S]*$/i;
const ETIQUETA = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*)>/g;
const SIMPLES = new Set(['em', 'strong', 'b']);
const escapar = (t) => t.replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Lista blanca de HTML: <br>, <em>, <strong>, <b> y <span class="pendiente"> (sin más atributos). Cierra las que queden
 * abiertas, descarta las de cierre sueltas, elimina el resto de etiquetas (y el contenido de <script>, <style>...) y escapa los
 * "<" y ">" sueltos. El sitio vuelve a sanear con DOMPurify al pintar: esto es la primera barrera, en el build.
 */
export function sanearRico(entrada) {
  let s = String(entrada ?? '').replace(/<!--[\s\S]*?-->/g, '').replace(BLOQUES_PELIGROSOS, '').replace(ABIERTOS_SIN_CIERRE, '');
  const salida = [];
  const pila = []; // { tag, salida: boolean }
  let ultimo = 0;
  for (const m of s.matchAll(ETIQUETA)) {
    salida.push(escapar(s.slice(ultimo, m.index)));
    ultimo = m.index + m[0].length;
    const cierre = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'br') {
      if (!cierre) salida.push('<br>');
    } else if (SIMPLES.has(tag)) {
      if (!cierre) {
        pila.push({ tag, salida: true });
        salida.push(`<${tag}>`);
      } else if (pila.length && pila[pila.length - 1].tag === tag) {
        pila.pop();
        salida.push(`</${tag}>`);
      }
    } else if (tag === 'span') {
      if (!cierre) {
        const permitido = /^\s+class\s*=\s*(["'])pendiente\1\s*\/?$/i.test(m[3]);
        pila.push({ tag, salida: permitido });
        if (permitido) salida.push('<span class="pendiente">');
      } else if (pila.length && pila[pila.length - 1].tag === 'span') {
        const e = pila.pop();
        if (e.salida) salida.push('</span>');
      }
    }
    // cualquier otra etiqueta: se descarta (su texto interior se conserva)
  }
  salida.push(escapar(s.slice(ultimo)));
  while (pila.length) {
    const e = pila.pop();
    if (e.salida) salida.push(`</${e.tag}>`);
  }
  return salida.join('');
}

/** Texto crudo (se pinta tal cual en pantalla, p. ej. el nombre de una línea): sin etiquetas y en una sola línea. */
export function aTextoPlano(entrada) {
  return limpiarBasico(entrada)
    .replace(BLOQUES_PELIGROSOS, '')
    .replace(ABIERTOS_SIN_CIERRE, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}

const SPAN_PEND = /<span class="pendiente">([\s\S]*?)<\/span>/g;
/** [dato] -> <span class="pendiente">[dato]</span> (los pendientes se pintan con el estilo de «por completar»). */
export function envolverPendientes(html) {
  return html.replace(SPAN_PEND, '$1').replace(/\[[^\[\]<>]*\]/g, (m) => `<span class="pendiente">${m}</span>`);
}

/** Lo que escribe el cliente -> lo que se guarda en site.json. `rico` = admite negrita/salto; `marca` = envuelve [pendientes]. */
export function aHtml(valor, { rico = true, marca = false, conEspacio = false } = {}) {
  let s = rico ? sanearRico(marcasAHtml(limpiarBasico(valor))) : aTextoPlano(valor);
  if (rico && marca) s = envolverPendientes(s);
  if (conEspacio && s) s += ' ';
  return s;
}

/** Inverso (solo para generar los valores iniciales desde site.json): HTML -> texto sencillo del panel. */
export function aAmigable(html, { rico = true, marca = false, conEspacio = false } = {}) {
  let s = String(html ?? '');
  if (conEspacio) s = s.replace(/ $/, ''); // un espacio final (p. ej. «Completa: ») no se puede escribir en el panel: lo vuelve a poner el script
  if (!rico) return s;
  if (marca) s = s.replace(SPAN_PEND, '$1');
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/g, '**$2**')
    .replace(/<em>([\s\S]*?)<\/em>/g, '*$1*');
}
