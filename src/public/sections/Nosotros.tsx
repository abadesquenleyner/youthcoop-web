import { T } from '../../shared/inline';
import { Foto } from '../components/Foto';
import { useSite, vis } from '../SiteContext';

export function Nosotros() {
  const { sec, ocultar } = useSite();
  const c = sec('nosotros');
  return (
    <section className="nosotros" id="nosotros">
      <div className="contenedor">
        <div className="rejilla">
          <div className="texto aparecer">
            <span className="etiqueta">
              <T v={c.etiqueta} />
            </span>
            <h2>
              <T v={c.titulo} />
            </h2>
            {vis(c.parrafos, ocultar).map((p) => (
              <p key={p.id}>
                <T v={p.texto} />
              </p>
            ))}
          </div>
          <div className="aparecer">
            <Foto foto={c.foto} margin0 sizes="(min-width: 900px) 50vw, 100vw" />
          </div>
        </div>
        <ol className="linea-tiempo">
          {vis(c.hitos, ocultar).map((h) => (
            <li className="aparecer" key={h.id}>
              <span className="anio">
                <T v={h.anio} />
              </span>
              <h3>
                <T v={h.titulo} />
              </h3>
              <p>
                <T v={h.texto} />
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
