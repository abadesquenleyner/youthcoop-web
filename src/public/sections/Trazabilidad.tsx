import { T, inline } from '../../shared/inline';
import { UseIcon } from '../../shared/icons';
import { useSite, vis } from '../SiteContext';
import { altDe } from '../components/Foto';

export function Trazabilidad() {
  const { sec, ocultar, media, lang } = useSite();
  const c = sec('trazabilidad');
  return (
    <section className="innovacion" id="trazabilidad">
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
        <div className="aparecer">
          <ul className="lista-check cuadricula">
            {vis(c.checks, ocultar).map((k) => (
              <li key={k.id}>
                <UseIcon href="#check" />
                <div>
                  <strong>
                    <T v={k.titulo} />
                  </strong>
                  <T v={k.texto} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="certs">
          {vis(c.certs, ocultar).map((k) => {
            const m = k.sello.media_id != null ? media[String(k.sello.media_id)] : undefined;
            const sinSello = !m && ocultar && k.sello.pendiente; // "LOGO oficial" pendiente: no se pinta el círculo
            return (
              <div className="cert aparecer" key={k.id}>
                {m ? (
                  <div className="sello con-logo">
                    <img src={m.url} alt={altDe(m, lang) || k.nombre} loading="lazy" decoding="async" />
                  </div>
                ) : (
                  !sinSello && (
                    <div className="sello">
                      <T v={k.sello.texto} />
                    </div>
                  )
                )}
                <strong>{k.nombre}</strong>
                {typeof k.detalle === 'string' ? <span>{inline(k.detalle)}</span> : <T v={k.detalle} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
