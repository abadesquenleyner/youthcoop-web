// Inline HTML de lista blanca (<br>, <em>, <strong>, <b>, <span class="pendiente">) saneado con DOMPurify
// y convertido a nodos React: así un texto "Plain" ocupa su sitio sin envoltorio (igual que la plantilla).
import { createElement, Fragment, type ReactNode } from 'react';
import DOMPurify from 'dompurify';
import type { Texto } from './types';

const PERMITIDAS = new Set(['br', 'em', 'strong', 'b', 'span']);
const cache = new Map<string, ReactNode[]>();

function convertir(nodos: NodeListOf<ChildNode>, prefijo: string): ReactNode[] {
  const out: ReactNode[] = [];
  nodos.forEach((n, i) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out.push(n.textContent ?? '');
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element;
      const tag = el.tagName.toLowerCase();
      if (!PERMITIDAS.has(tag)) {
        out.push(...convertir(el.childNodes, `${prefijo}${i}.`));
        return;
      }
      const key = `${prefijo}${i}`;
      if (tag === 'br') {
        out.push(createElement('br', { key }));
        return;
      }
      // Solo se conserva class="pendiente" (única clase permitida)
      const className = tag === 'span' && el.getAttribute('class') === 'pendiente' ? 'pendiente' : undefined;
      out.push(createElement(tag, { key, className }, ...convertir(el.childNodes, `${key}.`)));
    }
  });
  return out;
}

/** Devuelve nodos React de un texto con inline HTML saneado. */
export function inline(html: string): ReactNode[] {
  if (!html) return [];
  if (!/[<&]/.test(html)) return [html];
  const hit = cache.get(html);
  if (hit) return hit;
  const limpio = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['br', 'em', 'strong', 'b', 'span'],
    ALLOWED_ATTR: ['class'],
  });
  const tpl = document.createElement('template');
  tpl.innerHTML = limpio;
  const nodos = convertir(tpl.content.childNodes, 'i');
  cache.set(html, nodos);
  return nodos;
}

/** <T v={I18n|Plain}/>: I18n -> <span class="es">..</span><span class="en">..</span>; Plain -> texto suelto. */
export function T({ v }: { v?: Texto | null }) {
  if (v == null) return null;
  if (typeof v === 'string') return <Fragment>{inline(v)}</Fragment>;
  return (
    <Fragment>
      <span className="es">{inline(v.es || v.en)}</span>
      <span className="en">{inline(v.en || v.es)}</span>
    </Fragment>
  );
}

/** Texto plano (sin etiquetas) para atributos: placeholder, aria-label, alt, <option>. */
export function plano(v: Texto | null | undefined, lang: 'es' | 'en'): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : (lang === 'es' ? v.es || v.en : v.en || v.es);
  if (!/[<&]/.test(s)) return s;
  const d = document.createElement('div');
  d.innerHTML = DOMPurify.sanitize(s, { ALLOWED_TAGS: [], KEEP_CONTENT: true });
  return d.textContent ?? '';
}
