import { useMemo, useState, type FormEvent } from 'react';
import { Circle, GeoJSON, MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { formatearFecha } from '../componentes/Chips';
import { enviarAviso, useAvisos, type Sector } from '../datos/avisos';
import { useFuncionarios } from '../datos/reportes';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import { puedeGestionar, type Comuna } from '../tipos';

const RADIOS = [300, 500, 1000, 2000, 5000];
const MAXIMO_TITULO = 80;
const MAXIMO_MENSAJE = 300;

const EJEMPLOS = [
  { titulo: 'Evite calle X', mensaje: 'Calle anegada entre A y B. Use rutas alternativas.' },
  { titulo: 'Albergue habilitado', mensaje: 'Albergue abierto en la sede vecinal Y, con abrigo y comida.' },
  { titulo: 'Corte de agua', mensaje: 'Camión aljibe en la plaza Z desde las 15:00.' },
];

/** Avisos push a los vecinos de toda la comuna o de un sector marcado en el mapa. */
export function Avisos() {
  const { comunaId, comunas } = useSesion();
  const yo = useFuncionario();
  const comuna = comunas.find((c) => c.id === comunaId);
  const { datos: avisos, error: errorLista } = useAvisos(comunaId);
  const funcionarios = useFuncionarios(comunaId);
  const nombreDe = useMemo(() => new Map(funcionarios.map((f) => [f.uid, f.nombre || f.email])), [funcionarios]);

  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [porSector, setPorSector] = useState(false);
  const [sector, setSector] = useState<Sector | null>(null);
  const [radio, setRadio] = useState(500);
  const [nombreSector, setNombreSector] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const puedeEnviar = puedeGestionar(yo.rol);
  const listo = titulo.trim() && mensaje.trim() && (!porSector || sector) && !enviando;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!comunaId || !listo) return;
    const destino = porSector && sector ? { ...sector, radioMetros: radio, nombre: nombreSector } : null;
    if (!confirm(`¿Enviar «${titulo.trim()}» a ${destino ? `los vecinos del sector${nombreSector ? ` ${nombreSector}` : ''}` : 'toda la comuna'}?`)) return;
    setEnviando(true);
    setError(null);
    try {
      await enviarAviso(comunaId, titulo, mensaje, destino, yo);
      setAviso('Aviso enviado. Les llega a los vecinos de la comuna que tienen la app.');
      setTitulo('');
      setMensaje('');
    } catch {
      setError('No se pudo enviar el aviso. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>📢 Avisos a los vecinos</h1>
      </div>

      {puedeEnviar && (
        <form className="tarjeta" onSubmit={(e) => void enviar(e)}>
          <h2 style={{ marginTop: 0 }}>Nuevo aviso</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {EJEMPLOS.map((ej) => (
              <button key={ej.titulo} type="button" className="boton pequeno"
                onClick={() => { setTitulo(ej.titulo); setMensaje(ej.mensaje); }}>
                {ej.titulo}
              </button>
            ))}
          </div>
          <label className="campo">
            Título
            <input value={titulo} maxLength={MAXIMO_TITULO} onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Evite calle X" />
          </label>
          <label className="campo" style={{ marginTop: 10 }}>
            Mensaje ({mensaje.length}/{MAXIMO_MENSAJE})
            <textarea rows={3} value={mensaje} maxLength={MAXIMO_MENSAJE} onChange={(e) => setMensaje(e.target.value)}
              placeholder="Ej: Albergue habilitado en la sede vecinal Y" />
          </label>

          <div style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" checked={!porSector} onChange={() => setPorSector(false)} /> Toda la comuna
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="radio" checked={porSector} onChange={() => setPorSector(true)} /> Un sector
            </label>
          </div>

          {porSector && comuna && (
            <>
              <div className="filtros">
                <label className="campo">
                  Radio
                  <select value={radio} onChange={(e) => setRadio(Number(e.target.value))}>
                    {RADIOS.map((r) => <option key={r} value={r}>{r < 1000 ? `${r} m` : `${r / 1000} km`}</option>)}
                  </select>
                </label>
                <label className="campo">
                  Nombre del sector (opcional)
                  <input value={nombreSector} maxLength={80} onChange={(e) => setNombreSector(e.target.value)}
                    placeholder="Ej: Villa Sur" />
                </label>
              </div>
              <p className="texto-suave" style={{ margin: '0 0 8px' }}>
                {sector ? 'Haz clic en otro punto para mover el sector.' : 'Haz clic en el mapa para marcar el centro del sector.'}
              </p>
              <div className="mapa-mini" style={{ height: 320 }}>
                <MapContainer key={comuna.id} bounds={limites(comuna)} style={{ height: '100%' }}>
                  <TileLayer attribution='&copy; OpenStreetMap' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <LimiteComuna comuna={comuna} />
                  <ElegirCentro onElegir={(lat, lng) => setSector({ nombre: '', lat, lng, radioMetros: radio })} />
                  {sector && <Circle center={[sector.lat, sector.lng]} radius={radio}
                    pathOptions={{ color: '#c62828', fillColor: '#c62828', fillOpacity: 0.15 }} />}
                </MapContainer>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
            <button className="boton primario" disabled={!listo}>{enviando ? 'Enviando…' : '📢 Enviar aviso'}</button>
            {aviso && <span style={{ color: 'var(--verde)' }}>{aviso}</span>}
          </div>
          {error && <p className="error">{error}</p>}
          <p className="texto-suave" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
            El aviso le llega como notificación a los vecinos de la comuna que tienen la app (si es para un sector, solo a
            los que estaban dentro del círculo la última vez que la usaron).
          </p>
        </form>
      )}

      <h2>Enviados</h2>
      {errorLista && <p className="error">{errorLista}</p>}
      {avisos.length === 0 && !errorLista ? (
        <div className="vacio tarjeta"><p>Todavía no se han enviado avisos en esta comuna.</p></div>
      ) : (
        <div className="tabla-contenedor tarjeta" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Fecha</th><th>Aviso</th><th>Destino</th><th>Enviado por</th><th title="Lo marca la Cloud Function">Push</th></tr>
            </thead>
            <tbody>
              {avisos.map((a) => (
                <tr key={a.id}>
                  <td>{formatearFecha(a.creadoEn)}</td>
                  <td><strong>{a.titulo}</strong><div className="texto-suave">{a.mensaje}</div></td>
                  <td>{a.sector
                    ? `Sector${a.sector.nombre ? ` ${a.sector.nombre}` : ''} (${a.sector.radioMetros < 1000 ? `${a.sector.radioMetros} m` : `${a.sector.radioMetros / 1000} km`})`
                    : 'Toda la comuna'}</td>
                  <td>{nombreDe.get(a.creadoPor) ?? '—'}</td>
                  <td>{a.enviadoEn ? '✅' : <span className="texto-suave" title="Solo con la app abierta hasta desplegar enviarAviso">App abierta</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ElegirCentro({ onElegir }: { onElegir: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onElegir(e.latlng.lat, e.latlng.lng) });
  return null;
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
