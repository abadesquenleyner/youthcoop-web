// Envío de solicitudes a Google Sheets mediante una aplicación web de Google Apps Script
// (ver google-apps-script/Code.gs y google-apps-script/README.md).
//
//  - La URL (/exec) va en VITE_FORM_ENDPOINT, que se lee al compilar. Sin ella NO se envía nada.
//  - POST con cuerpo JSON y Content-Type text/plain: es una petición "simple" y no dispara preflight CORS
//    (Apps Script no responde a OPTIONS). Apps Script contesta con una redirección 302 y el JSON queda
//    legible porque la respuesta final lleva `Access-Control-Allow-Origin: *`.
//  - `id` (uuid por envío) viaja en el cuerpo y la hoja lo usa para no duplicar si hay reintentos.

export interface SolicitudItem {
  value: string;
  /** nombre del producto en español, para que la hoja sea legible */
  label: string;
  /** gramos pedidos (muestras); null en cotización */
  gramos: number | null;
}
export interface SolicitudBody {
  /** uuid v4 por envío (deduplicación en la hoja) */
  id: string;
  tipo: 'muestras' | 'cotizacion';
  lang: 'es' | 'en';
  nombre: string;
  empresa: string;
  correo: string;
  telefono: string;
  pais: string;
  mensaje: string;
  productos: SolicitudItem[];
  // muestras
  direccion?: string;
  eori?: string;
  ein?: string;
  taxid?: string;
  courier?: string;
  // cotización
  volumen?: string;
  incoterm?: string;
  certificacion?: string;
  embarque?: string;
  /** honeypot: debe ir vacío */
  website: string;
}

export type ResultadoEnvio =
  /** la hoja recibió la solicitud (o ya la tenía: reintento con el mismo id) */
  | { estado: 'ok'; code?: string; duplicate: boolean }
  /** el script rechazó campos obligatorios; `faltan` usa las claves de settings.formulario.mensajes.campos */
  | { estado: 'invalido'; faltan: string[] }
  /** red caída, tiempo agotado, respuesta que no es JSON o error del script: NO se envió (o no hay certeza) */
  | { estado: 'error' };

/** URL de la aplicación web de Apps Script; vacía si el sitio se compiló sin VITE_FORM_ENDPOINT. */
export const ENDPOINT: string = (import.meta.env.VITE_FORM_ENDPOINT ?? '').trim();

if (!ENDPOINT) {
  console.warn('[YOUTH COOP] VITE_FORM_ENDPOINT no está configurado: el formulario no podrá enviar solicitudes.');
}

const TIEMPO_MAX_MS = 30_000;

export function nuevaClave(): string {
  const cr: Crypto = globalThis.crypto;
  if (typeof cr.randomUUID === 'function') return cr.randomUUID();
  const b = new Uint8Array(16);
  cr.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Envía la solicitud. Nunca devuelve «ok» si el script no lo confirmó con {ok:true}. */
export async function enviarSolicitud(body: SolicitudBody): Promise<ResultadoEnvio> {
  if (!ENDPOINT) return { estado: 'error' };
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), TIEMPO_MAX_MS);
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'omit',
      signal: control.signal,
    });
    if (!r.ok) return { estado: 'error' };
    let json: { ok?: unknown; code?: unknown; faltan?: unknown; duplicate?: unknown } | null = null;
    try {
      json = JSON.parse(await r.text());
    } catch {
      return { estado: 'error' }; // p. ej. la página HTML de error de Google: no es una confirmación
    }
    if (json && json.ok === true) {
      return { estado: 'ok', code: typeof json.code === 'string' ? json.code : undefined, duplicate: json.duplicate === true || json.code === 'duplicate' };
    }
    if (json && json.ok === false && json.code === 'invalid' && Array.isArray(json.faltan) && json.faltan.length) {
      return { estado: 'invalido', faltan: json.faltan.filter((x): x is string => typeof x === 'string') };
    }
    return { estado: 'error' };
  } catch {
    return { estado: 'error' };
  } finally {
    clearTimeout(reloj);
  }
}
