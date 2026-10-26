import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChipEstado, EtiquetaCategoria, formatearFecha, Miniatura } from '../componentes/Chips';
import { agruparPorReporte, cerrarReporteDenunciado, descartarDenuncias, useDenuncias } from '../datos/denuncias';
import { useReporte } from '../datos/reportes';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import { DECISIONES_DENUNCIA, MOTIVOS_DENUNCIA, type Denuncia, type MotivoDenuncia } from '../tipos';

const pendiente = (d: Denuncia) => !d.decision;

/** Reportes denunciados por vecinos desde la app, agrupados por reporte. */
export function Denuncias() {
  const { comunaId } = useSesion();
  const [verRevisadas, setVerRevisadas] = useState(false);
  const { datos: denuncias, cargando, error } = useDenuncias(comunaId);

  const grupos = [...agruparPorReporte(denuncias)]
    .map(([reporteId, lista]) => ({ reporteId, lista, pendientes: lista.filter(pendiente) }))
    .filter((g) => verRevisadas || g.pendientes.length > 0)
    // Primero los que tienen más denuncias pendientes.
    .sort((a, b) => b.pendientes.length - a.pendientes.length);
  const totalPendientes = denuncias.filter(pendiente).length;

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>Denuncias</h1>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={verRevisadas} onChange={(e) => setVerRevisadas(e.target.checked)} />
          Ver también revisadas
        </label>
      </div>
      <p className="texto-suave">
        {cargando
          ? 'Cargando…'
          : `${totalPendientes} denuncias pendientes. Revisa cada reporte: si es legítimo, descarta la denuncia; ` +
            'si es falso u ofensivo, ciérralo para que deje de verse en el mapa de los vecinos.'}
      </p>
      {error && <p className="error">{error}</p>}

      {!cargando && !error && grupos.length === 0 ? (
        <div className="vacio tarjeta">
          <h2>Sin denuncias pendientes 🎉</h2>
          <p>Cuando un vecino denuncie un reporte desde la app, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="tabla-contenedor tarjeta" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Reporte</th>
                <th>Motivos</th>
                <th>Última denuncia</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => <FilaDenuncia key={g.reporteId} reporteId={g.reporteId} lista={g.lista} pendientes={g.pendientes} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaDenuncia({ reporteId, lista, pendientes }: { reporteId: string; lista: Denuncia[]; pendientes: Denuncia[] }) {
  const yo = useFuncionario();
  const { datos: reporte, cargando } = useReporte(reporteId);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conteo = new Map<MotivoDenuncia, number>();
  for (const d of lista) conteo.set(d.motivo, (conteo.get(d.motivo) ?? 0) + 1);
  const ultima = lista.reduce<Date | undefined>((max, d) => (d.creadoEn && (!max || d.creadoEn > max) ? d.creadoEn : max), undefined);

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
    } catch {
      setError('No se pudo guardar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <tr>
      <td>{reporte && <Miniatura reporte={reporte} />}</td>
      <td>
        {cargando ? <span className="texto-suave">Cargando…</span> : reporte ? (
          <>
            <EtiquetaCategoria categoria={reporte.categoria} />
            <div className="texto-suave" style={{ fontSize: '0.85rem' }}>
              {reporte.descripcion || 'Sin descripción'}
            </div>
          </>
        ) : <span className="texto-suave">Reporte no disponible</span>}
      </td>
      <td>
        {[...conteo].map(([motivo, n]) => (
          <div key={motivo}>🚩 {MOTIVOS_DENUNCIA[motivo]}{n > 1 ? ` ×${n}` : ''}</div>
        ))}
        {pendientes.length === 0 && lista[0]?.decision && (
          <div className="texto-suave" style={{ fontSize: '0.85rem' }}>✔ {DECISIONES_DENUNCIA[lista[0].decision]}</div>
        )}
      </td>
      <td>{formatearFecha(ultima)}</td>
      <td>{reporte && <ChipEstado estado={reporte.estado} />}</td>
      <td>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link className="boton pequeno" to={`/reportes/${reporteId}`}>Ver</Link>
          {pendientes.length > 0 && (
            <>
              <button className="boton pequeno" disabled={ocupado}
                onClick={() => void ejecutar(() => descartarDenuncias(pendientes, yo))}>
                Descartar
              </button>
              {reporte && (
                <button className="boton pequeno peligro" disabled={ocupado}
                  onClick={() => void ejecutar(() => cerrarReporteDenunciado(reporte, pendientes, '', yo))}>
                  Cerrar reporte
                </button>
              )}
            </>
          )}
        </div>
        {error && <p className="error" style={{ marginTop: 6 }}>{error}</p>}
      </td>
    </tr>
  );
}
