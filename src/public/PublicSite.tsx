import './template.css'; // copia LITERAL del CSS de la plantilla (no editar)
import './extras.css'; // únicos agregados: fotos reales, video, iframe de LinkedIn, botón deshabilitado
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ComponentType } from 'react';
import type { Lang, SectionKey, SectionContentMap, SiteData } from '../shared/types';
import { SvgSprite } from '../shared/icons';
import { Ctx, type SiteCtx } from './SiteContext';
import { useReveal } from './hooks/useReveal';
import { aplicarCabecera, aplicarTema } from './hooks/useCabecera';
import { Header } from './sections/Header';
import { Hero } from './sections/Hero';
import { Cifras } from './sections/Cifras';
import { Nosotros } from './sections/Nosotros';
import { Modelo } from './sections/Modelo';
import { Proyectos } from './sections/Proyectos';
import { Oferta } from './sections/Oferta';
import { Calidad } from './sections/Calidad';
import { Trazabilidad } from './sections/Trazabilidad';
import { Galeria } from './sections/Galeria';
import { Novedades } from './sections/Novedades';
import { Contacto } from './sections/Contacto';
import { Footer } from './sections/Footer';

const CUERPO: Partial<Record<SectionKey, ComponentType>> = {
  hero: Hero,
  cifras: Cifras,
  nosotros: Nosotros,
  modelo: Modelo,
  proyectos: Proyectos,
  oferta: Oferta,
  calidad: Calidad,
  trazabilidad: Trazabilidad,
  galeria: Galeria,
  novedades: Novedades,
  contacto: Contacto,
};

const CLAVE_IDIOMA = 'yc-idioma';

function idiomaInicial(def: Lang): Lang {
  let guardado: string | null = null;
  try {
    guardado = localStorage.getItem(CLAVE_IDIOMA);
  } catch {
    /* sin almacenamiento */
  }
  if (guardado === 'es' || guardado === 'en') return guardado;
  return (navigator.language || def).startsWith('es') ? 'es' : 'en';
}

export default function PublicSite({ site }: { site: SiteData }) {
  const { settings } = site;
  const [lang, setLangState] = useState<Lang>(() => idiomaInicial(settings.site.lang_default));
  const setLang = useCallback((l: Lang) => setLangState(l), []);

  // Idioma: html[lang] + localStorage('yc-idioma') (ponerIdioma de la plantilla)
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(CLAVE_IDIOMA, lang);
    } catch {
      /* sin almacenamiento */
    }
  }, [lang]);

  useEffect(() => aplicarCabecera(settings, lang), [settings, lang]);
  useEffect(() => aplicarTema(settings.tema), [settings.tema]);
  useReveal();

  // Enlaces con #ancla (la página se pinta después de cargar los datos)
  useEffect(() => {
    const h = decodeURIComponent(window.location.hash.slice(1));
    if (h) document.getElementById(h)?.scrollIntoView();
  }, []);

  const visibles = useMemo(() => site.sections.filter((s) => s.visible !== false), [site.sections]);
  const ctx = useMemo<SiteCtx>(() => {
    const mapa = new Map(visibles.map((s) => [s.key, s.content]));
    return {
      lang,
      setLang,
      settings,
      products: site.products.filter((p) => p.active !== false),
      options: site.sample_options,
      countries: site.countries,
      media: site.media,
      ocultar: !!settings.site.ocultar_pendientes,
      sec: <K extends SectionKey>(k: K) => mapa.get(k) as SectionContentMap[K],
    };
  }, [lang, setLang, settings, site, visibles]);

  const tiene = (k: SectionKey) => visibles.some((s) => s.key === k);
  return (
    <Ctx.Provider value={ctx}>
      <SvgSprite />
      {tiene('header') && <Header />}
      <main>
        {visibles.map((s) => {
          const C = CUERPO[s.key];
          return C ? <C key={s.key} /> : null;
        })}
      </main>
      {tiene('footer') && <Footer />}
    </Ctx.Provider>
  );
}
