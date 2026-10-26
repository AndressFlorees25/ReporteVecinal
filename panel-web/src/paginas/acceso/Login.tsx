import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { useState, type FormEvent } from 'react';
import { auth } from '../../firebase';
import { PantallaAcceso } from './PantallaAcceso';

type Modo = 'entrar' | 'registro' | 'recuperar';

export function Login() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    setError(null);
    setAviso(null);
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setCargando(true);
    try {
      const correo = email.trim().toLowerCase();
      if (modo === 'entrar') {
        await signInWithEmailAndPassword(auth, correo, password);
      } else if (modo === 'registro') {
        const { user } = await createUserWithEmailAndPassword(auth, correo, password);
        await sendEmailVerification(user);
      } else {
        await sendPasswordResetEmail(auth, correo);
        setAviso('Si el correo tiene cuenta, te enviamos un enlace para crear una nueva contraseña.');
      }
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setCargando(false);
    }
  }

  const titulos: Record<Modo, string> = {
    entrar: 'Iniciar sesión',
    registro: 'Crear cuenta',
    recuperar: 'Recuperar contraseña',
  };

  return (
    <PantallaAcceso titulo={titulos[modo]}>
      {modo === 'registro' && (
        <p className="texto-suave">
          Solo funcionarios invitados por su municipalidad. Usa el mismo correo al que llegó la invitación.
        </p>
      )}
      <form onSubmit={enviar} className="formulario">
        <label>
          Correo electrónico
          <input type="email" required autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </label>
        {modo !== 'recuperar' && (
          <label>
            Contraseña
            <input type="password" required minLength={6}
              autoComplete={modo === 'registro' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {aviso && <p className="aviso">{aviso}</p>}
        <button className="boton primario" disabled={cargando}>
          {cargando ? 'Un momento…' : titulos[modo]}
        </button>
      </form>
      <div className="enlaces-acceso">
        {modo === 'entrar' ? (
          <>
            <button className="enlace" onClick={() => cambiarModo('registro')}>¿Te invitaron? Crea tu cuenta</button>
            <button className="enlace" onClick={() => cambiarModo('recuperar')}>Olvidé mi contraseña</button>
          </>
        ) : (
          <button className="enlace" onClick={() => cambiarModo('entrar')}>Volver a iniciar sesión</button>
        )}
      </div>
    </PantallaAcceso>
  );
}

function mensajeError(err: unknown): string {
  const codigo = err instanceof FirebaseError ? err.code : '';
  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/email-already-in-use':
      return 'Ya existe una cuenta con ese correo. Inicia sesión.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'El correo no es válido.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos. Espera unos minutos.';
    case 'auth/network-request-failed':
      return 'Sin conexión. Revisa tu internet.';
    default:
      return 'Ocurrió un error. Intenta de nuevo.';
  }
}
