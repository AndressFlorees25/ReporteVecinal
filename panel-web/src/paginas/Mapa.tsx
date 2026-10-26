import { useMemo, useState } from 'react';
import { CircleMarker, GeoJSON, MapContainer, Popup, TileLayer } from 'react-leaflet';
import { Link, useSearchParams } from 'react-router-dom';
import { ChipEstado, ChipUrgencia, formatearFecha } from '../componentes/Chips';
import { useReportes, type FiltrosReportes } from '../datos/reportes';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import {
  CATEGORIAS, CATEGORIAS_EMERGENCIA, NIVELES_URGENCIA, urgencia, type Categoria, type Comuna, type Reporte,
} from '../tipos';

/** '' = todas · 'EMERGENCIAS' = solo las de emergencia · o una categoría puntual. */
type FiltroCategoria = '' | 'EMERGENCIAS' | Categoria;
type ColorearPor = 'categoria' | 'urgencia';

/**
 * Mapa en vivo (se actualiza solo con cada reporte nuevo o cambio de estado). Con ?vista=emergencias
 * parte mostrando solo las emergencias coloreadas por urgencia, para decidir dónde mandar cuadrillas.
 */
export function Mapa() {
  const { comunaId, comunas } = useSesion();
  const yo = useFuncionario();
  const comuna = comunas.find((c) => c.id === comunaId);
  const vistaEmergencias = useSearchParams()[0].get('vista') === 'emergencias';
  const [ocultarResueltos, setOcultarResueltos] = useState(true);
  const [filtro, setFiltro] = useState<FiltroCategoria>(vistaEmergencias ? 'EMERGENCIAS' : '');
  const [colorearPor, setColorearPor] = useState<ColorearPor>(vistaEmergencias ? 'urgencia' : 'categoria');

  const filtros: FiltrosReportes = {
    ...(yo.rol === 'CUADRILLA' ? { asignadoA: yo.uid } : {}),
    ...(filtro === 'EMERGENCIAS' ? { categorias: CATEGORIAS_EMERGENCIA } : filtro ? { categoria: filtro } : {}),
  };
  const { datos: reportes, cargando, error } = useReportes(comunaId, filtros);
  const visibles = (ocultarResueltos ? reportes.filter((r) => r.estado !== 'RESUELTO') : reportes)
    // Los más urgentes se dibujan al final, para que queden encima de los demás.
    .sort((a, b) => urgencia(a) - urgencia(b));
  const conteoUrgencia = [0, 1, 2].map((n) => visibles.filter((r) => urgencia(r) === n).length);

  return (
    <div className="pagina" style={{ maxWidth: 'none' }}>
      <div className="encabezado-pagina">
        <h1>Mapa {comuna && <span className="texto-suave">· {comuna.nombre}</span>}</h1>
        <span className="texto-suave">{cargando ? 'Cargando…' : `${visibles.length} reportes · en vivo`}</span>
      </div>

      <div className="filtros">
        <label className="campo">
          Categoría
          <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroCategoria)}>
            <option value="">Todas</option>
            <option value="EMERGENCIAS">🚨 Solo emergencias</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.icono} {v.nombre}</option>)}
          </select>
        </label>
        <label className="campo">
          Colorear por
          <select value={colorearPor} onChange={(e) => setColorearPor(e.target.value as ColorearPor)}>
            <option value="categoria">Categoría</option>
            <option value="urgencia">Urgencia</option>
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
          <input type="checkbox" checked={ocultarResueltos} onChange={(e) => setOcultarResueltos(e.target.checked)} />
          Ocultar resueltos
        </label>
      </div>

      <div className="leyenda">
        {colorearPor === 'urgencia'
          ? [2, 1, 0].map((n) => (
            <span key={n}>
              <span className="punto" style={{ background: NIVELES_URGENCIA[n].color }} />
              {NIVELES_URGENCIA[n].nombre} <strong>({conteoUrgencia[n]})</strong>
            </span>
          ))
          : Object.entries(CATEGORIAS)
            .filter(([k, c]) => !filtro || (filtro === 'EMERGENCIAS' ? c.emergencia : k === filtro))
            .map(([k, c]) => <span key={k}><span className="punto" style={{ background: c.color }} />{c.nombre}</span>)}
      </div>
      {error && <p className="error">{error}</p>}
      {comuna && (
        <div className="mapa-grande">
          <MapContainer key={comuna.id} bounds={limites(comuna)} style={{ height: '100%' }}>
            <TileLayer attribution='&copy; OpenStreetMap' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <LimiteComuna comuna={comuna} />
            {visibles.map((r) => <MarcadorReporte key={r.id} reporte={r} colorearPor={colorearPor} />)}
          </MapContainer>
        </div>
      )}
      <p className="texto-suave" style={{ fontSize: '0.85rem' }}>
        {colorearPor === 'urgencia'
          ? 'Los puntos más grandes son los más urgentes. Borde negro: reporte recibido que aún nadie ha gestionado.'
          : 'Borde rojo: reporte recibido que aún nadie ha gestionado. Los puntos grandes son prioritarios.'}
      </p>
    </div>
  );
}

function MarcadorReporte({ reporte: r, colorearPor }: { reporte: Reporte; colorearPor: ColorearPor }) {
  const nivel = urgencia(r);
  const sinGestionar = r.estado === 'RECIBIDO';
  const relleno = colorearPor === 'urgencia' ? NIVELES_URGENCIA[nivel].color : CATEGORIAS[r.categoria].color;
  // En el modo por urgencia el relleno ya es rojo: el borde de «sin gestionar» pasa a negro.
  const borde = sinGestionar ? (colorearPor === 'urgencia' ? '#1c2430' : '#c62828') : '#ffffff';
  return (
    <CircleMarker center={[r.lat, r.lng]} radius={8 + nivel * 3}
      pathOptions={{
        color: borde,
        weight: sinGestionar ? 3 : 2,
        fillColor: relleno,
        fillOpacity: r.estado === 'RESUELTO' ? 0.4 : 0.95,
      }}>
      <Popup>
        <strong>{CATEGORIAS[r.categoria].icono} {CATEGORIAS[r.categoria].nombre}</strong>
        <div style={{ margin: '6px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <ChipUrgencia reporte={r} /><ChipEstado estado={r.estado} />
        </div>
        {r.descripcion && <div>{r.descripcion}</div>}
        <div className="texto-suave">{formatearFecha(r.creadoEn)}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <Link to={`/reportes/${r.id}`}>Ver detalle →</Link>
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">
            Cómo llegar
          </a>
        </div>
      </Popup>
    </CircleMarker>
  );
}

function LimiteComuna({ comuna }: { comuna: Comuna }) {
  const geometria = useMemo(() => {
    try { return JSON.parse(comuna.geojson); } catch { return null; }
  }, [comuna.geojson]);
  if (!geometria) return null;
  return <GeoJSON key={comuna.id} data={geometria} interactive={false}
    style={{ color: '#1565c0', weight: 2, fillOpacity: 0.04, dashArray: '6 4' }} />;
}

const limites = (c: Comuna): [[number, number], [number, number]] => [[c.minLat, c.minLng], [c.maxLat, c.maxLng]];
