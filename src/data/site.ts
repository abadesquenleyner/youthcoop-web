// Datos del sitio, ya "horneados": misma forma que devolvía GET /api/v1/public/site (sin backend).
// El contenido se edita en site.json (ver README.md); aquí solo se ordena por `position`.
import site from '@site-json';
import type { SiteData } from '../shared/types';

const crudo = site as unknown as SiteData;
const porPosicion = <T extends { position?: number }>(a: T[]): T[] => [...a].sort((x, y) => (x.position ?? 0) - (y.position ?? 0));

export const siteData: SiteData = {
  ...crudo,
  sections: porPosicion(crudo.sections),
  products: porPosicion(crudo.products),
  sample_options: porPosicion(crudo.sample_options),
  countries: porPosicion(crudo.countries),
};
