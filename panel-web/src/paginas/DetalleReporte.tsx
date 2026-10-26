import { useState, type FormEvent } from 'react';
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet';
import { Link, useParams } from 'react-router-dom';
import { ChipEstado, ChipUrgencia, EtiquetaCategoria, formatearFecha, fotoEnLaNube } from '../componentes/Chips';
import { cerrarReporteDenunciado, descartarDenuncias, useDenunciasDeReporte } from '../datos/denuncias';
import { asignar, cambiarEstado, comentar, useFuncionarios, useHistorial, useReporte } from '../datos/reportes';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import {
  CATEGORIAS, DECISIONES_DENUNCIA, ESTADOS, MOTIVOS_DENUNCIA, puedeGestionar,
  type EntradaHistorial, type Estado, type Reporte,
} from '../tipos';

export function DetalleReporte() {
  const { id } = useParams();
  const { datos: reporte, cargando, error } = useReporte(id);
  const { comunaId } = useSesion();

  if (cargando) return <p className="texto-suave">Cargando…</p>;
  if (error || !reporte || reporte.comunaId !== comunaId) {
    return (
      <div className="vacio">
        <h2>Reporte no encontrado</h2>
        <p>{error ?? 'No existe o pertenece a otra comuna.'}</p>
        <Link className="boton" to="/reportes">Volver a reportes</Link>
      </div>
    );
  }
  return <Detalle reporte={reporte} />;
}

function Detalle({ reporte }: { reporte: Reporte }) {
  const yo = useFuncionario();
  const historial = useHistorial(reporte.id);

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <div>
          <Link to="/reportes" className="texto-suave">← Reportes</Link>
          <h1><EtiquetaCategoria categoria={reporte.categoria} /></h1>
        </div>
        <span style={{ display: 'flex', gap: 8 }}><ChipUrgencia reporte={reporte} /><ChipEstado estado={reporte.estado} /></span>
      </div>

      <div className="detalle">
        <div className="rejilla">
          {fotoEnLaNube(reporte) ? (
            <a href={reporte.fotoUrl} target="_blank" rel="noreferrer">
              <img className="foto-detalle" src={reporte.fotoUrl} alt="Foto del reporte" />
            </a>
          ) : (
            <div className="foto-ausente">
              <div>
                <div style={{ fontSize: '2.5rem' }}>{CATEGORIAS[reporte.categoria].icono}</div>
                La foto quedó solo en el teléfono del vecino.<br />
                Se verá aquí cuando se active el almacenamiento de fotos en la nube.
              </div>
            </div>
          )}

          <div className="tarjeta">
            <dl className="datos-reporte">
              <dt>Descripción</dt>
              <dd>{reporte.descripcion || <span className="texto-suave">Sin descripción</span>}</dd>
              <dt>Fecha</dt>
              <dd>{formatearFecha(reporte.creadoEn)}</dd>
              <dt>Vecinos afectados</dt>
              <dd>
                {reporte.apoyos + 1}{' '}
                <span className="texto-suave">
                  (quien reportó{reporte.apoyos > 0 ? ` + ${reporte.apoyos} que marcaron «A mí también me afecta»` : ''})
                </span>
              </dd>
              <dt>Última gestión</dt>
              <dd>{formatearFecha(reporte.actualizadoEn)}</dd>
              <dt>Ubicación</dt>
              <dd>
                {reporte.lat.toFixed(5)}, {reporte.lng.toFixed(5)} ·{' '}
                <a href={`https://www.google.com/maps?q=${reporte.lat},${reporte.lng}`} target="_blank" rel="noreferrer">
                  Abrir en Google Maps
                </a>
              </dd>
              <dt>Canal</dt>
              <dd>{reporte.origen === 'WHATSAPP' ? '💬 WhatsApp' : '📱 App'}</dd>
              <dt>N.º de reporte</dt>
              <dd><code>{reporte.id}</code></dd>
            </dl>
          </div>

          <div className="mapa-mini">
            <MapContainer center={[reporte.lat, reporte.lng]} zoom={16} style={{ height: '100%' }}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <CircleMarker center={[reporte.lat, reporte.lng]} radius={10}
                pathOptions={{ color: '#fff', weight: 2, fillColor: CATEGORIAS[reporte.categoria].color, fillOpacity: 1 }} />
            </MapContainer>
          </div>
        </div>

        <div className="rejilla" style={{ alignContent: 'start' }}>
          {puedeGestionar(yo.rol) && <TarjetaDenuncias reporte={reporte} />}
          {puedeGestionar(yo.rol) && <Gestion key={reporte.estado} reporte={reporte} />}
          {yo.rol === 'CUADRILLA' && reporte.asignadoA === yo.uid && reporte.estado !== 'RESUELTO' && (
            <MarcarResuelto reporte={reporte} />
          )}
          <Historial entradas={historial} reporte={reporte} puedeComentar={yo.rol !== 'VISOR'} />
        </div>
      </div>
    </div>
  );
}

function Gestion({ reporte }: { reporte: Reporte }) {
  const yo = useFuncionario();
  const { comunaId } = useSesion();
  const cuadrillas = useFuncionarios(comunaId).filter((f) => f.activo && f.rol === 'CUADRILLA');
  const [estado, setEstado] = useState<Estado>(reporte.estado);
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
    } catch {
      setError('No se pudo guardar. Revisa tu conexión o tus permisos.');
    } finally {
      setOcupado(false);
    }
  }

  async function guardarEstado(e: FormEvent) {
    e.preventDefault();
    if (estado === reporte.estado) return;
    await ejecutar(async () => {
      await cambiarEstado(reporte, estado, yo, comentario);
      setComentario('');
    });
  }

  return (
    <div className="tarjeta">
      <h2>Gestión</h2>
      <form className="formulario" onSubmit={guardarEstado} style={{ marginTop: 0 }}>
        <label>
          Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)}>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.nombre}</option>)}
          </select>
        </label>
        <label>
          Nota para el historial (opcional)
          <textarea rows={2} maxLength={500} value={comentario} onChange={(e) => setComentario(e.target.value)}
            placeholder="Ej: derivado a Dirección de Operaciones" />
        </label>
        <button className="boton primario" disabled={ocupado || estado === reporte.estado}>Guardar estado</button>
      </form>

      <label className="campo" style={{ marginTop: 8 }}>
        Asignar a cuadrilla
        <select value={reporte.asignadoA ?? ''} disabled={ocupado}
          onChange={(e) => {
            const elegido = cuadrillas.find((c) => c.uid === e.target.value) ?? null;
            void ejecutar(() => asignar(reporte, elegido, yo));
          }}>
          <option value="">Sin asignar</option>
          {cuadrillas.map((c) => <option key={c.uid} value={c.uid}>{c.nombre || c.email}</option>)}
        </select>
      </label>
      {cuadrillas.length === 0 && (
        <p className="texto-suave" style={{ fontSize: '0.85rem' }}>
          No hay cuadrillas en la comuna. El administrador puede invitarlas en «Usuarios».
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** Denuncias de vecinos sobre este reporte; solo aparece si tiene alguna. */
function TarjetaDenuncias({ reporte }: { reporte: Reporte }) {
  const yo = useFuncionario();
  const { comunaId } = useSesion();
  const denuncias = useDenunciasDeReporte(comunaId, reporte.id);
  const pendientes = denuncias.filter((d) => !d.decision);
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (denuncias.length === 0) return null;

  async function ejecutar(accion: () => Promise<void>) {
    setOcupado(true);
    setError(null);
    try {
      await accion();
      setNota('');
    } catch {
      setError('No se pudo guardar. Revisa tu conexión o tus permisos.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="tarjeta" style={pendientes.length > 0 ? { borderColor: '#f1c4c4' } : undefined}>
      <h2>🚩 Denuncias ({denuncias.length})</h2>
      <ul className="historial">
        {denuncias.map((d) => (
          <li key={d.id}>
            <div>{MOTIVOS_DENUNCIA[d.motivo]}</div>
            <div className="meta">
              {formatearFecha(d.creadoEn)} · {d.decision ? DECISIONES_DENUNCIA[d.decision] : 'Pendiente'}
            </div>
          </li>
        ))}
      </ul>
      {pendientes.length > 0 && (
        <div className="formulario" style={{ marginBottom: 0 }}>
          <label>
            Razón para cerrar (opcional, queda en el historial)
            <textarea rows={2} maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: la foto no corresponde a un problema en la vía pública" />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="boton" disabled={ocupado} onClick={() => void ejecutar(() => descartarDenuncias(pendientes, yo))}>
              Descartar: el reporte es válido
            </button>
            <button className="boton peligro" disabled={ocupado}
              onClick={() => void ejecutar(() => cerrarReporteDenunciado(reporte, pendientes, nota, yo))}>
              Cerrar reporte: no procede
            </button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function MarcarResuelto({ reporte }: { reporte: Reporte }) {
  const yo = useFuncionario();
  const [ocupado, setOcupado] = useState(false);
  return (
    <div className="tarjeta">
      <h2>Trabajo asignado</h2>
      <p className="texto-suave">Cuando el problema esté solucionado, márcalo como resuelto.</p>
      <button className="boton primario" disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          await cambiarEstado(reporte, 'RESUELTO', yo).finally(() => setOcupado(false));
        }}>
        Marcar como resuelto
      </button>
    </div>
  );
}

function Historial({ entradas, reporte, puedeComentar }: {
  entradas: EntradaHistorial[];
  reporte: Reporte;
  puedeComentar: boolean;
}) {
  const yo = useFuncionario();
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await comentar(reporte.id, texto, yo);
      setTexto('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="tarjeta">
      <h2>Historial</h2>
      {puedeComentar && (
        <form className="formulario" onSubmit={enviar} style={{ marginTop: 0 }}>
          <textarea rows={2} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)}
            placeholder="Agregar un comentario interno" />
          <button className="boton" disabled={enviando || !texto.trim()}>Comentar</button>
        </form>
      )}
      <ul className="historial">
        {entradas.map((h) => (
          <li key={h.id}>
            <div>{describir(h)}</div>
            {h.texto && h.tipo !== 'COMENTARIO' && <div className="texto-suave">«{h.texto}»</div>}
            <div className="meta">{h.autorNombre} · {formatearFecha(h.fecha)}</div>
          </li>
        ))}
        <li>
          <div>Reporte recibido {reporte.origen === 'WHATSAPP' ? 'por WhatsApp' : 'desde la app'}</div>
          <div className="meta">Vecino · {formatearFecha(reporte.creadoEn)}</div>
        </li>
      </ul>
    </div>
  );
}

function describir(h: EntradaHistorial) {
  switch (h.tipo) {
    case 'ESTADO':
      return <>Estado: {ESTADOS[h.de as Estado]?.nombre ?? h.de} → <strong>{ESTADOS[h.a as Estado]?.nombre ?? h.a}</strong></>;
    case 'ASIGNACION':
      return h.a ? <>Asignado a <strong>{h.a}</strong></> : <>Se quitó la asignación</>;
    case 'COMENTARIO':
      return <>💬 {h.texto}</>;
  }
}
