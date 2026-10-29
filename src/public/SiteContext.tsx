import { createContext, useContext } from 'react';
import type {
  CountryDTO, Item, Lang, MediaInfo, ProductDTO, SampleOptionDTO, SectionContentMap, SectionKey, SettingsDTO,
} from '../shared/types';

export interface SiteCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  settings: SettingsDTO;
  products: ProductDTO[];
  options: SampleOptionDTO[];
  countries: CountryDTO[];
  media: Record<string, MediaInfo>;
  /** settings.site.ocultar_pendientes */
  ocultar: boolean;
  sec: <K extends SectionKey>(k: K) => SectionContentMap[K];
}

export const Ctx = createContext<SiteCtx | null>(null);
export function useSite(): SiteCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSite fuera de <Ctx.Provider>');
  return c;
}

/** Ítems visibles de una colección; con ocultar_pendientes también se quitan los marcados "pendiente". */
export function vis<T extends Item>(arr: T[] | undefined, ocultar: boolean): T[] {
  return (arr ?? []).filter((i) => i.visible !== false && !(ocultar && i.pendiente));
}
