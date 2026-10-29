import { useEffect, useState } from 'react';
import { T } from '../../shared/inline';
import { IconoMenu } from '../../shared/icons';
import { Logo } from '../components/Logo';
import { useSite, vis } from '../SiteContext';
import { safeHref } from '../../shared/url';

export function Header() {
  const { sec, lang, setLang, ocultar } = useSite();
  const c = sec('header');
  const [conBorde, setConBorde] = useState(false);
  const [abierto, setAbierto] = useState(false);

  // Borde del encabezado: igual que la plantilla, solo reacciona a eventos de scroll
  useEffect(() => {
    const f = () => setConBorde(window.scrollY > 8);
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);

  const cerrar = () => setAbierto(false);
  return (
    <header id="encabezado" className={conBorde ? 'con-borde' : undefined}>
      <div className="contenedor barra">
        <a href={safeHref(c.href_inicio)} className="marca" aria-label={c.aria.inicio}>
          <Logo logo={c.logo_oscuro} className="logo-oscuro" />
          <Logo logo={c.logo_claro} className="logo-claro" />
        </a>
        <nav id="navegacion" aria-label={c.aria.nav} className={abierto ? 'abierto' : undefined}>
          <ul>
            {vis(c.nav, ocultar).map((n) => (
              <li key={n.id}>
                <a href={safeHref(n.href)} onClick={cerrar}>
                  <T v={n.label} />
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="derecha">
          <div className="idioma" role="group" aria-label={c.aria.idioma}>
            <button type="button" data-lang="es" aria-pressed={lang === 'es'} onClick={() => setLang('es')}>
              ES
            </button>
            <button type="button" data-lang="en" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              EN
            </button>
          </div>
          <a href={safeHref(c.cta.href)} className="boton chico">
            <T v={c.cta.label} />
          </a>
          <button
            className="menu-movil"
            id="botonMenu"
            aria-label={c.aria.menu}
            aria-expanded={abierto}
            aria-controls="navegacion"
            onClick={() => setAbierto((a) => !a)}
          >
            <IconoMenu />
          </button>
        </div>
      </div>
    </header>
  );
}
