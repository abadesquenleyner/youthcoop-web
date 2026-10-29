import { useRef, useState, type FormEvent } from 'react';
import { T, plano } from '../../shared/inline';
import { IconoWhatsAppBoton } from '../../shared/icons';
import { ENDPOINT, enviarSolicitud, nuevaClave, type SolicitudBody } from '../../shared/envio';
import type { I18n, Lang, SampleOptionDTO } from '../../shared/types';
import { Redes } from '../components/Redes';
import { useSite, vis } from '../SiteContext';

type Tipo = 'muestras' | 'cotizacion';
interface Aviso {
  clase: 'ok' | 'error';
  texto: I18n;
}

/** 100 g, 900 g, 1 kg, 1.2 kg (la plantilla mostraba "1 kg" para cualquier total >= 1000 g) */
function fmt(v: number, lang: Lang): string {
  if (v < 1000) return `${v} g`;
  const kg = String(+(v / 1000).toFixed(2));
  return `${lang === 'es' ? kg.replace('.', ',') : kg} kg`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Avisos por defecto si faltan en settings.formulario.mensajes (se editan en src/data/site.json)
const SIN_ENDPOINT: I18n = {
  es: 'El envío del formulario todavía no está conectado, así que tu solicitud NO se envió. Escríbenos a {email} o por WhatsApp.',
  en: 'The form is not connected yet, so your request was NOT sent. Please write to us at {email} or on WhatsApp.',
};

export function Contacto() {
  const { sec, lang, settings, options, countries, ocultar } = useSite();
  const c = sec('contacto');
  const f = c.form;
  const cfg = settings.formulario;
  const ct = settings.contacto;
  const { gramos_min: min, gramos_max: max, paso, por_defecto } = cfg;

  const formRef = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<Tipo>('muestras');
  const [pais, setPais] = useState('');
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [gramos, setGramos] = useState<Record<string, number>>({});
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviando, setEnviando] = useState(false);
  const claveEnvio = useRef<{ clave: string; firma: string } | null>(null);

  const muestras = tipo === 'muestras';
  const g = (v: string) => gramos[v] ?? por_defecto;
  const poner = (v: string, n: number) => setGramos((o) => ({ ...o, [v]: Math.min(max, Math.max(min, n)) }));

  const paisesActivos = countries.filter((p) => p.active !== false);
  const regionActual = paisesActivos.find((p) => p.value === pais)?.region ?? '';
  const grupos = vis(f.productos.grupos, ocultar);
  const opcionesPorGrupo = (k: string): SampleOptionDTO[] => options.filter((o) => o.group === k && o.active !== false);
  const filas = grupos.flatMap((gr) => opcionesPorGrupo(gr.key));
  const marcadas = filas.filter((o) => sel[o.value]);
  const nMuestras = marcadas.length;
  const total = marcadas.reduce((a, o) => a + g(o.value), 0);
  const plantillaResumen = nMuestras > 1 ? cfg.mensajes.resumen_plural : cfg.mensajes.resumen_singular;
  const resumen = nMuestras ? plantillaResumen[lang].replace('{n}', String(nMuestras)).replace('{total}', fmt(total, lang)) : '';

  // <optgroup> en el orden de aparición de `grupo`
  const gruposPais: { grupo: string; items: typeof paisesActivos }[] = [];
  for (const p of paisesActivos) {
    let gp = gruposPais.find((x) => x.grupo === p.grupo);
    if (!gp) gruposPais.push((gp = { grupo: p.grupo, items: [] }));
    gp.items.push(p);
  }

  const lista = (campos: I18n[]): I18n => ({
    es: cfg.mensajes.completa.es + campos.map((x) => x.es).join(', ') + '.',
    en: cfg.mensajes.completa.en + campos.map((x) => x.en).join(', ') + '.',
  });

  async function enviar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (enviando) return;
    const form = ev.currentTarget;
    const d = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const M = cfg.mensajes.campos;
    const falta: I18n[] = [];
    if (!d.nombre?.trim()) falta.push(M.nombre);
    if (!d.empresa?.trim()) falta.push(M.empresa);
    if (!EMAIL.test(d.correo ?? '')) falta.push(M.correo);
    if (!marcadas.length) falta.push(M.producto);
    if (!d.pais) falta.push(M.pais);
    if (muestras && !d.direccion?.trim()) falta.push(M.direccion);
    if (muestras && regionActual === 'eori' && !d.eori?.trim()) falta.push(M.eori);
    if (falta.length) {
      setAviso({ clase: 'error', texto: lista(falta) });
      return;
    }

    // Sin la URL de Apps Script (VITE_FORM_ENDPOINT) no hay a dónde enviar: se avisa y NO se finge éxito.
    if (!ENDPOINT) {
      const t = cfg.mensajes.sin_endpoint ?? SIN_ENDPOINT;
      setAviso({ clase: 'error', texto: { es: t.es.replace('{email}', ct.email_comercial), en: t.en.replace('{email}', ct.email_comercial) } });
      return;
    }

    const body: Omit<SolicitudBody, 'id'> = {
      tipo,
      lang,
      nombre: d.nombre.trim(),
      empresa: d.empresa.trim(),
      correo: d.correo.trim(),
      telefono: (d.telefono ?? '').trim(),
      pais: d.pais,
      mensaje: (d.mensaje ?? '').trim(),
      productos: marcadas.map((o) => ({ value: o.value, label: plano(o.label, 'es'), gramos: muestras ? g(o.value) : null })),
      website: d.website ?? '',
    };
    if (muestras) {
      body.direccion = d.direccion.trim();
      if (regionActual === 'eori') body.eori = d.eori.trim();
      if (regionActual === 'us' && d.ein?.trim()) body.ein = d.ein.trim();
      if (regionActual === 'otro' && d.taxid?.trim()) body.taxid = d.taxid.trim();
      if (d.courier?.trim()) body.courier = d.courier.trim();
    } else {
      body.volumen = (d.volumen ?? '').trim();
      body.incoterm = d.incoterm;
      body.certificacion = (d.certificacion ?? '').trim();
      body.embarque = d.embarque ?? '';
    }

    // Un id (uuid) por envío; se reutiliza solo si el contenido es idéntico (reintento tras un corte de red):
    // la hoja deduplica por este id.
    const firma = JSON.stringify(body);
    if (!claveEnvio.current || claveEnvio.current.firma !== firma) claveEnvio.current = { clave: nuevaClave(), firma };

    setEnviando(true);
    try {
      const r = await enviarSolicitud({ id: claveEnvio.current.clave, ...body });
      if (r.estado === 'ok') {
        claveEnvio.current = null;
        form.reset();
        setTipo('muestras');
        setPais('');
        setSel({});
        setGramos({});
        setAviso({ clase: 'ok', texto: cfg.mensajes.exito });
      } else if (r.estado === 'invalido') {
        // El script repite la validación del sitio y devuelve las claves de los campos que faltan
        claveEnvio.current = null;
        const campos = r.faltan.map((k) => M[k as keyof typeof M]).filter(Boolean);
        setAviso({ clase: 'error', texto: campos.length ? lista(campos) : cfg.mensajes.error_envio });
      } else {
        setAviso({ clase: 'error', texto: cfg.mensajes.error_envio });
      }
    } finally {
      setEnviando(false);
    }
  }

  const phEs = (p: I18n | null | undefined) => (p ? { 'data-ph-es': p.es, 'data-ph-en': p.en, placeholder: p[lang] } : {});
  const avisoClase = aviso ? `aviso completo visible ${aviso.clase}` : 'aviso completo';

  return (
    <section className="contacto" id="contacto" style={{ paddingTop: '2rem' }}>
      <div className="contenedor">
        <div className="titulo aparecer">
          <span className="etiqueta">
            <T v={c.etiqueta} />
          </span>
          <h2>
            <T v={c.titulo} />
          </h2>
          <p>
            <T v={c.bajada} />
          </p>
        </div>
        <div className="rejilla">
          <form id="formulario" className="aparecer" noValidate ref={formRef} onSubmit={enviar} aria-busy={enviando || undefined}>
            <fieldset className="completo tipo-solicitud">
              <legend className="sr">
                <T v={f.tipo.legend} />
              </legend>
              {vis(f.tipo.opciones, ocultar).map((o) => (
                <label className="seg" key={o.id}>
                  <input type="radio" name="tipo" value={o.value} checked={tipo === o.value} onChange={() => setTipo(o.value)} />
                  <span>
                    <T v={o.label} />
                  </span>
                </label>
              ))}
            </fieldset>
            <label>
              <T v={f.nombre.label} />
              <input name="nombre" autoComplete="name" required />
            </label>
            <label>
              <T v={f.empresa.label} />
              <input name="empresa" autoComplete="organization" required />
            </label>
            <label>
              <T v={f.correo.label} />
              <input type="email" name="correo" autoComplete="email" required />
            </label>
            <label>
              <T v={f.telefono.label} />
              <input type="tel" name="telefono" autoComplete="tel" />
            </label>
            <fieldset className="completo pedido">
              <legend className="lbl">
                <T v={f.productos.legend} />{' '}
                <small className="solo-muestras" hidden={!muestras}>
                  <T v={f.productos.ayuda_muestras} />
                </small>
              </legend>
              <div className="grupos">
                {grupos.map((gr) => (
                  <div className="grupo" key={gr.id}>
                    <h4>
                      <i className="marca-color" style={{ background: gr.color }} />
                      <T v={gr.titulo} />
                    </h4>
                    {opcionesPorGrupo(gr.key).map((o) => {
                      const on = !!sel[o.value];
                      const v = g(o.value);
                      return (
                        <div className="fila" key={o.value}>
                          <label className="check">
                            <input
                              type="checkbox"
                              name="productos"
                              value={o.value}
                              checked={on}
                              onChange={(e) => setSel((s) => ({ ...s, [o.value]: e.target.checked }))}
                            />
                            <span className="caja" aria-hidden="true" />
                            <span className="txt">
                              <b>
                                <T v={o.label} />
                              </b>
                              <small>
                                <T v={o.subtitle} />
                              </small>
                            </span>
                          </label>
                          <div className="stepper mini solo-muestras" hidden={!(on && muestras)}>
                            <button type="button" data-paso={-paso} aria-label={`${o.value}: −${paso} g`} disabled={v <= min} onClick={() => poner(o.value, v - paso)}>
                              −
                            </button>
                            <output aria-live="polite">{fmt(v, lang)}</output>
                            <button type="button" data-paso={paso} aria-label={`${o.value}: +${paso} g`} disabled={v >= max} onClick={() => poner(o.value, v + paso)}>
                              +
                            </button>
                            <input type="hidden" value={v} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="resumen solo-muestras" id="resumen" aria-live="polite" hidden={!muestras}>
                {resumen}
              </p>
            </fieldset>
            <label>
              <T v={f.pais.label} />
              <select name="pais" id="pais" required value={pais} onChange={(e) => setPais(e.target.value)}>
                <option value="" data-es={f.pais.placeholder.es} data-en={f.pais.placeholder.en}>
                  {f.pais.placeholder[lang]}
                </option>
                {gruposPais.map((gp) => (
                  <optgroup label={gp.grupo} key={gp.grupo}>
                    {gp.items.map((p) => (
                      <option key={p.value} value={p.value} data-reg={p.region} data-es={p.name_es} data-en={p.name_en}>
                        {lang === 'es' ? p.name_es : p.name_en}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="completo solo-muestras" hidden={!muestras}>
              <T v={f.direccion.label} />
              <textarea name="direccion" rows={2} autoComplete="street-address" {...phEs(f.direccion.placeholder)} />
            </label>
            {Object.entries(cfg.regiones).map(([reg, r]) => (
              <label className={`solo-muestras reg reg-${reg}`} hidden={!muestras || regionActual !== reg} key={reg}>
                <T v={r.label} />
                <input name={r.campo} {...phEs(r.placeholder)} />
                {r.ayuda && (
                  <small className="ayuda">
                    <T v={r.ayuda} />
                  </small>
                )}
              </label>
            ))}
            <label className="solo-muestras" hidden={!muestras}>
              <T v={f.courier.label} />
              <input name="courier" {...phEs(f.courier.placeholder)} />
            </label>

            <label className="solo-cotizacion" hidden={muestras}>
              <T v={f.volumen.label} />
              <input name="volumen" {...phEs(f.volumen.placeholder)} />
            </label>
            <label className="solo-cotizacion" hidden={muestras}>
              <T v={f.incoterm.label} />
              <select name="incoterm">
                {cfg.incoterms.map((o) =>
                  typeof o.label === 'string' ? (
                    <option key={o.value}>{o.label}</option>
                  ) : (
                    <option key={o.value} value={o.value} data-es={o.label.es} data-en={o.label.en}>
                      {o.label[lang]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="solo-cotizacion" hidden={muestras}>
              <T v={f.certificacion.label} />
              <input name="certificacion" {...phEs(f.certificacion.placeholder)} />
            </label>
            <label className="solo-cotizacion" hidden={muestras}>
              <T v={f.embarque.label} />
              <input name="embarque" type="month" />
            </label>

            <label className="completo">
              <T v={f.mensaje.label} />
              <textarea name="mensaje" rows={3} />
            </label>
            {/* Honeypot: fuera de la vista, sin tocar el layout (los bots lo llenan; las personas no lo ven) */}
            <div
              data-hp
              aria-hidden="true"
              style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
            >
              <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>
            <div className="completo">
              <button type="submit" className="boton" disabled={enviando}>
                <T v={f.enviar.label} />
              </button>
            </div>
            <div className={avisoClase} id="aviso" role="status">
              {aviso ? aviso.texto[lang] : null}
            </div>
          </form>
          <div className="datos aparecer">
            <div>
              <h3>
                <T v={c.datos.escribenos.titulo} />
              </h3>
              <p>
                <T v={c.datos.escribenos.comercial} />{' '}
                <a href={`mailto:${ct.email_comercial}`}>{ct.email_comercial}</a>
                <br />
                <T v={c.datos.escribenos.logistica} />{' '}
                <a href={`mailto:${ct.email_logistica}`}>{ct.email_logistica}</a>
              </p>
            </div>
            <div>
              <a className="whatsapp" href={`https://wa.me/${ct.whatsapp_numero}`} target="_blank" rel="noopener">
                <IconoWhatsAppBoton />
                {ct.whatsapp_texto}
              </a>
            </div>
            {vis(ct.direcciones, ocultar).map((d) => (
              <div key={d.id}>
                <h3>
                  <T v={d.titulo} />
                </h3>
                <p>
                  <T v={d.texto} />
                </p>
              </div>
            ))}
            <div>
              <h3>
                <T v={c.datos.redes.titulo} />
              </h3>
              <Redes />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

