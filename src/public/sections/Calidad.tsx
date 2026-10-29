import { useRef, useState, type KeyboardEvent } from 'react';
import { T } from '../../shared/inline';
import { Arcos, UseIcon } from '../../shared/icons';
import type { Texto } from '../../shared/types';
import { useSite, vis } from '../SiteContext';

function Pasos({ lista }: { lista: { id: string; titulo: Texto; texto: Texto }[] }) {
  return (
    <ol className="proceso">
      {lista.map((p) => (
        <li key={p.id}>
          <h3>
            <T v={p.titulo} />
          </h3>
          <p>
            <T v={p.texto} />
          </p>
        </li>
      ))}
    </ol>
  );
}

export function Calidad() {
  const { sec, ocultar } = useSite();
  const c = sec('calidad');
  const tabs = vis(c.tabs, ocultar);
  const [activa, setActiva] = useState<string>(tabs[0]?.key ?? 'cafe');
  // la plantilla solo asigna tabindex tras la primera activación
  const [tocado, setTocado] = useState(false);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const lotesCinco = useRef<HTMLDivElement>(null);

  const activar = (key: string) => {
    setTocado(true);
    setActiva(key);
    // #lotesCinco entra con retrasos escalonados al abrir la pestaña de cacao (igual que la plantilla)
    if (key === 'cacao') lotesCinco.current?.classList.add('visible');
  };
  const teclas = (e: KeyboardEvent<HTMLButtonElement>, k: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const n = (k + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      activar(tabs[n].key);
      botones.current[n]?.focus();
    }
  };

  const sublotes = vis(c.cacao.comparacion.nuestro.sublotes, ocultar);
  return (
    <section className="calidad" id="calidad">
      <Arcos />
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
        <div className="pestanas" role="tablist" aria-label={c.aria_tabs}>
          {tabs.map((t, k) => (
            <button
              key={t.id}
              ref={(el) => {
                botones.current[k] = el;
              }}
              role="tab"
              id={`tab-${t.key}`}
              aria-controls={`panel-${t.key}`}
              aria-selected={activa === t.key}
              tabIndex={tocado ? (activa === t.key ? 0 : -1) : k === 0 ? undefined : -1}
              onClick={() => activar(t.key)}
              onKeyDown={(e) => teclas(e, k)}
            >
              <i className="marca-color" style={{ background: t.color }} />
              <T v={t.label} />
            </button>
          ))}
        </div>

        <div className="panel" id="panel-cafe" role="tabpanel" aria-labelledby="tab-cafe" hidden={activa !== 'cafe'}>
          <div className="contenedor-caja nuestro destacado-unico">
            <UseIcon href="#check" />
            <div>
              <h3>
                <T v={c.cafe.destacado.titulo} />
              </h3>
              <p className="pie">
                <T v={c.cafe.destacado.texto} />
              </p>
            </div>
          </div>
          <Pasos lista={vis(c.cafe.pasos, ocultar)} />
        </div>

        <div className="panel" id="panel-cacao" role="tabpanel" aria-labelledby="tab-cacao" hidden={activa !== 'cacao'}>
          <div className="comparar">
            <div className="contenedor-caja">
              <h3>
                <T v={c.cacao.comparacion.mercado.titulo} />
              </h3>
              <div className="lotes uno">
                <div className="lote">
                  <T v={c.cacao.comparacion.mercado.lote} />
                </div>
              </div>
              <p className="pie">
                <T v={c.cacao.comparacion.mercado.pie} />
              </p>
            </div>
            <div className="contenedor-caja nuestro">
              <h3>
                <T v={c.cacao.comparacion.nuestro.titulo} />
              </h3>
              <div className="lotes cinco" id="lotesCinco" ref={lotesCinco}>
                {sublotes.map((s, i) => (
                  <div className="lote" key={s.id} style={{ transitionDelay: i * 0.15 + 's' }}>
                    <UseIcon href="#check" />
                    {s.texto}
                  </div>
                ))}
              </div>
              <p className="pie">
                <T v={c.cacao.comparacion.nuestro.pie} />
              </p>
            </div>
          </div>
          <Pasos lista={vis(c.cacao.pasos, ocultar)} />
        </div>
      </div>
    </section>
  );
}
