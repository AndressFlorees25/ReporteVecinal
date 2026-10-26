import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChipEstado, ChipUrgencia, EtiquetaCategoria, formatearFecha, Miniatura } from '../componentes/Chips';
import { descargarExcel } from '../datos/exportar';
import { useFuncionarios, useReportes, type FiltrosReportes } from '../datos/reportes';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import { CATEGORIAS, ESTADOS, type Categoria, type Estado } from '../tipos';

export function Reportes() {
  const yo = useFuncionario();
  return yo.rol === 'CUADRILLA' ? <MisTrabajos /> : <TodosLosReportes />;
}

function TodosLosReportes() {
  const { comunaId } = useSesion();
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState<FiltrosReportes>({});
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState<'recientes' | 'apoyos'>('recientes');
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<string | null>(null);
  const { comunas } = useSesion();

  async function exportar() {
    if (!comunaId) return;
    setExportando(true);
    setErrorExportar(null);
    try {
      const nombre = comunas.find((c) => c.id === comunaId)?.nombre ?? comunaId;
      await descargarExcel(comunaId, nombre, filtros, buscar, funcionarios);
    } catch {
      setErrorExportar('No se pudo preparar el archivo. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setExportando(false);
    }
  }

  const { datos: reportes, cargando, error } = useReportes(comunaId, filtros);
  const funcionarios = useFuncionarios(comunaId);
  const nombreDe = useMemo(
    () => new Map(funcionarios.map((f) => [f.uid, f.nombre || f.email])),
    [funcionarios],
  );

  const texto = buscar.trim().toLowerCase();
  const filtrados = texto
    ? reportes.filter((r) => r.descripcion.toLowerCase().includes(texto) || r.id.toLowerCase().includes(texto))
    : reportes;
  // El orden por apoyos es local (la consulta ya viene por fecha), así no hacen falta más índices.
  const visibles = orden === 'apoyos' ? [...filtrados].sort((a, b) => b.apoyos - a.apoyos) : filtrados;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>Reportes</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className="texto-suave">{cargando ? 'Cargando…' : `${visibles.length} reportes`}</span>
          <button className="boton" disabled={exportando || !comunaId} onClick={() => void exportar()}
            title="Descarga todos los reportes que cumplen los filtros, en un archivo que se abre con Excel">
            {exportando ? 'Preparando…' : '⬇️ Descargar Excel'}
          </button>
        </div>
      </div>
      {errorExportar && <p className="error" style={{ marginBottom: 12 }}>{errorExportar}</p>}

      <div className="filtros">
        <label className="campo">
          Estado
          <select value={filtros.estado ?? ''}
            onChange={(e) => setFiltros({ ...filtros, estado: e.target.value as Estado | '' })}>
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </label>
        <label className="campo">
          Categoría
          <select value={filtros.categoria ?? ''}
            onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value as Categoria | '' })}>
            <option value="">Todas</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </label>
        <label className="campo">
          Ordenar por
          <select value={orden} onChange={(e) => setOrden(e.target.value as 'recientes' | 'apoyos')}>
            <option value="recientes">Más recientes</option>
            <option value="apoyos">Más vecinos afectados</option>
          </select>
        </label>
        <label className="campo">
          Buscar en la descripción
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Ej: paradero" />
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {!cargando && !error && visibles.length === 0 ? (
        <div className="vacio tarjeta">
          <h2>No hay reportes</h2>
          <p>Cuando los vecinos reporten problemas en la comuna, aparecerán aquí.</p>
        </div>
      ) : (
        <div className="tabla-contenedor tarjeta" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Categoría</th>
                <th>Descripción</th>
                <th>Fecha</th>
                <th title="Vecinos que marcaron «A mí también me afecta»">Afectados</th>
                <th>Asignado a</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => (
                <tr key={r.id} className="clicable" onClick={() => navegar(`/reportes/${r.id}`)}>
                  <td><Miniatura reporte={r} /></td>
                  <td><EtiquetaCategoria categoria={r.categoria} /> <ChipUrgencia reporte={r} /></td>
                  <td>{r.descripcion || <span className="texto-suave">Sin descripción</span>}</td>
                  <td>{formatearFecha(r.creadoEn)}</td>
                  <td>{r.apoyos > 0 ? <strong>👍 {r.apoyos + 1}</strong> : <span className="texto-suave">1</span>}</td>
                  <td>{r.asignadoA ? nombreDe.get(r.asignadoA) ?? '—' : <span className="texto-suave">Sin asignar</span>}</td>
                  <td><ChipEstado estado={r.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Vista de la cuadrilla: tarjetas grandes (pensadas para el celular) con sus reportes asignados.
 * Los pendientes van primero; el filtro es local para no requerir más índices en Firestore.
 */
function MisTrabajos() {
  const { comunaId } = useSesion();
  const yo = useFuncionario();
  const [verResueltos, setVerResueltos] = useState(false);
  const { datos: reportes, cargando, error } = useReportes(comunaId, { asignadoA: yo.uid });
  const pendientes = reportes.filter((r) => r.estado !== 'RESUELTO');
  const visibles = verResueltos ? reportes : pendientes;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>Mis trabajos</h1>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={verResueltos} onChange={(e) => setVerResueltos(e.target.checked)} />
          Ver también resueltos
        </label>
      </div>
      <p className="texto-suave">
        {cargando ? 'Cargando…' : `${pendientes.length} pendientes asignados a ti.`}
      </p>
      {error && <p className="error">{error}</p>}
      {!cargando && visibles.length === 0 && (
        <div className="vacio tarjeta">
          <h2>Sin trabajos pendientes 🎉</h2>
          <p>Cuando un operador te asigne un reporte, aparecerá aquí.</p>
        </div>
      )}
      <div className="lista-trabajos">
        {visibles.map((r) => (
          <div key={r.id} className="tarjeta trabajo">
            <div className="trabajo-cabecera">
              <span><EtiquetaCategoria categoria={r.categoria} /> <ChipUrgencia reporte={r} /></span>
              <ChipEstado estado={r.estado} />
            </div>
            <p style={{ margin: '8px 0' }}>{r.descripcion || <span className="texto-suave">Sin descripción</span>}</p>
            <p className="texto-suave" style={{ margin: 0, fontSize: '0.85rem' }}>Reportado el {formatearFecha(r.creadoEn)}</p>
            <div className="trabajo-acciones">
              <a className="boton" href={`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`}
                target="_blank" rel="noreferrer">🧭 Cómo llegar</a>
              <Link className="boton primario" to={`/reportes/${r.id}`}>Ver y cerrar</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
