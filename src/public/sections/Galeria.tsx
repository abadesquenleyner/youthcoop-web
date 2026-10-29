import { T } from '../../shared/inline';
import { Foto } from '../components/Foto';
import { useSite, vis } from '../SiteContext';

export function Galeria() {
  const { sec } = useSite();
  const c = sec('galeria');
  return (
    <section className="galeria" id="galeria">
      <div className="contenedor">
        <div className="titulo aparecer">
          <span className="etiqueta">
            <T v={c.etiqueta} />
          </span>
          <h2>
            <T v={c.titulo} />
          </h2>
        </div>
        <div className="mosaico aparecer" aria-label={c.aria}>
          {vis(c.fotos, false /* los huecos de galería se pintan siempre (son los 6 espacios iniciales); Foto decide si lleva leyenda */).map((f) => (
            <Foto key={f.id} foto={f} sizes="(min-width: 900px) 33vw, 82vw" />
          ))}
        </div>
      </div>
    </section>
  );
}
