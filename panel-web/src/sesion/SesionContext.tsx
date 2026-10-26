import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db } from '../firebase';
import { aComuna, aFuncionario, aInvitacion } from '../datos/conversores';
import type { Comuna, Funcionario, Invitacion } from '../tipos';

/**
 * Estado de la sesión del panel:
 * - sinSesion: mostrar login.
 * - sinVerificar: el correo no está verificado (requisito para aceptar invitaciones).
 * - invitado: tiene una invitación pendiente que puede aceptar.
 * - sinAcceso: no es funcionario ni tiene invitación.
 * - desactivado: su cuenta de funcionario fue desactivada.
 * - activo: puede usar el panel.
 */
export type EstadoSesion =
  | { tipo: 'cargando' }
  | { tipo: 'sinSesion' }
  | { tipo: 'sinVerificar'; usuario: User }
  | { tipo: 'invitado'; usuario: User; invitacion: Invitacion }
  | { tipo: 'sinAcceso'; usuario: User }
  | { tipo: 'desactivado'; usuario: User }
  | { tipo: 'activo'; usuario: User; funcionario: Funcionario };

interface Sesion {
  estado: EstadoSesion;
  /** Comunas visibles: todas para el superadmin, solo la propia para el resto. */
  comunas: Comuna[];
  /** Comuna que se está viendo en el panel (el superadmin puede cambiarla). */
  comunaId: string | null;
  setComunaId: (id: string) => void;
  /** Vuelve a evaluar la sesión (tras verificar el correo o aceptar una invitación). */
  recargar: () => Promise<void>;
}

const SesionContext = createContext<Sesion | null>(null);

const CLAVE_COMUNA = 'panel.comunaId';

export function SesionProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null | undefined>(undefined);
  const [estado, setEstado] = useState<EstadoSesion>({ tipo: 'cargando' });
  const [comunas, setComunas] = useState<Comuna[]>([]);
  const [comunaElegida, setComunaElegida] = useState<string | null>(() => leerComunaGuardada());
  const [version, setVersion] = useState(0);

  useEffect(() => onAuthStateChanged(auth, setUsuario), []);

  // Escucha el documento de funcionario del usuario; si no existe, busca una invitación.
  useEffect(() => {
    if (usuario === undefined) return;
    if (usuario === null) {
      setEstado({ tipo: 'sinSesion' });
      return;
    }
    if (!usuario.emailVerified) {
      setEstado({ tipo: 'sinVerificar', usuario });
      return;
    }
    setEstado({ tipo: 'cargando' });
    return onSnapshot(
      doc(db, 'funcionarios', usuario.uid),
      async (snap) => {
        if (snap.exists()) {
          const funcionario = aFuncionario(snap);
          setEstado(funcionario.activo
            ? { tipo: 'activo', usuario, funcionario }
            : { tipo: 'desactivado', usuario });
          return;
        }
        const email = usuario.email?.toLowerCase() ?? '';
        const invitacion = await getDoc(doc(db, 'invitaciones', email)).catch(() => null);
        setEstado(invitacion?.exists()
          ? { tipo: 'invitado', usuario, invitacion: aInvitacion(invitacion) }
          : { tipo: 'sinAcceso', usuario });
      },
      () => setEstado({ tipo: 'sinAcceso', usuario }),
    );
  }, [usuario, version]);

  // Comunas visibles según el rol.
  const funcionario = estado.tipo === 'activo' ? estado.funcionario : null;
  useEffect(() => {
    if (!funcionario) {
      setComunas([]);
      return;
    }
    if (funcionario.rol === 'SUPERADMIN') {
      return onSnapshot(query(collection(db, 'comunas'), orderBy('nombre')), (snap) =>
        setComunas(snap.docs.map(aComuna)));
    }
    if (!funcionario.comunaId) return;
    return onSnapshot(doc(db, 'comunas', funcionario.comunaId), (snap) =>
      setComunas(snap.exists() ? [aComuna(snap)] : []));
  }, [funcionario?.uid, funcionario?.rol, funcionario?.comunaId]);

  const comunaId = funcionario?.rol === 'SUPERADMIN'
    ? (comunas.find((c) => c.id === comunaElegida)?.id ?? comunas[0]?.id ?? null)
    : (funcionario?.comunaId ?? null);

  const valor = useMemo<Sesion>(() => ({
    estado,
    comunas,
    comunaId,
    setComunaId: (id) => {
      setComunaElegida(id);
      try { localStorage.setItem(CLAVE_COMUNA, id); } catch { /* sin almacenamiento */ }
    },
    recargar: async () => {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        // Renueva el token para que las reglas vean email_verified actualizado.
        await auth.currentUser.getIdToken(true);
        setUsuario(auth.currentUser);
      }
      setVersion((v) => v + 1);
    },
  }), [estado, comunas, comunaId]);

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion(): Sesion {
  const sesion = useContext(SesionContext);
  if (!sesion) throw new Error('useSesion debe usarse dentro de SesionProvider');
  return sesion;
}

/** Atajo para pantallas que solo se muestran con sesión activa. */
export function useFuncionario(): Funcionario {
  const { estado } = useSesion();
  if (estado.tipo !== 'activo') throw new Error('Se requiere un funcionario activo');
  return estado.funcionario;
}

function leerComunaGuardada(): string | null {
  try { return localStorage.getItem(CLAVE_COMUNA); } catch { return null; }
}
