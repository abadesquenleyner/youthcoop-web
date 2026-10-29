import { T } from '../../shared/inline';
import { useSite, vis } from '../SiteContext';

export function Cifras() {
  const { sec, ocultar } = useSite();
  const c = sec('cifras');
  return (
    <div className="cifras">
      <div className="contenedor">
        {vis(c.items, ocultar).map((i) => (
          <div className="cifra aparecer" key={i.id}>
            <strong className={i.pendiente ? 'pendiente' : undefined}>
              <T v={i.valor} />
            </strong>
            <T v={i.etiqueta} />
          </div>
        ))}
      </div>
    </div>
  );
}
