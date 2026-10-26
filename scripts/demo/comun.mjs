// Utilidades compartidas por los scripts de datos de demo.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const aqui = dirname(fileURLToPath(import.meta.url));

export const COMUNA_ID = '13111'; // La Granja

/** Inicia firebase-admin con la clave de cuenta de servicio (scripts/demo/clave-servicio.json). */
export function conectar() {
  const ruta = process.env.CLAVE_SERVICIO ?? join(aqui, 'clave-servicio.json');
  if (!existsSync(ruta)) {
    console.error(`No encuentro la clave de cuenta de servicio en ${ruta}.\n` +
      'Descárgala en Firebase Console → Configuración del proyecto → Cuentas de servicio → ' +
      'Generar nueva clave privada, y guárdala con ese nombre (no se sube a Git).');
    process.exit(1);
  }
  initializeApp({ credential: cert(JSON.parse(readFileSync(ruta, 'utf8'))) });
  return getFirestore();
}

/** Polígono de la comuna desde datos/comunas (anillo exterior, [lng, lat]). */
export function poligonoComuna() {
  const geo = JSON.parse(readFileSync(
    join(aqui, '../../datos/comunas/13-metropolitana-de-santiago/13111-la-granja.geojson'), 'utf8'));
  const g = geo.geometry ?? geo.features[0].geometry;
  return g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
}

export function dentro([lng, lat], anillo) {
  let adentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) adentro = !adentro;
  }
  return adentro;
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Geohash de 10 caracteres, igual al que genera GeoFireUtils en la app. */
export function geohash(lat, lng, precision = 10) {
  let latR = [-90, 90], lngR = [-180, 180], hash = '', bit = 0, ch = 0, par = true;
  while (hash.length < precision) {
    const r = par ? lngR : latR, v = par ? lng : lat, medio = (r[0] + r[1]) / 2;
    if (v >= medio) { ch = (ch << 1) | 1; r[0] = medio; } else { ch <<= 1; r[1] = medio; }
    par = !par;
    if (++bit === 5) { hash += BASE32[ch]; bit = 0; ch = 0; }
  }
  return hash;
}
