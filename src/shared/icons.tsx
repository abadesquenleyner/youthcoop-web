// Iconos: copia exacta de los SVG de la plantilla. Las claves (tejidos, linkedin...) son las que usa el contenido.
import type { ReactNode } from 'react';

const LI = 'M4 9h4v12H4zM6 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.3 2.6 4.3 6V21h-4v-5.6c0-1.4 0-3.1-1.9-3.1s-2.2 1.5-2.2 3V21h-4z';

/** Símbolos reutilizables (#arcos, #foto-ico, #check): primer hijo del cuerpo, como en la plantilla. */
export function SvgSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <symbol id="arcos" viewBox="0 0 200 200">
        <g fill="none" stroke="currentColor" strokeWidth="10">
          <path d="M5 195 V60 a55 55 0 0 1 55 -55 H80 a115 115 0 0 1 115 115" />
          <path d="M35 195 V75 a40 40 0 0 1 40 -40 H80 a85 85 0 0 1 85 85" />
          <path d="M65 195 V90 a25 25 0 0 1 25 -25 a55 55 0 0 1 45 55" />
        </g>
      </symbol>
      <symbol id="foto-ico" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
          <circle cx="12" cy="13" r="4" />
        </g>
      </symbol>
      <symbol id="check" viewBox="0 0 24 24">
        <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M7.5 12.5l3 3 6-6.5" />
        </g>
      </symbol>
    </svg>
  );
}

export const IconoMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
/** <svg class="arcos" aria-hidden="true"><use href="#arcos"/></svg> */
export const Arcos = () => (
  <svg className="arcos" aria-hidden="true">
    <use href="#arcos" />
  </svg>
);
/** <svg><use href="#check|#foto-ico"/></svg> */
export const UseIcon = ({ href }: { href: string }) => (
  <svg>
    <use href={href} />
  </svg>
);

const PILARES: Record<string, ReactNode> = {
  tejidos: <path d="M12 21V9M12 9l-5-5M12 9l5-5M12 14l-4-3M12 14l4-3" />,
  sombra: (
    <>
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8M8 21h8" />
    </>
  ),
  malezas: (
    <>
      <path d="M12 21v-8M12 13c0-4 3-6 7-6 0 4-3 6-7 6zM12 15c0-3-2-5-6-5 0 3 2 5 6 5z" />
      <path d="M3 21h18" />
    </>
  ),
  nutricion: <path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />,
  plagas: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
};
export const ICONOS_PILAR = Object.keys(PILARES);
export function IconoPilar({ nombre }: { nombre: string }) {
  const g = PILARES[nombre];
  if (!g) return null;
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {g}
    </svg>
  );
}

const REDES: Record<string, ReactNode> = {
  linkedin: <path d={LI} />,
  facebook: <path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8.5c0-.3.2-.5.5-.5z" />,
  whatsapp: (
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3z" />
  ),
  tiktok: (
    <path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 0 1-2.6 2.5 2.6 2.6 0 0 1-2.6-2.6c0-1.7 1.7-3 3.4-2.5V9.7c-3.5-.5-6.5 2.2-6.5 5.6 0 3.3 2.8 5.7 5.7 5.7 3.1 0 5.7-2.6 5.7-5.7V9a7.4 7.4 0 0 0 4.3 1.4V7.3s-1.9.1-3.2-1.5z" />
  ),
};
export const ICONOS_RED = ['linkedin', 'instagram', 'facebook', 'whatsapp', 'tiktok'];
export function IconoRed({ red }: { red: string }) {
  if (red === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  const g = REDES[red];
  if (!g) return null;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      {g}
    </svg>
  );
}

/** LinkedIn decorativo (botón de Novedades y marcador de publicación): aria-hidden. */
export const IconoLinkedInOculto = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d={LI} />
  </svg>
);

/** Globo del botón de WhatsApp de Contacto. */
export const IconoWhatsAppBoton = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.3z" />
  </svg>
);
