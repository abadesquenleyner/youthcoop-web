import { T } from '../../shared/inline';
import { Logo } from '../components/Logo';
import { Redes } from '../components/Redes';
import { useSite, vis } from '../SiteContext';
import { safeHref } from '../../shared/url';

export function Footer() {
  const { sec, settings, ocultar } = useSite();
  const c = sec('footer');
  const ct = settings.contacto;
  return (
    <footer>
      <div className="contenedor">
        <div className="rejilla">
          <div>
            <Logo logo={c.logo} />
            <p>
              <T v={c.descripcion} />
            </p>
            <Redes pie />
          </div>
          <div>
            <h4>
              <T v={c.explorar.titulo} />
            </h4>
            <ul>
              {vis(c.explorar.links, ocultar).map((l) => (
                <li key={l.id}>
                  <a href={safeHref(l.href)}>
                    <T v={l.label} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4>
              <T v={c.contacto.titulo} />
            </h4>
            <ul>
              <li>
                <a href={`mailto:${ct.email_comercial}`}>{ct.email_comercial}</a>
              </li>
              <li>
                <a href={`mailto:${ct.email_logistica}`}>{ct.email_logistica}</a>
              </li>
              <li>
                <a href={`https://wa.me/${ct.whatsapp_numero}`} target="_blank" rel="noopener">
                  {ct.whatsapp_pie}
                </a>
              </li>
              <li>{ct.sitio_web}</li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>
            © <span id="anio">{new Date().getFullYear()}</span>
            {` ${settings.legal.razon_social} · RUC ${settings.legal.ruc}`}
          </span>
          <T v={c.derechos} />
        </div>
      </div>
    </footer>
  );
}
