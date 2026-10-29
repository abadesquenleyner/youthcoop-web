import { useEffect } from 'react';

const SELECTOR = '.aparecer, #lotesCinco';

/**
 * IntersectionObserver de la plantilla: agrega .visible a .aparecer y #lotesCinco al entrar en pantalla
 * (umbral .15, una sola vez). La clase se pone con classList (no con estado) y los className de esos
 * elementos son constantes, así que React no la pierde al re-renderizar. Un MutationObserver cubre
 * los elementos que aparezcan después (p. ej. al agregar contenido desde el CMS en la vista previa).
 */
export function useReveal() {
  useEffect(() => {
    const objetivos = () => document.querySelectorAll<HTMLElement>(SELECTOR);
    if (!('IntersectionObserver' in window)) {
      objetivos().forEach((el) => el.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    const vistos = new WeakSet<Element>();
    const observar = (el: Element) => {
      if (vistos.has(el) || el.classList.contains('visible')) return;
      vistos.add(el);
      io.observe(el);
    };
    objetivos().forEach(observar);
    const mo = new MutationObserver((muts) =>
      muts.forEach((m) =>
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          if (el.matches(SELECTOR)) observar(el);
          el.querySelectorAll(SELECTOR).forEach(observar);
        }),
      ),
    );
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
