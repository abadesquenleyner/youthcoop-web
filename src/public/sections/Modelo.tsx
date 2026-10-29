import { T } from '../../shared/inline';
import { IconoPilar } from '../../shared/icons';
import { useSite, vis } from '../SiteContext';

export function Modelo() {
  const { sec, ocultar } = useSite();
  const c = sec('modelo');
  return (
    <section className="modelo" id="modelo">
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
        <ol className="principios ciclo">
          {vis(c.pilares, ocultar).map((p) => (
            <li className="principio aparecer" key={p.id}>
              <IconoPilar nombre={p.icono} />
              <h3>
                <T v={p.titulo} />
              </h3>
              <p>
                <T v={p.texto} />
              </p>
            </li>
          ))}
        </ol>
        <p className="nota-modelo aparecer">
          <T v={c.nota} />
        </p>
      </div>
    </section>
  );
}
