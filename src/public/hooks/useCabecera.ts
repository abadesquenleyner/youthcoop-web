import type { Lang, SettingsDTO } from '../../shared/types';

/** Título y meta descripción desde settings (seo por idioma; si falta, site.title / site.description). */
export function aplicarCabecera(settings: SettingsDTO, lang: Lang): void {
  const seo = settings.seo?.[lang];
  const titulo = seo?.title || settings.site.title;
  const desc = seo?.description || settings.seo?.es?.description || settings.site.description;
  if (titulo) document.title = titulo;
  let m = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!m) {
    m = document.createElement('meta');
    m.name = 'description';
    document.head.appendChild(m);
  }
  if (desc) m.content = desc;
}

const TOKENS = ['--marron', '--marron-os', '--naranja', '--naranja-texto', '--oro', '--arena', '--fondo', '--tarjeta', '--suave', '--tinta', '--tinta-2', '--linea'];
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/**
 * settings.tema: sobrescribe SOLO los tokens CSS listados y solo si son hex válidos (vacío = valor de la plantilla).
 * Va en un <style> con selector :root (misma especificidad que la plantilla), así las variantes del modo oscuro
 * (:root:not([data-theme="light"]) / [data-theme="dark"]) siguen mandando en oscuro.
 */
export function aplicarTema(tema: Record<string, string> | undefined): (() => void) | void {
  const reglas = TOKENS.filter((k) => tema && HEX.test((tema[k] ?? '').trim())).map((k) => `${k}:${(tema as Record<string, string>)[k].trim()}`);
  let el = document.getElementById('yc-tema');
  if (!reglas.length) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = 'yc-tema';
    document.head.appendChild(el);
  }
  el.textContent = `:root{${reglas.join(';')}}`;
  return () => el?.remove();
}
