// Genera el hash de la contraseña del panel (PBKDF2-SHA256 con sal) para cargarlo como secreto PANEL_PASS_HASH.
//
// La contraseña se lee por la ENTRADA ESTÁNDAR (nunca como argumento, para que no quede en el historial):
//   - en una terminal interactiva la pide dos veces sin mostrarla;
//   - con una tubería lee todo lo que llegue:  Get-Clipboard | node hash-password.mjs
// Los mensajes salen por stderr; por stdout sale SOLO el hash, así se puede encadenar:
//   node hash-password.mjs | Set-Clipboard
//   Get-Clipboard | npx wrangler secret put PANEL_PASS_HASH
//
// Formato: pbkdf2$iteraciones$salBase64$hashBase64. Las iteraciones (100000) son el máximo que admite el plan gratis de
// Workers (límite de CPU); el Worker rechaza hashes con más.

import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const ITERACIONES = 100000;
export const LARGO_MINIMO = 12;

/** Devuelve el hash en el formato que entiende el Worker. */
export function generarHash(clave, iteraciones = ITERACIONES, sal = randomBytes(16)) {
  if (typeof clave !== 'string' || !clave) throw new Error('La contraseña está vacía.');
  if (!Number.isInteger(iteraciones) || iteraciones < 1000 || iteraciones > ITERACIONES) {
    throw new Error(`Las iteraciones deben estar entre 1000 y ${ITERACIONES}.`);
  }
  const hash = pbkdf2Sync(Buffer.from(clave, 'utf8'), sal, iteraciones, 32, 'sha256');
  return `pbkdf2$${iteraciones}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

/** Quita solo el salto de línea final que añaden las tuberías de PowerShell. */
const sinSaltoFinal = (t) => t.replace(/\r?\n$/, '');

function leerTuberia() {
  return new Promise((resolve, reject) => {
    const trozos = [];
    process.stdin.on('data', (c) => trozos.push(c));
    process.stdin.on('end', () => resolve(sinSaltoFinal(Buffer.concat(trozos).toString('utf8'))));
    process.stdin.on('error', reject);
  });
}

function pedirOculto(pregunta) {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    let texto = '';
    process.stderr.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    const fin = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener('data', alDato);
      process.stderr.write('\n');
    };
    const alDato = (tecla) => {
      for (const c of tecla) {
        if (c === '\r' || c === '\n') { fin(); resolve(texto); return; }
        if (c === '\u0003') { fin(); reject(new Error('Cancelado.')); return; }
        if (c === '\u007f' || c === '\b') texto = texto.slice(0, -1);
        else texto += c;
      }
    };
    entrada.on('data', alDato);
  });
}

async function principal() {
  let clave;
  if (process.stdin.isTTY) {
    clave = await pedirOculto('Contraseña nueva (no se muestra): ');
    const otra = await pedirOculto('Repítela: ');
    if (clave !== otra) throw new Error('Las dos contraseñas no coinciden.');
  } else {
    clave = await leerTuberia();
  }
  if (clave.length < LARGO_MINIMO) throw new Error(`La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`);
  process.stdout.write(generarHash(clave) + '\n');
  process.stderr.write('Hash generado. Cárgalo con:  Get-Clipboard | npx wrangler secret put PANEL_PASS_HASH\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((e) => {
    process.stderr.write(`Error: ${e.message}\n`);
    process.exit(1);
  });
}
