import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PublicSite from './public/PublicSite';
import { siteData } from './data/site';

// Página única con anclas (#contacto, #oferta...): sin router, sin rutas /admin, sin llamadas a /api.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicSite site={siteData} />
  </StrictMode>,
);
