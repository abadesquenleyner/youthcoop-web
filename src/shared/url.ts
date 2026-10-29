/**
 * Enlaces del contenido editable: el servidor ya los valida al guardar (Content.Sanitizer), pero el
 * sitio vuelve a comprobarlos al pintarlos (defensa en profundidad: una fila de la base de datos
 * escrita por otra vía no puede inyectar `javascript:` ni `data:` en un enlace).
 *
 * Se aceptan: `https://`, `http://`, `mailto:`, `tel:`, rutas `/...` (no `//`) y `#ancla`.
 */
const URL_SEGURA =
  /^(?:https?:\/\/[^\s<>"'`\\]+|mailto:[^\s<>"'`\\]+|tel:[+0-9 ()\-.]+|\/(?!\/)[^\s<>"'`\\]*|#[^\s<>"'`\\]*)$/i;

/** Devuelve el enlace tal cual si es seguro; si no, `#` (el enlace queda inerte). Vacío queda vacío. */
export function safeHref(href: unknown): string {
  if (typeof href !== 'string') return '#';
  const h = href.trim();
  if (h === '') return '';
  return h.length <= 2000 && URL_SEGURA.test(h) ? h : '#';
}
