import type { CSSProperties } from 'react';
import { T, plano } from '../../shared/inline';
import { UseIcon } from '../../shared/icons';
import type { MediaInfo, MediaRef } from '../../shared/types';
import { useSite } from '../SiteContext';

export function srcSetDe(m: MediaInfo): string | undefined {
  const s = m.srcset;
  if (typeof s === 'string' && s) return s;
  const lista = Array.isArray(s) ? s : m.variants;
  if (!lista || lista.length < 2) return undefined; // con una sola variante el srcset no aporta
  return [...lista]
    .map((v) => ({ url: v.url, w: v.width ?? v.w ?? 0 }))
    .filter((v) => v.w > 0)
    .sort((a, b) => a.w - b.w)
    .map((v) => `${v.url} ${v.w}w`)
    .join(', ');
}

/** alt del medio (mapa {es,en} o cadena); vacío si no hay texto en ese idioma */
export function altDe(m: MediaInfo, lang: 'es' | 'en'): string {
  const a = m.alt;
  if (!a) return '';
  if (typeof a === 'string') return a;
  return (a[lang] || a.es || a.en || '').toString();
}
export function posicionFocal(m: MediaInfo): string | undefined {
  if (m.focal_x == null && m.focal_y == null) return undefined;
  return `${m.focal_x ?? 50}% ${m.focal_y ?? 50}%`;
}

// React 18 no conoce `fetchPriority`; en minúsculas el atributo HTML llega tal cual al DOM.
const ATRIBUTO_PRIORIDAD = { fetchpriority: 'high' } as Record<string, string>;

interface Props {
  foto: MediaRef;
  /** la plantilla pone style="margin:0" en casi todos los huecos (menos en la galería) */
  margin0?: boolean;
  sizes?: string;
  /** foto que está a la vista al cargar (el hero): se pide ya (eager) y con prioridad alta; el resto es lazy */
  prioridad?: boolean;
}

/**
 * Hueco de foto:
 *  - con medio asignado: <figure class="foto con-foto"><img class="foto-img"> (o <video>)
 *  - sin medio y ocultar_pendientes=false: el marcador original (figcaption con ícono, texto y medidas)
 *  - sin medio y ocultar_pendientes=true: el fondo rayado sin figcaption
 */
export function Foto({ foto, margin0, sizes = '(min-width: 1060px) 600px, 100vw', prioridad }: Props) {
  const { media, ocultar, lang } = useSite();
  const m = foto.media_id != null ? media[String(foto.media_id)] : undefined;
  const style: CSSProperties | undefined = margin0 ? { margin: 0 } : undefined;

  if (m && m.kind === 'video') {
    const etiqueta = altDe(m, lang) || plano(foto.caption, lang) || undefined;
    return (
      <figure className="foto con-foto" style={style}>
        <video className="foto-img" src={m.url} poster={m.poster ?? undefined} controls playsInline preload="metadata" aria-label={etiqueta} style={{ objectPosition: posicionFocal(m) }} />
      </figure>
    );
  }
  if (m) {
    const alt = altDe(m, lang) || plano(foto.caption, lang) || '';
    return (
      <figure className="foto con-foto" style={style}>
        <img
          className="foto-img"
          src={m.url}
          srcSet={srcSetDe(m)}
          sizes={srcSetDe(m) ? sizes : undefined}
          alt={alt}
          loading={prioridad ? 'eager' : 'lazy'}
          decoding="async"
          width={m.width ?? undefined}
          height={m.height ?? undefined}
          style={{ objectPosition: posicionFocal(m) }}
          {...(prioridad ? ATRIBUTO_PRIORIDAD : undefined)}
        />
      </figure>
    );
  }
  if (ocultar) return <figure className="foto sin-leyenda" style={style} />;
  return (
    <figure className="foto" style={style}>
      <figcaption>
        <b>
          <UseIcon href="#foto-ico" />
          {foto.etiqueta ?? 'FOTO'}
        </b>
        <T v={foto.caption} />
        <small>{foto.medidas}</small>
      </figcaption>
    </figure>
  );
}
