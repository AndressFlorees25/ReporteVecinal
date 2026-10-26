import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChipEstado, ChipUrgencia, EtiquetaCategoria, formatearFecha, Miniatura } from '../componentes/Chips';
import { cambiarEstado, guardarEmergencia, useEmergencia, useReportes } from '../datos/reportes';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import {
  CATEGORIAS, CATEGORIAS_EMERGENCIA, ESTADOS, puedeGestionar, urgencia, type Categoria, type Estado, type Reporte,
} from '../tipos';

const MAXIMO_AVISO = 300;

/**
 * Vista de emergencias (tormentas, lluvias fuertes, cortes de servicios): activar el Modo Emergencia
 * con su aviso, y los reportes de emergencia ordenados por urgencia y fecha para despachar cuadrillas.
 */
export function Emergencias() {
  const { comunaId } = useSesion();
  const yo = useFuncionario();
  const navegar = useNavigate();
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [verResueltos, setVerResueltos] = useState(false);
  const { datos: reportes, cargando, error } = useReportes(
    comunaId, categoria ? { categoria } : { categorias: CATEGORIAS_EMERGENCIA });
  const gestiona = puedeGestionar(yo.rol);

  const visibles = reportes
    .filter((r) => verResueltos || r.estado !== 'RESUELTO')
    .sort((a, b) => urgencia(b) - urgencia(a) || (b.creadoEn?.getTime() ?? 0) - (a.creadoEn?.getTime() ?? 0));
  const enRiesgo = visibles.filter((r) => r.personasEnRiesgo && r.estado !== 'RESUELTO').length;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>🚨 Emergencias</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="texto-suave">
            {cargando ? 'Cargando…' : `${visibles.length} reportes${enRiesgo ? ` · ${enRiesgo} con personas en riesgo` : ''}`}
          </span>
          <Link className="boton" to="/mapa?vista=emergencias">🗺️ Ver en el mapa</Link>
          {gestiona && <Link className="boton" to="/avisos">📢 Enviar aviso</Link>}
        </div>
      </div>

      <ModoEmergencia puedeEditar={gestiona} />

      <div className="filtros" style={{ marginTop: 16 }}>
        <label className="campo">
          Categoría
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria | '')}>
            <option value="">Todas las de emergencia</option>
            {CATEGORIAS_EMERGENCIA.map((c) => <option key={c} value={c}>{CATEGORIAS[c].nombre}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
          <input type="checkbox" checked={verResueltos} onChange={(e) => setVerResueltos(e.target.checked)} />
          Ver también resueltos
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {!cargando && !error && visibles.length === 0 ? (
        <div className="vacio tarjeta">
          <h2>Sin reportes de emergencia</h2>
          <p>Los anegamientos, árboles caídos, cables cortados y cortes de servicios que reporten los vecinos aparecerán aquí.</p>
        </div>
      ) : (
        <div className="tabla-contenedor tarjeta" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Urgencia</th>
                <th>Categoría</th>
                <th>Descripción</th>
                <th>Fecha</th>
                <th title="Recibido = pendiente · Asignado = en atención">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id} className="clicable" onClick={() => navegar(`/reportes/${r.id}`)}>
                  <td><Miniatura reporte={r} /></td>
                  <td><ChipUrgencia reporte={r} />{urgencia(r) === 0 && <span className="texto-suave">—</span>}</td>
                  <td><EtiquetaCategoria categoria={r.categoria} /></td>
                  <td>{r.descripcion || <span className="texto-suave">Sin descripción</span>}</td>
                  <td>{formatearFecha(r.creadoEn)}</td>
                  {/* El clic en el selector no debe abrir el detalle. */}
                  <td onClick={(e) => e.stopPropagation()}>
                    {gestiona ? <SelectorEstado reporte={r} /> : <ChipEstado estado={r.estado} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="texto-suave" style={{ fontSize: '0.85rem' }}>
        Estados: Recibido = pendiente · Asignado = en atención · Resuelto. Cada cambio queda en el historial del reporte.
      </p>
    </div>
  );
}

function SelectorEstado({ reporte }: { reporte: Reporte }) {
  const yo = useFuncionario();
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState(false);

  async function cambiar(nuevo: Estado) {
    setOcupado(true);
    setFallo(false);
    try {
      await cambiarEstado(reporte, nuevo, yo);
    } catch {
      setFallo(true);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <select value={reporte.estado} disabled={ocupado} onChange={(e) => void cambiar(e.target.value as Estado)}
        style={{ borderLeft: `6px solid ${ESTADOS[reporte.estado].color}` }}>
        {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
      </select>
      {fallo && <div className="error" style={{ fontSize: '0.8rem' }}>No se pudo cambiar</div>}
    </>
  );
}

/** Interruptor del Modo Emergencia y aviso vigente que ven los vecinos en el banner rojo de la app. */
function ModoEmergencia({ puedeEditar }: { puedeEditar: boolean }) {
  const { comunaId, comunas } = useSesion();
  const yo = useFuncionario();
  const emergencia = useEmergencia(comunaId);
  const [borrador, setBorrador] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aviso = borrador ?? emergencia?.aviso ?? '';
  const activa = emergencia?.activa === true;

  async function guardar(nuevaActiva: boolean, e?: FormEvent) {
    e?.preventDefault();
    if (!comunaId) return;
    setOcupado(true);
    setError(null);
    try {
      const nombre = comunas.find((c) => c.id === comunaId)?.nombre ?? '';
      await guardarEmergencia(comunaId, nombre, nuevaActiva, aviso, yo);
      setBorrador(null);
    } catch {
      setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="tarjeta" onSubmit={(e) => void guardar(activa, e)}
      style={activa ? { borderColor: 'var(--rojo)', background: '#fdecea' } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Modo Emergencia: {activa ? <span style={{ color: 'var(--rojo)' }}>ACTIVO</span> : 'apagado'}</h2>
          <p className="texto-suave" style={{ margin: '4px 0 0' }}>
            {activa
              ? `Los vecinos ven el aviso en un banner rojo y las categorías de emergencia primero. Desde ${formatearFecha(emergencia?.actualizadoEn)}.`
              : 'Actívalo durante tormentas, lluvias fuertes o cortes de servicios.'}
          </p>
        </div>
        {puedeEditar && (
          <button type="button" className={`boton ${activa ? '' : 'peligro'}`} disabled={ocupado || !emergencia}
            onClick={() => void guardar(!activa)}>
            {activa ? 'Desactivar' : '🚨 Activar Modo Emergencia'}
          </button>
        )}
      </div>
      <label className="campo" style={{ marginTop: 12 }}>
        Aviso para los vecinos
        <textarea rows={2} maxLength={MAXIMO_AVISO} value={aviso} disabled={!puedeEditar}
          onChange={(e) => setBorrador(e.target.value)}
          placeholder="Ej: Evite el paso bajo nivel de Av. Santa Rosa. Albergue habilitado en la sede vecinal Y." />
      </label>
      {puedeEditar && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <button className="boton primario" disabled={ocupado || borrador === null || !emergencia}>Guardar aviso</button>
          <span className="texto-suave" style={{ fontSize: '0.85rem' }}>{aviso.length}/{MAXIMO_AVISO}</span>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </form>
  );
}
