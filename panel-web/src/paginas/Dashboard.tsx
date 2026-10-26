import { Link } from 'react-router-dom';
import { ChipEstado, EtiquetaCategoria, formatearFecha } from '../componentes/Chips';
import { useReportes } from '../datos/reportes';
import { useSesion } from '../sesion/SesionContext';
import { CATEGORIAS, ESTADOS, type Categoria, type Estado, type Reporte } from '../tipos';

const DIA = 24 * 60 * 60 * 1000;

export function Dashboard() {
  const { comunaId, comunas } = useSesion();
  const comuna = comunas.find((c) => c.id === comunaId);
  // Las métricas se calculan sobre los últimos 500 reportes de la comuna.
  const { datos: reportes, cargando, error } = useReportes(comunaId, {}, 500);
  const m = calcularMetricas(reportes);

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>Dashboard {comuna && <span className="texto-suave">· {comuna.nombre}</span>}</h1>
        {cargando && <span className="texto-suave">Cargando…</span>}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="rejilla kpis">
        <Kpi valor={m.total} etiqueta="Reportes totales" />
        <Kpi valor={m.porEstado.RECIBIDO} etiqueta="Sin gestionar (recibidos)" color={ESTADOS.RECIBIDO.color} />
        <Kpi valor={m.porEstado.ASIGNADO} etiqueta="En curso (asignados)" color={ESTADOS.ASIGNADO.color} />
        <Kpi valor={m.porEstado.RESUELTO} etiqueta="Resueltos" color={ESTADOS.RESUELTO.color} />
        <Kpi valor={m.total ? `${Math.round((m.porEstado.RESUELTO / m.total) * 100)} %` : '—'} etiqueta="Tasa de resolución" />
        <Kpi valor={m.diasPromedio !== null ? `${m.diasPromedio.toFixed(1)} días` : '—'} etiqueta="Tiempo promedio de resolución" />
        <Kpi valor={m.ultimos7} etiqueta="Nuevos en los últimos 7 días" />
      </div>

      <div className="rejilla dos" style={{ marginTop: 16 }}>
        <div className="tarjeta">
          <h2>Por categoría</h2>
          <Barras filas={(Object.keys(CATEGORIAS) as Categoria[]).map((c) => ({
            etiqueta: `${CATEGORIAS[c].icono} ${CATEGORIAS[c].nombre}`, valor: m.porCategoria[c], color: CATEGORIAS[c].color,
          }))} />
        </div>
        <div className="tarjeta">
          <h2>Por estado</h2>
          <Barras filas={(Object.keys(ESTADOS) as Estado[]).map((e) => ({
            etiqueta: ESTADOS[e].nombre, valor: m.porEstado[e], color: ESTADOS[e].color,
          }))} />
        </div>
      </div>

      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2>Pendientes más antiguos</h2>
        {m.pendientesAntiguos.length === 0 ? (
          <p className="texto-suave">No hay reportes pendientes. 🎉</p>
        ) : (
          <div className="tabla-contenedor">
            <table>
              <tbody>
                {m.pendientesAntiguos.map((r) => (
                  <tr key={r.id}>
                    <td><EtiquetaCategoria categoria={r.categoria} /></td>
                    <td>{r.descripcion || <span className="texto-suave">Sin descripción</span>}</td>
                    <td>{formatearFecha(r.creadoEn)}</td>
                    <td><ChipEstado estado={r.estado} /></td>
                    <td><Link to={`/reportes/${r.id}`}>Ver</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="texto-suave" style={{ fontSize: '0.85rem' }}>
        El tiempo de resolución se mide desde que llega el reporte hasta su última gestión estando resuelto.
      </p>
    </div>
  );
}

function Kpi({ valor, etiqueta, color }: { valor: number | string; etiqueta: string; color?: string }) {
  return (
    <div className="tarjeta kpi" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
      <div className="valor">{valor}</div>
      <div className="etiqueta">{etiqueta}</div>
    </div>
  );
}

function Barras({ filas }: { filas: { etiqueta: string; valor: number; color: string }[] }) {
  const maximo = Math.max(1, ...filas.map((f) => f.valor));
  return (
    <div className="barras">
      {filas.map((f) => (
        <div className="barra-fila" key={f.etiqueta}>
          <span>{f.etiqueta}</span>
          <div className="barra-fondo">
            <div className="barra-relleno" style={{ width: `${(f.valor / maximo) * 100}%`, background: f.color }} />
          </div>
          <strong>{f.valor}</strong>
        </div>
      ))}
    </div>
  );
}

function calcularMetricas(reportes: Reporte[]) {
  const porEstado: Record<Estado, number> = { RECIBIDO: 0, ASIGNADO: 0, RESUELTO: 0 };
  const porCategoria = Object.fromEntries(Object.keys(CATEGORIAS).map((c) => [c, 0])) as Record<Categoria, number>;
  const duraciones: number[] = [];
  const ahora = Date.now();
  let ultimos7 = 0;

  for (const r of reportes) {
    porEstado[r.estado]++;
    porCategoria[r.categoria]++;
    if (r.creadoEn && ahora - r.creadoEn.getTime() <= 7 * DIA) ultimos7++;
    if (r.estado === 'RESUELTO' && r.creadoEn && r.actualizadoEn) {
      duraciones.push((r.actualizadoEn.getTime() - r.creadoEn.getTime()) / DIA);
    }
  }

  const pendientesAntiguos = reportes
    .filter((r) => r.estado !== 'RESUELTO')
    .sort((a, b) => (a.creadoEn?.getTime() ?? 0) - (b.creadoEn?.getTime() ?? 0))
    .slice(0, 5);

  return {
    total: reportes.length,
    porEstado,
    porCategoria,
    ultimos7,
    diasPromedio: duraciones.length ? duraciones.reduce((a, b) => a + b, 0) / duraciones.length : null,
    pendientesAntiguos,
  };
}
