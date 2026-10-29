import { T } from '../../shared/inline';
import { Arcos } from '../../shared/icons';
import { Foto } from '../components/Foto';
import { useSite } from '../SiteContext';
import { safeHref } from '../../shared/url';

export function Hero() {
  const { sec } = useSite();
  const c = sec('hero');
  return (
    <section className="hero" id="inicio">
      <div className="contenedor">
        <div>
          <h1>
            <T v={c.titulo} />
          </h1>
          <p className="bajada">
            <T v={c.bajada} />
          </p>
          <div className="acciones">
            <a href={safeHref(c.cta_principal.href)} className="boton">
              <T v={c.cta_principal.label} />
            </a>
            <a href={safeHref(c.cta_secundario.href)} className="boton secundario">
              <T v={c.cta_secundario.label} />
            </a>
          </div>
          <p className="sellos-hero">
            <T v={c.sellos} />
          </p>
        </div>
        <div className="hero-visual">
          <Arcos />
          <Foto foto={c.foto} margin0 prioridad sizes="(min-width: 900px) 45vw, 460px" />
        </div>
      </div>
    </section>
  );
}
