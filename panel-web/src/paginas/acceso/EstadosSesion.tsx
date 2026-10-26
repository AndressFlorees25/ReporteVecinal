import { sendEmailVerification, signOut, type User } from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { auth, db } from '../../firebase';
import { useSesion } from '../../sesion/SesionContext';
import { ROLES, type Invitacion } from '../../tipos';
import { PantallaAcceso } from './PantallaAcceso';

export function VerificarCorreo({ usuario }: { usuario: User }) {
  const { recargar } = useSesion();
  const [aviso, setAviso] = useState<string | null>(null);

  async function reenviar() {
    try {
      await sendEmailVerification(usuario);
      setAviso('Te enviamos un nuevo correo. Revisa también la carpeta de spam.');
    } catch {
      setAviso('Espera un momento antes de pedir otro correo.');
    }
  }

  async function yaVerifique() {
    await recargar();
    if (!auth.currentUser?.emailVerified) setAviso('Todavía no aparece verificado. Abre el enlace del correo.');
  }

  return (
    <PantallaAcceso titulo="Verifica tu correo">
      <p>Te enviamos un enlace a <strong>{usuario.email}</strong>. Ábrelo y luego vuelve aquí.</p>
      {aviso && <p className="aviso">{aviso}</p>}
      <div className="acciones-columna">
        <button className="boton primario" onClick={yaVerifique}>Ya lo verifiqué</button>
        <button className="boton" onClick={reenviar}>Reenviar correo</button>
        <button className="enlace" onClick={() => signOut(auth)}>Cerrar sesión</button>
      </div>
    </PantallaAcceso>
  );
}

export function AceptarInvitacion({ usuario, invitacion }: { usuario: User; invitacion: Invitacion }) {
  const { recargar } = useSesion();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [comuna, setComuna] = useState(invitacion.comunaId);

  useEffect(() => {
    getDoc(doc(db, 'comunas', invitacion.comunaId))
      .then((snap) => snap.exists() && setComuna(snap.data().nombre ?? invitacion.comunaId))
      .catch(() => undefined);
  }, [invitacion.comunaId]);

  async function aceptar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      // Las reglas validan que comuna y rol sean exactamente los de la invitación.
      await setDoc(doc(db, 'funcionarios', usuario.uid), {
        email: invitacion.email,
        nombre: nombre.trim(),
        comunaId: invitacion.comunaId,
        rol: invitacion.rol,
        activo: true,
        creadoEn: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'invitaciones', invitacion.email)).catch(() => undefined);
      await recargar();
    } catch {
      setError('No se pudo aceptar la invitación. Intenta de nuevo.');
      setGuardando(false);
    }
  }

  return (
    <PantallaAcceso titulo="Tienes una invitación">
      <p>
        Te invitaron como <strong>{ROLES[invitacion.rol].nombre}</strong> de la comuna{' '}
        <strong>{comuna}</strong>.
      </p>
      <p className="texto-suave">{ROLES[invitacion.rol].descripcion}.</p>
      <form onSubmit={aceptar} className="formulario">
        <label>
          Tu nombre
          <input required maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej: María Pérez" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="boton primario" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Aceptar invitación'}
        </button>
      </form>
      <button className="enlace" onClick={() => signOut(auth)}>Cerrar sesión</button>
    </PantallaAcceso>
  );
}

export function SinAcceso({ usuario, desactivado }: { usuario: User; desactivado?: boolean }) {
  return (
    <PantallaAcceso titulo={desactivado ? 'Cuenta desactivada' : 'Sin acceso'}>
      <p>
        {desactivado
          ? 'Tu cuenta del panel fue desactivada por el administrador de tu municipalidad.'
          : <>La cuenta <strong>{usuario.email}</strong> no tiene una invitación al panel.</>}
      </p>
      <p className="texto-suave">
        Pide al administrador de tu municipalidad que te invite con este correo.
      </p>
      <button className="boton" onClick={() => signOut(auth)}>Cerrar sesión</button>
    </PantallaAcceso>
  );
}
