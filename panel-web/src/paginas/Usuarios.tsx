import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { formatearFecha } from '../componentes/Chips';
import { aInvitacion } from '../datos/conversores';
import { useFuncionarios } from '../datos/reportes';
import { db } from '../firebase';
import { useFuncionario, useSesion } from '../sesion/SesionContext';
import { ROLES, type Funcionario, type Invitacion, type Rol } from '../tipos';

/** Roles que se pueden asignar desde el panel (SUPERADMIN solo se crea a mano en la consola). */
export const ROLES_INVITABLES: Exclude<Rol, 'SUPERADMIN'>[] = ['ADMIN', 'OPERADOR', 'CUADRILLA', 'VISOR'];

export function Usuarios() {
  const { comunaId, comunas } = useSesion();
  const yo = useFuncionario();
  const funcionarios = useFuncionarios(comunaId);
  const invitaciones = useInvitaciones(comunaId);
  const comuna = comunas.find((c) => c.id === comunaId);

  return (
    <div className="pagina">
      <div className="encabezado-pagina">
        <h1>Usuarios {comuna && <span className="texto-suave">· {comuna.nombre}</span>}</h1>
      </div>

      <div className="rejilla dos" style={{ alignItems: 'start' }}>
        <FormularioInvitacion comunaId={comunaId!} nombreComuna={comuna?.nombre ?? ''} />
        <div className="tarjeta">
          <h2>Roles</h2>
          <dl className="datos-reporte">
            {ROLES_INVITABLES.map((r) => (
              <FragmentoRol key={r} rol={r} />
            ))}
          </dl>
        </div>
      </div>

      {invitaciones.length > 0 && (
        <div className="tarjeta" style={{ marginTop: 16 }}>
          <h2>Invitaciones pendientes</h2>
          <div className="tabla-contenedor">
            <table>
              <thead><tr><th>Correo</th><th>Rol</th><th>Enviada</th><th></th></tr></thead>
              <tbody>
                {invitaciones.map((i) => (
                  <tr key={i.email}>
                    <td>{i.email}</td>
                    <td>{ROLES[i.rol].nombre}</td>
                    <td>{formatearFecha(i.creadoEn)}</td>
                    <td>
                      <button className="boton pequeno peligro"
                        onClick={() => deleteDoc(doc(db, 'invitaciones', i.email))}>Anular</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2>Funcionarios</h2>
        {funcionarios.length === 0 ? (
          <p className="texto-suave">Todavía no hay funcionarios en esta comuna. Invita al primero arriba.</p>
        ) : (
          <div className="tabla-contenedor">
            <table>
              <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {funcionarios.map((f) => <FilaFuncionario key={f.uid} f={f} esYo={f.uid === yo.uid} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentoRol({ rol }: { rol: Rol }) {
  return (
    <>
      <dt><strong>{ROLES[rol].nombre}</strong></dt>
      <dd>{ROLES[rol].descripcion}</dd>
    </>
  );
}

function FilaFuncionario({ f, esYo }: { f: Funcionario; esYo: boolean }) {
  const [error, setError] = useState(false);
  const actualizar = (cambios: Partial<Pick<Funcionario, 'rol' | 'activo'>>) =>
    updateDoc(doc(db, 'funcionarios', f.uid), cambios).then(() => setError(false), () => setError(true));

  return (
    <tr style={f.activo ? undefined : { opacity: 0.55 }}>
      <td>{f.nombre || '—'}{esYo && <span className="texto-suave"> (tú)</span>}</td>
      <td>{f.email}</td>
      <td>
        {esYo || f.rol === 'SUPERADMIN' ? ROLES[f.rol].nombre : (
          <select value={f.rol} onChange={(e) => actualizar({ rol: e.target.value as Rol })}>
            {ROLES_INVITABLES.map((r) => <option key={r} value={r}>{ROLES[r].nombre}</option>)}
          </select>
        )}
      </td>
      <td>{f.activo ? 'Activo' : 'Desactivado'}</td>
      <td>
        {!esYo && f.rol !== 'SUPERADMIN' && (
          <button className={`boton pequeno${f.activo ? ' peligro' : ''}`}
            onClick={() => actualizar({ activo: !f.activo })}>
            {f.activo ? 'Desactivar' : 'Reactivar'}
          </button>
        )}
        {error && <span className="error" style={{ marginLeft: 8 }}>Sin permiso</span>}
      </td>
    </tr>
  );
}

function FormularioInvitacion({ comunaId, nombreComuna }: { comunaId: string; nombreComuna: string }) {
  const yo = useFuncionario();
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Exclude<Rol, 'SUPERADMIN'>>('OPERADOR');
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function invitar(e: FormEvent) {
    e.preventDefault();
    const correo = email.trim().toLowerCase();
    setEstado(null);
    setMensaje(null);
    try {
      if ((await getDoc(doc(db, 'invitaciones', correo))).exists()) {
        setEstado({ tipo: 'error', texto: 'Ese correo ya tiene una invitación pendiente.' });
        return;
      }
    } catch {
      // Sin permiso para leer una invitación de otra comuna: se intentará crear igual.
    }
    try {
      await setDoc(doc(db, 'invitaciones', correo), {
        email: correo, comunaId, rol, invitadoPor: yo.uid, creadoEn: serverTimestamp(),
      });
      setEstado({ tipo: 'ok', texto: `Invitación creada para ${correo}.` });
      setMensaje(
        `Hola, te invité al panel de Reporte Vecinal de ${nombreComuna} como ${ROLES[rol].nombre}.\n` +
        `1) Entra a ${window.location.origin}\n` +
        `2) Toca «¿Te invitaron? Crea tu cuenta» y regístrate con este correo: ${correo}\n` +
        `3) Verifica tu correo con el enlace que te llegará y acepta la invitación.`,
      );
      setEmail('');
    } catch {
      setEstado({ tipo: 'error', texto: 'No se pudo crear la invitación (¿el correo ya pertenece a otra comuna?).' });
    }
  }

  return (
    <div className="tarjeta">
      <h2>Invitar funcionario</h2>
      <form className="formulario" onSubmit={invitar} style={{ marginTop: 0 }}>
        <label>
          Correo
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="nombre@municipalidad.cl" />
        </label>
        <label>
          Rol
          <select value={rol} onChange={(e) => setRol(e.target.value as Exclude<Rol, 'SUPERADMIN'>)}>
            {ROLES_INVITABLES.map((r) => <option key={r} value={r}>{ROLES[r].nombre}</option>)}
          </select>
        </label>
        <button className="boton primario">Crear invitación</button>
      </form>
      {estado && <p className={estado.tipo === 'ok' ? 'aviso' : 'error'}>{estado.texto}</p>}
      {mensaje && (
        <div style={{ marginTop: 10 }}>
          <p className="texto-suave" style={{ fontSize: '0.85rem' }}>
            El panel no envía correos: copia este mensaje y mándaselo por correo o WhatsApp.
          </p>
          <textarea readOnly rows={5} value={mensaje} style={{ width: '100%' }} />
          <button className="boton pequeno" onClick={() => navigator.clipboard?.writeText(mensaje)}>Copiar mensaje</button>
        </div>
      )}
    </div>
  );
}

function useInvitaciones(comunaId: string | null): Invitacion[] {
  const [lista, setLista] = useState<Invitacion[]>([]);
  useEffect(() => {
    if (!comunaId) return;
    return onSnapshot(
      query(collection(db, 'invitaciones'), where('comunaId', '==', comunaId)),
      (snap) => setLista(snap.docs.map(aInvitacion)),
      () => setLista([]),
    );
  }, [comunaId]);
  return lista;
}
