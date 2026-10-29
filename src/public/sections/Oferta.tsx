import { Fragment } from 'react';
import { T, plano } from '../../shared/inline';
import { UseIcon } from '../../shared/icons';
import type { CocoaCardData, CoffeeLineData, OfertaC } from '../../shared/types';
import { Foto } from '../components/Foto';
import { useSite, vis } from '../SiteContext';
import { safeHref } from '../../shared/url';

function LineaCafe({ d, o }: { d: CoffeeLineData; o: OfertaC }) {
  return (
    <article className="linea aparecer">
      {d.foto && d.foto.media_id != null && <Foto foto={d.foto} margin0 sizes="(min-width: 1060px) 25vw, 100vw" />}
      <div className="linea-cab">
        <div>
          <h3>{d.name}</h3>
          <span className="tipo">
            <T v={d.tipo} />
          </span>
        </div>
        <div className="puntaje">
          <strong>{d.puntaje}</strong>
          <span>
            <T v={o.lineas.unidad_puntaje} />
          </span>
        </div>
      </div>
      <p className="arbol">
        <T v={d.arbol} />
      </p>
      <p>
        <T v={d.descripcion} />
      </p>
      {d.escalas.map((e, i) => (
        <div className="escala" key={i}>
          <div className="escala-top">
            <span>
              <T v={e.label} />
            </span>
            <strong>
              <T v={e.valor} />
            </strong>
          </div>
          <div className="segmentos" role="img" aria-label={`${plano(e.label, 'es')}: ${plano(e.valor, 'es')}`}>
            {Array.from({ length: e.total }, (_, k) => (
              <i key={k} className={e.on.includes(k) ? 'on' : ''} />
            ))}
          </div>
        </div>
      ))}
      <p className="notas">
        <span>
          <T v={o.lineas.etiqueta_notas} />
        </span>
        <T v={d.notas} />
      </p>
    </article>
  );
}

function FichaCacao({ d, ocultar }: { d: CocoaCardData; ocultar: boolean }) {
  return (
    <article className="producto aparecer">
      <Foto foto={d.foto} margin0 sizes="(min-width: 900px) 50vw, 100vw" />
      <div className="cuerpo">
        <h3>
          <T v={d.titulo} />
        </h3>
        <dl>
          {d.filas
            .filter((f) => !(ocultar && f.pendiente))
            .map((f, i) => (
              <Fragment key={i}>
                <dt>
                  <T v={f.dt} />
                </dt>
                <dd>
                  <T v={f.dd} />
                </dd>
              </Fragment>
            ))}
        </dl>
      </div>
    </article>
  );
}

export function Oferta() {
  const { sec, ocultar, products } = useSite();
  const c = sec('oferta');
  const lineas = products.filter((p) => p.kind === 'coffee_line' && p.active !== false);
  const fichas = products.filter((p) => p.kind === 'cocoa_card' && p.active !== false);
  const ficha = vis(c.ficha, ocultar);
  const pasos = vis(c.como_armamos.pasos, ocultar);
  return (
    <section className="lineas" id="oferta">
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
        {ficha.length > 0 && (
          <dl className="ficha aparecer">
            {ficha.map((f) => (
              <div key={f.id}>
                <dt>
                  <T v={f.dt} />
                </dt>
                <dd>
                  <T v={f.dd} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className={lineas.length === 4 ? 'lineas-grid' : 'lineas-grid tres'} id="lineas">
          {lineas.map((p) => (
            <LineaCafe key={p.slug} d={p.data as CoffeeLineData} o={c} />
          ))}
        </div>
        <details className="como-armamos aparecer">
          <summary>
            <T v={c.como_armamos.titulo} />
          </summary>
          <ol className="pasos-oferta">
            {pasos.map((p) => (
              <li className="aparecer" key={p.id}>
                <h3>
                  <T v={p.titulo} />
                </h3>
                <p>
                  <T v={p.texto} />
                </p>
              </li>
            ))}
          </ol>
          <p className="principio-cata">
            <UseIcon href="#check" />
            <T v={c.como_armamos.principio} />
          </p>
        </details>

        <div className="sub-oferta aparecer">
          <h3 className="subtitulo">
            <i className="marca-color" style={{ background: c.cacao.color }} />
            <T v={c.cacao.titulo} />
          </h3>
          <p>
            <T v={c.cacao.bajada} />
          </p>
        </div>
        <div className={fichas.length === 2 ? 'productos-grid dos' : 'productos-grid'}>
          {fichas.map((p) => (
            <FichaCacao key={p.slug} d={p.data as CocoaCardData} ocultar={ocultar} />
          ))}
        </div>
        <div className="acciones aparecer" style={{ marginTop: '2.5rem' }}>
          <a href={safeHref(c.cta.href)} className="boton">
            <T v={c.cta.label} />
          </a>
        </div>
      </div>
    </section>
  );
}
