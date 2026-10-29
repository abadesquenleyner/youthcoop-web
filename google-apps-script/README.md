# Recibir las solicitudes del formulario en Google Sheets

El sitio no tiene servidor. Cuando alguien envía el formulario (muestras o cotización), el navegador hace un `POST` a una **aplicación web de Google Apps Script** y esta escribe **una fila por solicitud** en una hoja de cálculo de Google. Todo corre en tu cuenta de Google; no hay costo ni servidor que mantener.

## Qué hace `Code.gs`

- Escribe una fila por solicitud en la pestaña **Solicitudes** (la crea si no existe) con estas columnas: `Fecha, ID, Tipo, Nombre, Empresa, Correo, Teléfono, País, Productos (gramos), Dirección, EORI, EIN, Tax ID, Courier, Volumen, Incoterm, Certificación, Embarque, Mensaje, Idioma`.
- Crea los encabezados que falten (no pisa los que ya existan).
- **No repite** una solicitud: si llega otra con el mismo `ID`, responde `duplicate` y no agrega fila (así un reintento por mala conexión no duplica).
- Valida los campos obligatorios igual que el sitio (nombre, empresa, correo válido, al menos un producto, país; en muestras también dirección y, si el país es de la UE o Reino Unido, el EORI).
- Ignora el campo trampa `website` (honeypot): si viene lleno es un bot, responde `ok` y no guarda nada.
- Usa `LockService` para que dos envíos simultáneos no se pisen.
- Guarda todo como **texto plano**: un valor que empiece con `=`, `+`, `-` o `@` no se ejecuta como fórmula.
- No envía correos.

### Respuestas (siempre JSON)

| Respuesta | Significado |
|---|---|
| `{"ok":true,"code":"saved"}` | fila escrita |
| `{"ok":true,"code":"duplicate","duplicate":true}` | el ID ya estaba en la hoja (no se agregó otra fila) |
| `{"ok":true,"code":"ignored"}` | honeypot lleno (bot): nada guardado |
| `{"ok":false,"code":"invalid","faltan":["nombre","eori"]}` | faltan campos obligatorios; el sitio muestra «Completa: …» |
| `{"ok":false,"code":"bad_request"}` | cuerpo ilegible, `id`/`tipo` inválidos o demasiado grande |
| `{"ok":false,"code":"busy"}` | no se obtuvo el bloqueo a tiempo (el sitio muestra el error de envío; se puede reintentar) |
| `{"ok":false,"code":"error"}` | fallo interno: mira **Ejecuciones** en Apps Script |

El sitio solo muestra el mensaje de éxito cuando recibe `{"ok":true,...}`. Cualquier otra cosa (sin red, página de error de Google, respuesta que no es JSON) se muestra como error de envío y **nunca** como éxito.

## Paso a paso

1. **Crea la hoja.** En [Google Sheets](https://sheets.google.com) crea una hoja nueva (por ejemplo «YOUTH COOP · Solicitudes»), con la cuenta de la empresa.
2. **Abre el editor de scripts.** En la hoja: *Extensiones → Apps Script*.
3. **Pega el código.** Borra lo que haya en `Código.gs`, pega todo el contenido de [`Code.gs`](./Code.gs) y guarda (icono del disquete). Como el script se creó desde la hoja, `SPREADSHEET_ID` se deja vacío.
4. **Autoriza (primera vez).** En la barra superior elige la función `probarDesdeEditor` y pulsa *Ejecutar*. Google pide permisos: *Revisar permisos → tu cuenta → Configuración avanzada → Ir a (proyecto) → Permitir*. Esto crea la pestaña **Solicitudes** con los encabezados y una fila `PRUEBA (borrar)`. **Borra esa fila** al terminar.
5. **Despliega como aplicación web.** *Implementar → Nueva implementación → ⚙ Tipo: Aplicación web*:
   - Descripción: `YOUTH COOP formulario v1`
   - **Ejecutar como: Yo** (tu cuenta)
   - **Quién tiene acceso: Cualquier persona**
   - *Implementar* y copia la **URL de la aplicación web** (termina en `/exec`).
   - Si «Cualquier persona» no aparece, el administrador de tu Google Workspace lo restringe: pídele que lo permita o usa una cuenta de Gmail.
6. **Compruébalo.** Abre la URL en el navegador: debe mostrar `{"ok":true,"code":"ready"}`. (Abrirla no escribe nada.) Para probar la validación sin escribir filas:

   ```
   curl -L -X POST -H "Content-Type: text/plain" -d "{\"id\":\"prueba-sin-datos\",\"tipo\":\"muestras\"}" "URL_DE_LA_APP_WEB"
   ```

   Debe responder `{"ok":false,"code":"invalid","faltan":["nombre","empresa","correo","producto","pais","direccion"]}`.
7. **Pega la URL en el sitio.**
   - **En tu computadora:** copia `.env.example` como `.env.local` y escribe `VITE_FORM_ENDPOINT=https://script.google.com/macros/s/.../exec`. Reinicia `npm run dev` (o vuelve a compilar).
   - **En GitHub:** *Settings → Secrets and variables → Actions* → pestaña **Secrets** (o **Variables**) → *New repository secret* → nombre `VITE_FORM_ENDPOINT`, valor la URL. Luego vuelve a ejecutar el workflow (*Actions → Publicar en GitHub Pages → Run workflow*) para que el sitio se recompile con la URL.
8. **Prueba de punta a punta.** Envía una solicitud real desde el sitio publicado y mira que aparezca la fila. Borra la fila de prueba.

### Cambiar el script más adelante

*Implementar → Administrar implementaciones → ✏ editar → Versión: **Nueva versión** → Implementar.* La URL **no cambia**. Si en cambio creas una «Nueva implementación», la URL cambia y hay que actualizar `VITE_FORM_ENDPOINT` y recompilar.

Si cambias los campos del formulario del sitio, actualiza también `ENCABEZADOS` y `filaDe_()` en `Code.gs`. La lista `PAISES_EORI` debe coincidir con los países de `src/data/site.json` cuya `region` es `eori` (hay una prueba que lo comprueba: `tests/apps-script.test.mjs`).

## Cosas que conviene saber

- **La URL no es secreta.** Queda dentro del JavaScript del sitio, como en cualquier formulario público. Las defensas son: honeypot, validación en el script, tope de tamaño, `ID` único y bloqueo. Si alguien abusa, desactiva la implementación (*Administrar implementaciones → Archivar*) y crea otra.
- **Cuotas.** Google limita cuántas veces al día puede ejecutarse un script; para un formulario comercial sobra, pero no es para tráfico masivo.
- **Datos personales.** La hoja guarda nombres, correos, teléfonos y direcciones: compártela solo con quien deba verla. Falta definir la política de privacidad y retención (ver «Datos pendientes» en el README principal).
- **Respuesta legible desde el navegador.** Apps Script responde al `POST` con una redirección (302) a otra dirección de Google que devuelve el JSON; el navegador la sigue y puede leer la respuesta. Las pruebas del proyecto reproducen ese flujo con servidores locales y comprueban que no hay petición previa (preflight), pero **no se probó contra un despliegue real de Google**: haz la prueba del paso 8. Si algún día la respuesta no se pudiera leer, el sitio mostraría un error aunque la fila se hubiera guardado; reintentar no duplica porque la hoja deduplica por `ID`.
- **No hay correos.** `notificaciones.correo_activo` está en `false` y el script no envía nada. Si quieres un aviso por correo a cada solicitud, se puede agregar una llamada a `MailApp.sendEmail` en `doPost`, pero cambia lo acordado y requiere permisos extra.
