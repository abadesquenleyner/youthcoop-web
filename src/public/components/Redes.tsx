import { IconoRed } from '../../shared/icons';
import { useSite, vis } from '../SiteContext';
import { safeHref } from '../../shared/url';

/** Lista de redes (settings.contacto.redes). El pie le agrega `redes-pie`. */
export function Redes({ pie }: { pie?: boolean }) {
  const { settings, ocultar } = useSite();
  return (
    <div className={pie ? 'redes redes-pie' : 'redes'}>
      {vis(settings.contacto.redes, ocultar).map((r) =>
        r.pendiente ? (
          <a key={r.id} href={safeHref(r.url)} className="red-pendiente" aria-label={r.etiqueta} title={r.etiqueta}>
            <IconoRed red={r.red} />
          </a>
        ) : (
          <a key={r.id} href={safeHref(r.url)} target="_blank" rel="noopener" aria-label={r.etiqueta} title={r.etiqueta}>
            <IconoRed red={r.red} />
          </a>
        ),
      )}
    </div>
  );
}
