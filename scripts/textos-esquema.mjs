// Qué textos de src/data/site.json se pueden editar desde el panel /admin (LISTA BLANCA) y cómo se llaman allí.
//
// Es la única fuente de verdad de tres cosas:
//   - scripts/build-textos.mjs        fusiona content/textos/*.json en site.json SOLO en estos campos,
//   - scripts/generar-panel-textos.mjs  genera de aquí los archivos iniciales y las colecciones de public/admin/config.yml,
//   - tests/build-textos.test.mjs     comprueba que todo coincide.
// Lo que NO está aquí no se puede cambiar desde el panel: ids, claves, enlaces (href), colores, íconos, posiciones, banderas
// (visible, pendiente, active), cifras de las barras de los cafés, números del formulario (gramos), lista de países,
// notificaciones, tema, medios y fotos (las fotos tienen su propio flujo: content/fotos.json).
//
// Tipos de nodo:
//   i18n    texto en español e inglés ({es, en}). Si en site.json era un texto suelto y ES = EN se conserva suelto.
//   plano   un solo texto (no tiene traducción: nombres propios, correos, cifras...).
//   grupo   agrupa campos (un objeto); `destino` opcional dice dónde está en site.json (por defecto parent[n]).
//   lista   lista de tamaño FIJO (se edita ítem por ítem, sin agregar ni borrar; se empareja por posición).
// Opciones de los textos: max (caracteres; el panel avisa y el build rechaza si pasa de 2000), multi (cuadro grande),
//   rico (admite negrita/cursiva/salto; por defecto sí; false = texto crudo), opc (puede quedar vacío), marca ([dato] =
//   pendiente), patron ([regex, mensaje]), requiere (fragmentos obligatorios como {n}), conEspacio, hint.

const I = (n, et, max, o = {}) => ({ t: 'i18n', n, et, max, ...o });
const P = (n, et, max, o = {}) => ({ t: 'plano', n, et, max, ...o });
const G = (n, et, campos, o = {}) => ({ t: 'grupo', n, et, campos, ...o });
const L = (n, et, cuenta, sing, res, campos, o = {}) => ({ t: 'lista', n, et, cuenta, sing, res, campos, ...o });

const seccion = (k) => (site) => site.sections.find((s) => s.key === k)?.content;
const producto = (slug) => (site) => site.products.find((p) => p.slug === slug)?.data;

// ---------- piezas que se repiten ----------
const etiqueta = I('etiqueta', 'Etiqueta pequeña (sobre el título)', 40, { hint: 'La frase corta en mayúsculas que va sobre el título.' });
const titulo = (max = 130) => I('titulo', 'Título', max);
const bajada = I('bajada', 'Texto de introducción', 420, { multi: true });
const boton = (n, et) => G(n, et, [I('label', 'Texto del botón', 32)]);
const paso = (cuenta) =>
  L('pasos', 'Pasos', cuenta, 'Paso', '{{fields.titulo.es}}', [I('titulo', 'Título del paso', 60), I('texto', 'Texto del paso', 260, { multi: true })]);
const etq = (n, et, max = 30, o = {}) => G(n, et, [I('label', 'Etiqueta del campo', max, o)]);
const etqPh = (n, et, max, maxPh) =>
  G(n, et, [I('label', 'Etiqueta del campo', max), I('placeholder', 'Texto de ejemplo dentro del campo', maxPh, { rico: false })]);
const aviso = 'Mientras diga [pendiente] (entre corchetes) este dato NO se muestra en la web. Cuando escribas el dato real, se publica solo.';

// ---------- una entrada por archivo de content/textos/ ----------
export const RAICES = [
  {
    archivo: 'header',
    col: 'textos',
    etiqueta: 'Menú superior (cabecera)',
    descripcion: 'Las palabras del menú de arriba y el botón «Solicitar muestras».',
    destino: seccion('header'),
    campos: [
      L('nav', 'Enlaces del menú', 7, 'Enlace', '{{fields.label.es}}', [I('label', 'Texto del enlace', 24, { hint: 'Cada enlace lleva a su sección: el destino no se cambia desde aquí.' })]),
      boton('cta', 'Botón de la cabecera'),
      G(
        'aria',
        'Textos para lectores de pantalla (no se ven en la página)',
        [
          P('inicio', 'Nombre del logo', 60, { rico: false }),
          P('nav', 'Nombre del menú', 40, { rico: false }),
          P('idioma', 'Nombre del selector de idioma', 40, { rico: false }),
          P('menu', 'Botón del menú en celular', 30, { rico: false }),
        ],
        { colapsado: true },
      ),
    ],
  },
  {
    archivo: 'hero',
    col: 'textos',
    etiqueta: 'Inicio (portada)',
    descripcion: 'Título grande, texto de introducción, botones y sellos de la portada.',
    destino: seccion('hero'),
    campos: [
      titulo(130),
      bajada,
      boton('cta_principal', 'Botón principal'),
      boton('cta_secundario', 'Botón secundario'),
      P('sellos', 'Línea de sellos y certificaciones', 90, { hint: 'Ejemplo: Orgánico UE · NOP · COR · Fairtrade' }),
    ],
  },
  {
    archivo: 'cifras',
    col: 'textos',
    etiqueta: 'Cifras (franja de números)',
    descripcion: 'Los 4 números destacados debajo de la portada.',
    destino: seccion('cifras'),
    campos: [
      L(
        'items',
        'Cifras',
        4,
        'Cifra',
        '{{fields.valor}} {{fields.etiqueta.es}}',
        [
          P('valor', 'Número', 12, { rico: false, hint: 'Ejemplo: +100 ha. Si escribes [000] entre corchetes, la cifra queda oculta hasta que pongas el dato real.' }),
          I('etiqueta', 'Qué significa', 70),
        ],
        { pendienteSi: true },
      ),
    ],
  },
  {
    archivo: 'nosotros',
    col: 'textos',
    etiqueta: 'Nosotros',
    descripcion: 'Quiénes somos y la línea de tiempo.',
    destino: seccion('nosotros'),
    campos: [
      etiqueta,
      titulo(120),
      L('parrafos', 'Párrafos', 2, 'Párrafo', '{{fields.texto.es | truncate(60)}}', [I('texto', 'Párrafo', 500, { multi: true })]),
      L('hitos', 'Hitos de la línea de tiempo', 5, 'Hito', '{{fields.anio.es}}: {{fields.titulo.es}}', [
        I('anio', 'Años', 20),
        I('titulo', 'Título del hito', 60),
        I('texto', 'Texto del hito', 220, { multi: true }),
      ]),
    ],
  },
  {
    archivo: 'modelo',
    col: 'textos',
    etiqueta: 'Nuestro modelo',
    descripcion: 'Los cinco pilares de la gestión de fincas.',
    destino: seccion('modelo'),
    campos: [
      etiqueta,
      titulo(120),
      bajada,
      L('pilares', 'Pilares', 5, 'Pilar', '{{fields.titulo.es}}', [I('titulo', 'Nombre del pilar', 50), I('texto', 'Explicación', 200, { multi: true })]),
      I('nota', 'Frase final', 300, { multi: true }),
    ],
  },
  {
    archivo: 'proyectos',
    col: 'textos',
    etiqueta: 'Proyectos productivos',
    descripcion: 'Los 3 proyectos con su foto (la foto se cambia en «Fotos del sitio»).',
    destino: seccion('proyectos'),
    campos: [
      etiqueta,
      titulo(120),
      bajada,
      L('items', 'Proyectos', 3, 'Proyecto', '{{fields.nombre.es}}', [
        I('nombre', 'Nombre del proyecto', 60),
        I('descripcion', 'Descripción', 320, { multi: true }),
        G('impacto', 'Dato de impacto', [I('texto', 'Dato de impacto', 80, { marca: true, hint: aviso })], { pendienteSi: true }),
        L('chips', 'Etiquetas (chips)', null, 'Etiqueta', '{{fields.texto.es}}', [I('texto', 'Etiqueta', 30)], { min: 2, max: 3 }),
      ]),
    ],
  },
  {
    archivo: 'oferta',
    col: 'textos',
    etiqueta: 'Oferta de café y cacao',
    descripcion: 'Ficha de origen, los pasos para armar cada lote y la introducción del cacao. Los nombres y descripciones de cada café y cacao están en «Productos».',
    destino: seccion('oferta'),
    campos: [
      etiqueta,
      titulo(120),
      bajada,
      L(
        'ficha',
        'Datos de la ficha de origen',
        5,
        'Dato',
        '{{fields.dt.es}}',
        [I('dt', 'Nombre del dato', 30), I('dd', 'Valor', 60, { marca: true, hint: aviso })],
        { pendienteSi: true },
      ),
      G('lineas', 'Textos de las tarjetas de café', [I('unidad_puntaje', 'Unidad del puntaje', 20), I('etiqueta_notas', 'Título de las notas de cata', 20)]),
      G('como_armamos', 'Cómo armamos cada lote', [I('titulo', 'Título del desplegable', 50), paso(4), I('principio', 'Principio destacado', 120)]),
      G('cacao', 'Introducción del cacao', [I('titulo', 'Título', 30), I('bajada', 'Texto', 260, { multi: true })]),
      boton('cta', 'Botón final'),
    ],
  },
  {
    archivo: 'calidad',
    col: 'textos',
    etiqueta: 'Calidad y control de riesgo',
    descripcion: 'Pestañas de café y cacao con sus controles.',
    destino: seccion('calidad'),
    campos: [
      etiqueta,
      titulo(120),
      bajada,
      P('aria_tabs', 'Nombre de las pestañas para lectores de pantalla (no se ve)', 40, { rico: false }),
      L('tabs', 'Pestañas', 2, 'Pestaña', '{{fields.label.es}}', [I('label', 'Texto de la pestaña', 20)]),
      G(
        'cafe',
        'Pestaña Café',
        [
          G('destacado', 'Recuadro destacado', [I('titulo', 'Título', 80), I('texto', 'Texto', 200, { multi: true })]),
          L('pasos', 'Pasos', 5, 'Paso', '{{fields.titulo.es}}', [I('titulo', 'Título del paso', 50), I('texto', 'Texto del paso', 200, { multi: true })]),
        ],
        { colapsado: true },
      ),
      G(
        'cacao',
        'Pestaña Cacao',
        [
          G('comparacion', 'Comparación de análisis', [
            G('mercado', 'Práctica habitual del mercado', [
              I('titulo', 'Título', 60),
              I('lote', 'Lote', 40),
              I('pie', 'Texto al pie', 140, { multi: true }),
            ]),
            G('nuestro', 'Nuestra práctica', [
              P('titulo', 'Título', 40, { rico: false }),
              L('sublotes', 'Sublotes', 5, 'Sublote', '{{fields.texto}}', [P('texto', 'Texto del sublote', 10, { rico: false, hint: 'Ejemplo: 5 t' })]),
              I('pie', 'Texto al pie', 260, { multi: true }),
            ]),
          ]),
          L('pasos', 'Pasos', 5, 'Paso', '{{fields.titulo.es}}', [I('titulo', 'Título del paso', 50), I('texto', 'Texto del paso', 200, { multi: true })]),
        ],
        { colapsado: true },
      ),
    ],
  },
  {
    archivo: 'trazabilidad',
    col: 'textos',
    etiqueta: 'Trazabilidad y certificaciones',
    descripcion: 'Qué se registra en campo y las certificaciones. Los logos de las certificaciones no se cambian aquí.',
    destino: seccion('trazabilidad'),
    campos: [
      etiqueta,
      titulo(120),
      bajada,
      L('checks', 'Puntos de trazabilidad', 4, 'Punto', '{{fields.titulo.es}}', [I('titulo', 'Título', 50), I('texto', 'Texto', 260, { multi: true })]),
      L('certs', 'Certificaciones', 6, 'Certificación', '{{fields.nombre}}', [
        P('nombre', 'Nombre', 30, { rico: false }),
        I('detalle', 'Detalle (debajo del nombre)', 40),
      ]),
    ],
  },
  {
    archivo: 'galeria',
    col: 'textos',
    etiqueta: 'Galería (títulos)',
    descripcion: 'El título de la galería. Las fotos y sus descripciones se cambian en «Fotos del sitio».',
    destino: seccion('galeria'),
    campos: [
      etiqueta,
      titulo(120),
      P('aria', 'Nombre de la galería para lectores de pantalla (no se ve)', 40, { rico: false }),
    ],
  },
  {
    archivo: 'novedades',
    col: 'textos',
    etiqueta: 'Novedades (LinkedIn)',
    descripcion: 'Título y botón de la sección de novedades. Las publicaciones de LinkedIn aún no se incrustan desde el panel.',
    destino: seccion('novedades'),
    campos: [etiqueta, titulo(120), boton('boton', 'Botón de LinkedIn')],
  },
  {
    archivo: 'contacto',
    col: 'textos',
    etiqueta: 'Contacto: formulario',
    descripcion: 'Títulos y nombres de los campos del formulario. Los avisos de error y de éxito están en «Formulario: avisos y opciones».',
    destino: seccion('contacto'),
    campos: [
      etiqueta,
      titulo(120),
      bajada,
      G(
        'form',
        'Formulario',
        [
          G('tipo', 'Tipo de solicitud', [
            I('legend', 'Título (lo leen los lectores de pantalla)', 30),
            L('opciones', 'Opciones', 2, 'Opción', '{{fields.label.es}}', [I('label', 'Texto', 20)]),
          ]),
          etq('nombre', 'Campo Nombre'),
          etq('empresa', 'Campo Empresa'),
          etq('correo', 'Campo Correo'),
          etq('telefono', 'Campo Teléfono'),
          G('productos', 'Productos', [
            I('legend', 'Título', 30),
            I('ayuda_muestras', 'Ayuda al elegir muestras', 100, { hint: 'Empieza con «·» y se muestra al lado del título.' }),
            L('grupos', 'Grupos de productos', 2, 'Grupo', '{{fields.titulo.es}}', [I('titulo', 'Nombre del grupo', 30)]),
          ]),
          etqPh('pais', 'Campo País', 30, 30),
          etqPh('direccion', 'Campo Dirección', 40, 60),
          etqPh('courier', 'Campo Courier', 40, 60),
          etqPh('volumen', 'Campo Volumen', 30, 50),
          etq('incoterm', 'Campo Incoterm', 20),
          etqPh('certificacion', 'Campo Certificación', 40, 40),
          etq('embarque', 'Campo Fecha de embarque'),
          etq('mensaje', 'Campo Mensaje'),
          etq('enviar', 'Botón de enviar', 30),
        ],
        { colapsado: true },
      ),
      G('datos', 'Datos de contacto (lado derecho)', [
        G('escribenos', 'Escríbenos', [I('titulo', 'Título', 30), I('comercial', 'Texto «Comercial»', 20), I('logistica', 'Texto «Logística»', 20)]),
        G('redes', 'Redes sociales', [I('titulo', 'Título', 30)]),
      ]),
    ],
  },
  {
    archivo: 'footer',
    col: 'textos',
    etiqueta: 'Pie de página',
    descripcion: 'Descripción, enlaces y frase de derechos del final de la página.',
    destino: seccion('footer'),
    campos: [
      I('descripcion', 'Descripción de la empresa', 300, { multi: true, hint: 'Con Enter bajas de línea; con *asteriscos* pones cursiva.' }),
      G('explorar', 'Columna «Explorar»', [
        I('titulo', 'Título', 20),
        L('links', 'Enlaces', 5, 'Enlace', '{{fields.label.es}}', [I('label', 'Texto del enlace', 24)]),
      ]),
      G('contacto', 'Columna «Contacto»', [I('titulo', 'Título', 20)]),
      I('derechos', 'Frase de derechos', 60),
    ],
  },
  {
    archivo: 'productos',
    col: 'productos',
    etiqueta: 'Productos (café y cacao)',
    descripcion: 'Los 3 cafés y las 2 fichas de cacao: nombres, descripciones y datos. Las fotos y las barras de acidez y cuerpo no se cambian aquí.',
    destino: (site) => site,
    campos: [
      ...['lupuna:Lupuna', 'capirona:Capirona', 'pacay:Pacay'].map((x) => {
        const [slug, nombre] = x.split(':');
        return G(
          slug,
          `Café ${nombre}`,
          [
            P('name', 'Nombre', 30, { rico: false, hint: 'Es el nombre que se ve en la tarjeta. El nombre del producto en el formulario se cambia en «Formulario: avisos y opciones».' }),
            I('tipo', 'Tipo de línea', 30),
            P('puntaje', 'Puntaje', 20, { rico: false, hint: 'Ejemplo: 84+  o  82.5 – 83.75' }),
            I('arbol', 'Frase del árbol', 80),
            I('descripcion', 'Descripción', 260, { multi: true }),
            L('escalas', 'Barras de sabor (solo los textos)', 2, 'Barra', '{{fields.label.es}}', [I('label', 'Nombre de la barra', 20), I('valor', 'Descripción', 40)]),
            I('notas', 'Notas de cata', 100),
          ],
          { destino: (site) => producto(slug)(site), colapsado: true },
        );
      }),
      ...[
        ['cocoa_beans', 'cocoa-beans', 'Cacao en grano', 3],
        ['cocoa_products', 'cocoa-products', 'Derivados de cacao', 4],
      ].map(([clave, slug, nombre, filas]) =>
        G(
          clave,
          nombre,
          [
            I('titulo', 'Título de la ficha', 40),
            L(
              'filas',
              'Filas de la ficha',
              filas,
              'Fila',
              '{{fields.dt.es}}',
              [I('dt', 'Nombre del dato', 20), I('dd', 'Valor', 50, { marca: true, hint: aviso })],
              { pendienteSi: true },
            ),
          ],
          { destino: (site) => producto(slug)(site), colapsado: true },
        )
      ),
    ],
  },
  {
    archivo: 'ajustes',
    col: 'ajustes',
    etiqueta: 'Contacto, buscadores y datos legales',
    descripcion: 'Correos, WhatsApp, direcciones, redes sociales, título y descripción para Google, razón social y RUC.',
    destino: (site) => site.settings,
    campos: [
      G('seo', 'Título y descripción en Google', [
        G('es', 'En español', [
          P('title', 'Título de la pestaña y de Google', 120, { rico: false, hint: 'Es lo que aparece en la pestaña del navegador y como título en Google.' }),
          P('description', 'Descripción para Google', 320, { rico: false, multi: true, hint: 'Una o dos frases que resumen la empresa (recomendado hasta 160 caracteres).' }),
        ]),
        G('en', 'En inglés', [
          P('title', 'Título (inglés)', 120, { rico: false }),
          P('description', 'Descripción (inglés)', 320, { rico: false, multi: true, opc: true, hint: 'Si la dejas vacía se usa la española.' }),
        ]),
      ]),
      G('contacto', 'Datos de contacto', [
        P('email_comercial', 'Correo comercial', 80, { rico: false, patron: ['^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', 'Escribe un correo válido, por ejemplo nombre@empresa.com.'] }),
        P('email_logistica', 'Correo de logística', 80, { rico: false, patron: ['^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$', 'Escribe un correo válido, por ejemplo nombre@empresa.com.'] }),
        P('whatsapp_numero', 'Número de WhatsApp (solo números)', 15, {
          rico: false,
          patron: ['^[0-9]{8,15}$', 'Solo números, con el código del país y sin + ni espacios. Ejemplo: 51974289199.'],
          hint: 'Con código de país, sin + ni espacios (ejemplo: 51974289199). También actualiza solo el enlace de la red WhatsApp.',
        }),
        P('whatsapp_texto', 'Texto del botón de WhatsApp', 40, { rico: false, hint: 'Cómo se lee en el botón de la sección Contacto. Ejemplo: WhatsApp +51 974 289 199' }),
        P('whatsapp_pie', 'WhatsApp que se muestra en el pie', 30, { rico: false, hint: 'Ejemplo: +51 974 289 199' }),
        P('sitio_web', 'Dirección web que se muestra en el pie', 60, { rico: false }),
        L('direcciones', 'Direcciones', 2, 'Dirección', '{{fields.titulo.es}}', [
          I('titulo', 'Título (sede, origen...)', 40),
          P('texto', 'Dirección', 160, { multi: true, hint: 'Con Enter bajas de línea.' }),
        ]),
        G(
          'redes',
          'Enlaces de redes sociales',
          [
            ...[
              ['linkedin', 'LinkedIn'],
              ['instagram', 'Instagram'],
              ['facebook', 'Facebook'],
            ].map(([red, nombre]) => G(red, nombre, [urlRed(`Enlace de ${nombre}`)], { destino: (arr) => arr?.find?.((r) => r.red === red) })),
            G(
              'tiktok',
              'TikTok',
              [urlRed('Enlace de TikTok', { opc: true, vacioComo: '#', hint: 'Mientras esté vacío, el ícono de TikTok no se muestra en la web.' })],
              { destino: (arr) => arr?.find?.((r) => r.red === 'tiktok'), pendienteSi: 'enlace' },
            ),
          ],
          { hint: 'El enlace de WhatsApp se arma solo con el número de arriba.' },
        ),
      ]),
      G('legal', 'Datos legales (pie de página)', [
        P('razon_social', 'Razón social', 80, { rico: false }),
        P('ruc', 'RUC', 11, { rico: false, patron: ['^[0-9]{11}$', 'El RUC tiene 11 números.'] }),
      ]),
    ],
  },
  {
    archivo: 'formulario',
    col: 'ajustes',
    etiqueta: 'Formulario: avisos y opciones',
    descripcion: 'Mensajes que ve quien llena el formulario y los nombres de las opciones. Los países y las cantidades en gramos no se cambian desde el panel.',
    destino: (site) => site,
    campos: [
      G('mensajes', 'Avisos del formulario', [
        I('completa', 'Inicio del aviso de campos faltantes', 40, { conEspacio: true, hint: 'Va antes de la lista de campos faltantes. Ejemplo: «Completa:».' }),
        G(
          'campos',
          'Nombre de cada campo en el aviso de campos faltantes',
          ['nombre', 'empresa', 'correo', 'producto', 'pais', 'direccion', 'eori'].map((c) => I(c, `Campo «${c}»`, 40, { rico: false })),
          { colapsado: true },
        ),
        I('resumen_singular', 'Resumen con una muestra', 80, { requiere: ['{n}', '{total}'], hint: 'Conserva {n} y {total}: la web pone ahí la cantidad y el total.' }),
        I('resumen_plural', 'Resumen con varias muestras', 80, { requiere: ['{n}', '{total}'], hint: 'Conserva {n} y {total}: la web pone ahí la cantidad y el total.' }),
        I('exito', 'Aviso de solicitud enviada', 160, { multi: true }),
        I('error_envio', 'Aviso de error al enviar', 160, { multi: true }),
        I('sin_endpoint', 'Aviso de formulario sin conectar', 240, { multi: true, requiere: ['{email}'], hint: 'Conserva {email}: la web pone ahí el correo comercial.' }),
      ], { destino: (site) => site.settings.formulario.mensajes }),
      L('incoterms', 'Opciones de Incoterm', 5, 'Opción', '{{fields.label.es}}', [I('label', 'Texto de la opción', 20, { rico: false })], { destino: (site) => site.settings.formulario.incoterms }),
      G(
        'regiones',
        'Campos según el país de destino',
        [
          G('eori', 'Unión Europea y Reino Unido (EORI)', regionCampos(true), { destino: (r) => r?.eori, colapsado: true }),
          G('us', 'Estados Unidos', regionCampos(false), { destino: (r) => r?.us, colapsado: true }),
          G('otro', 'Otros países', [I('label', 'Nombre del campo', 40)], { destino: (r) => r?.otro, colapsado: true }),
        ],
        { destino: (site) => site.settings.formulario.regiones },
      ),
      L(
        'sample_options',
        'Productos que se pueden pedir en el formulario',
        8,
        'Producto',
        '{{fields.label.es}}',
        [I('label', 'Nombre', 30), I('subtitle', 'Subtítulo', 50)],
        { destino: (site) => site.sample_options },
      ),
    ],
  },
];

function regionCampos(conPlaceholder) {
  return [
    I('label', 'Nombre del campo', 40),
    ...(conPlaceholder ? [I('placeholder', 'Ejemplo dentro del campo', 40, { rico: false })] : []),
    I('ayuda', 'Ayuda bajo el campo', 100),
  ];
}

function urlRed(et, o = {}) {
  return P('url', et, 200, {
    rico: false,
    patron: ['^(#|https?://[^\\s<>"\'`\\\\]+)$', 'Escribe la dirección completa, empezando por https://'],
    ...o,
  });
}
