/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL (/exec) de la aplicación web de Google Apps Script que recibe las solicitudes. */
  readonly VITE_FORM_ENDPOINT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
