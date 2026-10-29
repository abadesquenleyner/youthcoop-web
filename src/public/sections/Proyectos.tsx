import type { CSSProperties } from 'react';
import { T } from '../../shared/inline';
import { Foto } from '../components/Foto';
import { useSite, vis } from '../SiteContext';

export function Proyectos() {
  const { sec, ocultar } = useSite();
  const c = sec('proyectos');
  return (
    <section id="proyectos">
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
        <div className="proyectos-grid">
          {vis(c.items, ocultar).map((p) => (
            <article className="proyecto aparecer" style={{ '--c': p.color } as CSSProperties} key={p.id}>
              <Foto foto={p.foto} margin0 sizes="(min-width: 900px) 33vw, 100vw" />
              <div className="cuerpo">
                <h3>
                  <T v={p.nombre} />
                </h3>
                <p>
                  <T v={p.descripcion} />
                </p>
                {!(ocultar && p.impacto.pendiente) && (
                  <p className="impacto">
                    <T v={p.impacto.texto} />
                  </p>
                )}
                <div className="chips">
                  {vis(p.chips, ocultar).map((ch) => (
                    <T v={ch.texto} key={ch.id} />
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
