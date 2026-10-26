import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import { db } from '../firebase';
import { useSesion } from '../sesion/SesionContext';

/** Firestore admite documentos de hasta 1 MiB; se deja margen para el resto de los campos. */
const TAMANO_MAXIMO_GEOJSON = 900_000;

interface Borrador {
  id: string;
  nombre: string;
  region: string;
  geometria: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  limites: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}

export function Comunas() {
  const { comunas, setComunaId } = useSesion();

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>Comunas</h1>
        <span className="texto-suave">Solo visible para el superadmin</span>
      </div>

      <div className="tarjeta">
        <h2>Comunas clientes</h2>
        {comunas.length === 0 ? (
          <p className="texto-suave">Aún no hay comunas. Agrega la primera abajo.</p>
        ) : (
          <div className="tabla-contenedor">
            <table>
              <thead><tr><th>Código</th><th>Nombre</th><th>Región</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {comunas.map((c) => (
                  <tr key={c.id}>
                    <td><code>{c.id}</code></td>
                    <td>{c.nombre}</td>
                    <td>{c.region}</td>
                    <td>{c.activa ? 'Activa' : 'Inactiva'}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                      <button className="boton pequeno" onClick={() => setComunaId(c.id)}>Ver en el panel</button>
                      <button className={`boton pequeno${c.activa ? ' peligro' : ''}`}
                        onClick={() => updateDoc(doc(db, 'comunas', c.id), { activa: !c.activa })}>
                        {c.activa ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="texto-suave" style={{ fontSize: '0.85rem' }}>
          Una comuna inactiva deja de recibir reportes nuevos desde la app, pero conserva los existentes.
        </p>
      </div>

      <NuevaComuna />
    </div>
  );
}

function NuevaComuna() {
  const { setComunaId } = useSesion();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function leerArchivo(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setAviso(null);
    setBorrador(null);
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    try {
      setBorrador(interpretarGeoJson(await archivo.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    }
  }

  async function guardar(ev: FormEvent) {
    ev.preventDefault();
    if (!borrador) return;
    const id = borrador.id.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      setError('El código solo puede tener letras, números, guiones y guion bajo (ej: 13131).');
      return;
    }
    const geojson = JSON.stringify(borrador.geometria);
    if (geojson.length > TAMANO_MAXIMO_GEOJSON) {
      setError('El límite es demasiado detallado (más de 900 KB). Simplifícalo, por ejemplo en mapshaper.org.');
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      if ((await getDoc(doc(db, 'comunas', id))).exists()) {
        setError(`Ya existe una comuna con el código ${id}.`);
        return;
      }
      await setDoc(doc(db, 'comunas', id), {
        nombre: borrador.nombre.trim(),
        region: borrador.region.trim(),
        activa: true,
        ...borrador.limites,
        geojson,
        creadoEn: serverTimestamp(),
      });
      setAviso(`Comuna ${borrador.nombre} creada. Ya puede recibir reportes; invita a su administrador en «Usuarios».`);
      setComunaId(id);
      setBorrador(null);
    } catch {
      setError('No se pudo guardar la comuna.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="tarjeta" style={{ marginTop: 16 }}>
      <h2>Agregar comuna</h2>
      <p className="texto-suave">
        Sube un archivo GeoJSON con el límite de la comuna (Polygon o MultiPolygon, en grados WGS84).
        En el repositorio hay uno de ejemplo: <code>datos/comunas/san-ramon.geojson</code>.
      </p>
      <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={leerArchivo} />
      {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}
      {aviso && <p className="aviso" style={{ marginTop: 10 }}>{aviso}</p>}

      {borrador && (
        <div className="rejilla dos" style={{ marginTop: 16 }}>
          <form className="formulario" onSubmit={guardar} style={{ margin: 0 }}>
            <label>
              Código (CUT recomendado)
              <input required value={borrador.id} onChange={(e) => setBorrador({ ...borrador, id: e.target.value })} />
            </label>
            <label>
              Nombre
              <input required value={borrador.nombre}
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} />
            </label>
            <label>
              Región
              <input value={borrador.region} onChange={(e) => setBorrador({ ...borrador, region: e.target.value })} />
            </label>
            <button className="boton primario" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Crear comuna'}
            </button>
          </form>
          <div className="mapa-mini" style={{ height: 300 }}>
            <MapContainer
              bounds={[[borrador.limites.minLat, borrador.limites.minLng], [borrador.limites.maxLat, borrador.limites.maxLng]]}
              style={{ height: '100%' }}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <GeoJSON data={borrador.geometria} style={{ color: '#1565c0', weight: 2, fillOpacity: 0.1 }} />
            </MapContainer>
          </div>
        </div>
      )}
    </div>
  );
}

/** Acepta un Feature, FeatureCollection (primer elemento) o geometría directa. */
function interpretarGeoJson(texto: string): Borrador {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  let objeto = json as { type?: string; features?: unknown[]; geometry?: unknown; properties?: Record<string, unknown> };
  if (objeto.type === 'FeatureCollection') objeto = (objeto.features?.[0] ?? {}) as typeof objeto;
  const propiedades = objeto.type === 'Feature' ? objeto.properties ?? {} : {};
  const geometria = (objeto.type === 'Feature' ? objeto.geometry : objeto) as GeoJSON.Geometry | undefined;

  if (!geometria || (geometria.type !== 'Polygon' && geometria.type !== 'MultiPolygon')) {
    throw new Error('El archivo debe contener un Polygon o MultiPolygon.');
  }
  const puntos = (geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates).flat(2);
  if (puntos.length < 4) throw new Error('El polígono no tiene suficientes puntos.');
  const lngs = puntos.map((p) => p[0]);
  const lats = puntos.map((p) => p[1]);
  if (lats.some((v) => Math.abs(v) > 90) || lngs.some((v) => Math.abs(v) > 180)) {
    throw new Error('Las coordenadas no están en grados (WGS84). Reproyecta el archivo a EPSG:4326.');
  }
  return {
    id: String(propiedades.id ?? propiedades.cut ?? propiedades.COD_COMUNA ?? ''),
    nombre: String(propiedades.nombre ?? propiedades.NOM_COM ?? ''),
    region: String(propiedades.region ?? propiedades.NOM_REG ?? ''),
    geometria,
    // reduce en vez de Math.min(...lista): con miles de puntos el spread desborda la pila.
    limites: {
      minLat: lats.reduce((a, b) => Math.min(a, b)), maxLat: lats.reduce((a, b) => Math.max(a, b)),
      minLng: lngs.reduce((a, b) => Math.min(a, b)), maxLng: lngs.reduce((a, b) => Math.max(a, b)),
    },
  };
}
