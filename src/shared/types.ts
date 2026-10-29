// Tipos del contenido de src/data/site.json (forma del GET /api/v1/public/site de la versión con backend).

export type I18n = { es: string; en: string };
export type Plain = string;
/** I18n = dos spans .es/.en; Plain = texto sin spans. Ambos admiten inline HTML de lista blanca. */
export type Texto = I18n | Plain;
export type Lang = 'es' | 'en';

export interface Item {
  id: string;
  visible?: boolean;
  pendiente?: boolean;
}

export interface MediaRef {
  media_id: number | null;
  etiqueta?: string;
  caption?: Texto;
  medidas?: string;
  pendiente?: boolean;
}
export interface LogoRef {
  media_id: number | null;
  seed_media?: string;
  alt?: Texto;
}
export interface MediaVariant {
  /** ancho en px (el backend lo manda como "width"; se acepta también "w") */
  width?: number;
  w?: number;
  url: string;
}
export interface MediaInfo {
  url: string;
  kind: 'image' | 'video' | 'document';
  width?: number | null;
  height?: number | null;
  alt?: Partial<I18n> | string | null;
  poster?: string | null;
  /** punto focal 0-100 -> object-position */
  focal_x?: number | null;
  focal_y?: number | null;
  /** el backend manda un arreglo [{url, width}] ordenado por ancho; se acepta también una cadena srcset ya armada */
  srcset?: string | MediaVariant[] | null;
  variants?: MediaVariant[] | null;
}

export interface Enlace {
  label: Texto;
  href: string;
}

// ---------- secciones ----------
export interface HeaderC {
  logo_oscuro: LogoRef;
  logo_claro: LogoRef;
  href_inicio: string;
  aria: { inicio: string; nav: string; idioma: string; menu: string };
  nav: (Item & { href: string; label: Texto })[];
  cta: Enlace;
}
export interface HeroC {
  titulo: Texto;
  bajada: Texto;
  cta_principal: Enlace;
  cta_secundario: Enlace;
  sellos: Plain;
  foto: MediaRef;
}
export interface CifrasC {
  items: (Item & { valor: Plain; etiqueta: Texto })[];
}
export interface NosotrosC {
  etiqueta: Texto;
  titulo: Texto;
  parrafos: (Item & { texto: Texto })[];
  foto: MediaRef;
  hitos: (Item & { anio: Texto; titulo: Texto; texto: Texto })[];
}
export interface ModeloC {
  etiqueta: Texto;
  titulo: Texto;
  bajada: Texto;
  pilares: (Item & { icono: string; titulo: Texto; texto: Texto })[];
  nota: Texto;
}
export interface ProyectosC {
  etiqueta: Texto;
  titulo: Texto;
  bajada: Texto;
  items: (Item & {
    color: string;
    foto: MediaRef;
    nombre: Texto;
    descripcion: Texto;
    impacto: { texto: Texto; pendiente?: boolean };
    chips: (Item & { texto: Texto })[];
  })[];
}
export interface OfertaC {
  etiqueta: Texto;
  titulo: Texto;
  bajada: Texto;
  ficha: (Item & { dt: Texto; dd: Texto })[];
  lineas: { unidad_puntaje: Texto; etiqueta_notas: Texto };
  como_armamos: { titulo: Texto; pasos: (Item & { titulo: Texto; texto: Texto })[]; principio: Texto };
  cacao: { titulo: Texto; color: string; bajada: Texto };
  cta: Enlace;
}
export interface CalidadC {
  etiqueta: Texto;
  titulo: Texto;
  bajada: Texto;
  aria_tabs: string;
  tabs: (Item & { key: string; label: Texto; color: string })[];
  cafe: { destacado: { titulo: Texto; texto: Texto }; pasos: (Item & { titulo: Texto; texto: Texto })[] };
  cacao: {
    comparacion: {
      mercado: { titulo: Texto; lote: Texto; pie: Texto };
      nuestro: { titulo: Plain; sublotes: (Item & { texto: Plain })[]; pie: Texto };
    };
    pasos: (Item & { titulo: Texto; texto: Texto })[];
  };
}
export interface TrazabilidadC {
  etiqueta: Texto;
  titulo: Texto;
  bajada: Texto;
  checks: (Item & { titulo: Texto; texto: Texto })[];
  certs: (Item & {
    sello: { texto: Plain; media_id: number | null; pendiente?: boolean };
    nombre: Plain;
    detalle: Texto;
  })[];
}
export interface GaleriaC {
  etiqueta: Texto;
  titulo: Texto;
  aria: string;
  fotos: (Item & MediaRef)[];
}
export interface NovedadesC {
  etiqueta: Texto;
  titulo: Texto;
  boton: Enlace;
  posts: (Item & { embed_url: string; alto?: number; placeholder: { titulo: Texto; texto: Texto } })[];
}
export interface ContactoC {
  etiqueta: Texto;
  titulo: Texto;
  bajada: Texto;
  form: {
    tipo: { legend: Texto; opciones: (Item & { value: 'muestras' | 'cotizacion'; label: Texto })[] };
    nombre: { label: Texto };
    empresa: { label: Texto };
    correo: { label: Texto };
    telefono: { label: Texto };
    productos: { legend: Texto; ayuda_muestras: Texto; grupos: (Item & { key: string; titulo: Texto; color: string })[] };
    pais: { label: Texto; placeholder: I18n };
    direccion: { label: Texto; placeholder: I18n };
    courier: { label: Texto; placeholder: I18n };
    volumen: { label: Texto; placeholder: I18n };
    incoterm: { label: Texto };
    certificacion: { label: Texto; placeholder: I18n };
    embarque: { label: Texto };
    mensaje: { label: Texto };
    enviar: { label: Texto };
  };
  datos: {
    escribenos: { titulo: Texto; comercial: Texto; logistica: Texto };
    redes: { titulo: Texto };
  };
}
export interface FooterC {
  logo: LogoRef;
  descripcion: Texto;
  explorar: { titulo: Texto; links: (Item & { href: string; label: Texto })[] };
  contacto: { titulo: Texto };
  derechos: Texto;
}

export interface SectionContentMap {
  header: HeaderC;
  hero: HeroC;
  cifras: CifrasC;
  nosotros: NosotrosC;
  modelo: ModeloC;
  proyectos: ProyectosC;
  oferta: OfertaC;
  calidad: CalidadC;
  trazabilidad: TrazabilidadC;
  galeria: GaleriaC;
  novedades: NovedadesC;
  contacto: ContactoC;
  footer: FooterC;
}
export type SectionKey = keyof SectionContentMap;

export interface SectionDTO {
  key: SectionKey;
  position?: number;
  visible?: boolean;
  content: SectionContentMap[SectionKey];
}

// ---------- productos, opciones, países ----------
export interface Escala {
  label: Texto;
  valor: Texto;
  total: number;
  on: number[];
}
export interface CoffeeLineData {
  name: Plain;
  tipo: Texto;
  puntaje: Plain;
  arbol: Texto;
  descripcion: Texto;
  escalas: Escala[];
  notas: Texto;
  foto?: MediaRef;
}
export interface CocoaCardData {
  titulo: Texto;
  foto: MediaRef;
  filas: { dt: Texto; dd: Texto; pendiente?: boolean }[];
}
export type ProductDTO =
  | { kind: 'coffee_line'; slug: string; position: number; active?: boolean; data: CoffeeLineData }
  | { kind: 'cocoa_card'; slug: string; position: number; active?: boolean; data: CocoaCardData };

export interface SampleOptionDTO {
  group: string;
  value: string;
  label: Texto;
  subtitle: Texto;
  position: number;
  active?: boolean;
}
export interface CountryDTO {
  value: string;
  name_es: string;
  name_en: string;
  region: 'eori' | 'us' | 'otro' | string;
  grupo: string;
  position: number;
  active?: boolean;
}

// ---------- ajustes ----------
export interface RedSocial extends Item {
  red: string;
  url: string;
  etiqueta: string;
}
export interface RegionCampo {
  label: I18n;
  placeholder: I18n | null;
  ayuda: I18n | null;
  requerido: boolean;
  campo: string;
}
export interface SeoLang {
  title: string;
  description: string;
  canonical?: string;
  og_title?: string;
  og_description?: string;
  og_image?: number | string | null;
}
export interface SettingsDTO {
  site: { title: string; description: string; lang_default: Lang; html_lang: string; ocultar_pendientes: boolean };
  seo?: { es?: SeoLang; en?: SeoLang };
  tema?: Record<string, string>;
  contacto: {
    email_comercial: string;
    email_logistica: string;
    whatsapp_numero: string;
    whatsapp_texto: string;
    whatsapp_pie: string;
    sitio_web: string;
    direcciones: (Item & { titulo: Texto; texto: Plain })[];
    redes: RedSocial[];
  };
  formulario: {
    gramos_min: number;
    gramos_max: number;
    paso: number;
    por_defecto: number;
    incoterms: { value: string; label: Texto }[];
    regiones: Record<string, RegionCampo>;
    mensajes: {
      completa: I18n;
      campos: Record<'nombre' | 'empresa' | 'correo' | 'producto' | 'pais' | 'direccion' | 'eori', I18n>;
      resumen_singular: I18n;
      resumen_plural: I18n;
      exito: I18n;
      error_envio: I18n;
      /** aviso cuando el sitio se compiló sin VITE_FORM_ENDPOINT; {email} = contacto.email_comercial */
      sin_endpoint?: I18n;
    };
  };
  legal: { razon_social: string; ruc: string };
}

/** Contenido del sitio (src/data/site.json): misma forma que devolvía GET /api/v1/public/site en la versión con backend. */
export interface SiteData {
  settings: SettingsDTO;
  sections: SectionDTO[];
  products: ProductDTO[];
  sample_options: SampleOptionDTO[];
  countries: CountryDTO[];
  media: Record<string, MediaInfo>;
}
