// Geometría compartida con la app: comuna por polígono (ray casting) y geohash para el mapa.

type Punto = [number, number]; // [lng, lat], como en GeoJSON
type Anillo = Punto[];
type Poligono = Anillo[]; // el primero es el borde; los demás, agujeros

/** Polígonos de una geometría GeoJSON (Polygon, MultiPolygon o un Feature que la contenga). */
export function poligonosDesdeGeoJson(texto: string): Poligono[] {
  let geo = JSON.parse(texto);
  if (geo.type === 'Feature') geo = geo.geometry;
  if (geo.type === 'Polygon') return [geo.coordinates];
  if (geo.type === 'MultiPolygon') return geo.coordinates;
  throw new Error(`Geometría no soportada: ${geo.type}`);
}

function dentroDeAnillo(lng: number, lat: number, anillo: Anillo): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function contiene(poligonos: Poligono[], lat: number, lng: number): boolean {
  return poligonos.some(([borde, ...agujeros]) =>
    borde !== undefined && dentroDeAnillo(lng, lat, borde) && !agujeros.some((a) => dentroDeAnillo(lng, lat, a)));
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Geohash de 10 caracteres, igual al que genera GeoFireUtils en la app. */
export function geohash(lat: number, lng: number, precision = 10): string {
  const latR = [-90, 90];
  const lngR = [-180, 180];
  let hash = '';
  let bit = 0;
  let ch = 0;
  let par = true;
  while (hash.length < precision) {
    const r = par ? lngR : latR;
    const v = par ? lng : lat;
    const medio = (r[0] + r[1]) / 2;
    if (v >= medio) {
      ch = (ch << 1) | 1;
      r[0] = medio;
    } else {
      ch <<= 1;
      r[1] = medio;
    }
    par = !par;
    if (++bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
