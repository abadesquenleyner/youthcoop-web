import { T, plano } from '../../shared/inline';
import { IconoLinkedInOculto } from '../../shared/icons';
import { useSite, vis } from '../SiteContext';
import { safeHref } from '../../shared/url';

const PREFIJO_EMBED = 'https://www.linkedin.com/embed/';

export function Novedades() {
  const { sec, ocultar, lang } = useSite();
  const c = sec('novedades');
  // Sin URL de LinkedIn: marcador (pendiente) -> con ocultar_pendientes no se pinta
  const posts = vis(c.posts, false).filter((p) => p.embed_url?.startsWith(PREFIJO_EMBED) || !(ocultar && p.pendiente));
  return (
    <section className="novedades" id="novedades">
      <div className="contenedor">
        <div className="cabecera-nov aparecer">
          <div>
            <span className="etiqueta">
              <T v={c.etiqueta} />
            </span>
            <h2>
              <T v={c.titulo} />
            </h2>
          </div>
          <a className="boton secundario" href={safeHref(c.boton.href)} target="_blank" rel="noopener">
            <IconoLinkedInOculto />
            <T v={c.boton.label} />
          </a>
        </div>
        {posts.length > 0 && (
          <div className="posts-li">
            {posts.map((p) => (
              <div className="post-li aparecer" key={p.id}>
                {p.embed_url?.startsWith(PREFIJO_EMBED) ? (
                  <iframe
                    src={p.embed_url}
                    height={p.alto ?? 480}
                    loading="lazy"
                    title={plano(p.placeholder.titulo, lang)}
                    allowFullScreen
                  />
                ) : (
                  <div className="post-ph">
                    <span className="li-ico">
                      <IconoLinkedInOculto />
                    </span>
                    <b>
                      <T v={p.placeholder.titulo} />
                    </b>
                    <small>
                      <T v={p.placeholder.texto} />
                    </small>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
