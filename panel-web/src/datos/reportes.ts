import {
  collection,
  doc,
  limit,
  onSnapshot,
  setDoc,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
  type QueryConstraint,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { Categoria, Emergencia, EntradaHistorial, Estado, Funcionario, Reporte } from '../tipos';
import { aEmergencia, aEntradaHistorial, aFuncionario, aReporte } from './conversores';

export interface FiltrosReportes {
  estado?: Estado | '';
  categoria?: Categoria | '';
  /** Varias categorías a la vez (por ejemplo, todas las de emergencia). Se ignora si hay `categoria`. */
  categorias?: Categoria[];
  asignadoA?: string;
}

interface Resultado<T> {
  datos: T;
  cargando: boolean;
  error: string | null;
}

/** Reportes de una comuna en tiempo real, más recientes primero. */
export function useReportes(comunaId: string | null, filtros: FiltrosReportes = {}, maximo = 500): Resultado<Reporte[]> {
  const [estado, setEstado] = useState<Resultado<Reporte[]>>({ datos: [], cargando: true, error: null });
  const { estado: filtroEstado, categoria, asignadoA } = filtros;
  // Como texto, para que una lista nueva con las mismas categorías no repita la consulta.
  const categorias = filtros.categorias?.join(',') ?? '';

  useEffect(() => {
    if (!comunaId) return;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    const condiciones: QueryConstraint[] = [where('comunaId', '==', comunaId)];
    if (filtroEstado) condiciones.push(where('estado', '==', filtroEstado));
    if (categoria) condiciones.push(where('categoria', '==', categoria));
    else if (categorias) condiciones.push(where('categoria', 'in', categorias.split(',')));
    if (asignadoA) condiciones.push(where('asignadoA', '==', asignadoA));
    condiciones.push(orderBy('creadoEn', 'desc'), limit(maximo));

    return onSnapshot(
      query(collection(db, 'reportes'), ...condiciones),
      (snap) => setEstado({ datos: snap.docs.map(aReporte), cargando: false, error: null }),
      (err) => setEstado({ datos: [], cargando: false, error: mensajeConsulta(err) }),
    );
  }, [comunaId, filtroEstado, categoria, categorias, asignadoA, maximo]);

  return estado;
}

export function useReporte(id: string | undefined): Resultado<Reporte | null> {
  const [estado, setEstado] = useState<Resultado<Reporte | null>>({ datos: null, cargando: true, error: null });
  useEffect(() => {
    if (!id) return;
    return onSnapshot(
      doc(db, 'reportes', id),
      (snap) => setEstado({ datos: snap.exists() ? aReporte(snap) : null, cargando: false, error: null }),
      () => setEstado({ datos: null, cargando: false, error: 'No tienes acceso a este reporte.' }),
    );
  }, [id]);
  return estado;
}

export function useHistorial(reporteId: string | undefined): EntradaHistorial[] {
  const [entradas, setEntradas] = useState<EntradaHistorial[]>([]);
  useEffect(() => {
    if (!reporteId) return;
    return onSnapshot(
      query(collection(db, 'reportes', reporteId, 'historial'), orderBy('fecha', 'desc')),
      (snap) => setEntradas(snap.docs.map(aEntradaHistorial)),
      () => setEntradas([]),
    );
  }, [reporteId]);
  return entradas;
}

/** Funcionarios de la comuna (para asignar reportes y para la gestión de usuarios). */
export function useFuncionarios(comunaId: string | null): Funcionario[] {
  const [lista, setLista] = useState<Funcionario[]>([]);
  useEffect(() => {
    if (!comunaId) return;
    return onSnapshot(
      query(collection(db, 'funcionarios'), where('comunaId', '==', comunaId)),
      (snap) => setLista(snap.docs.map(aFuncionario).sort((a, b) => a.nombre.localeCompare(b.nombre))),
      () => setLista([]),
    );
  }, [comunaId]);
  return lista;
}

/** Modo Emergencia de la comuna (null mientras carga o si nunca se activó). */
export function useEmergencia(comunaId: string | null): Emergencia | null {
  const [emergencia, setEmergencia] = useState<Emergencia | null>(null);
  useEffect(() => {
    if (!comunaId) return;
    return onSnapshot(
      doc(db, 'emergencias', comunaId),
      (snap) => setEmergencia(snap.exists() ? aEmergencia(snap) : { activa: false, aviso: '' }),
      () => setEmergencia(null),
    );
  }, [comunaId]);
  return emergencia;
}

/** Activa, actualiza el aviso o desactiva el Modo Emergencia: la app de los vecinos lo ve al instante. */
export async function guardarEmergencia(comunaId: string, comunaNombre: string, activa: boolean, aviso: string, quien: Funcionario) {
  await setDoc(doc(db, 'emergencias', comunaId), {
    activa, aviso: aviso.trim(), comunaNombre, actualizadoPor: quien.uid, actualizadoEn: serverTimestamp(),
  });
}

// ---------- Acciones (cada una actualiza el reporte y deja registro en el historial) ----------

const autor = (f: Funcionario) => ({ autorUid: f.uid, autorNombre: f.nombre || f.email });

export async function cambiarEstado(reporte: Reporte, nuevo: Estado, quien: Funcionario, comentario?: string) {
  const lote = writeBatch(db);
  lote.update(doc(db, 'reportes', reporte.id), { estado: nuevo, actualizadoEn: serverTimestamp() });
  lote.set(doc(collection(db, 'reportes', reporte.id, 'historial')), {
    tipo: 'ESTADO', de: reporte.estado, a: nuevo, texto: comentario?.trim() || null,
    ...autor(quien), fecha: serverTimestamp(),
  });
  await lote.commit();
}

/** Asigna (o quita) un responsable. Si el reporte estaba RECIBIDO, pasa a ASIGNADO. */
export async function asignar(reporte: Reporte, responsable: Funcionario | null, quien: Funcionario) {
  const lote = writeBatch(db);
  const pasaAAsignado = responsable !== null && reporte.estado === 'RECIBIDO';
  lote.update(doc(db, 'reportes', reporte.id), {
    asignadoA: responsable?.uid ?? null,
    ...(pasaAAsignado ? { estado: 'ASIGNADO' } : {}),
    actualizadoEn: serverTimestamp(),
  });
  lote.set(doc(collection(db, 'reportes', reporte.id, 'historial')), {
    tipo: 'ASIGNACION', de: null, a: responsable ? responsable.nombre || responsable.email : null,
    texto: null, ...autor(quien), fecha: serverTimestamp(),
  });
  if (pasaAAsignado) {
    lote.set(doc(collection(db, 'reportes', reporte.id, 'historial')), {
      tipo: 'ESTADO', de: 'RECIBIDO', a: 'ASIGNADO', texto: null, ...autor(quien), fecha: serverTimestamp(),
    });
  }
  await lote.commit();
}

export async function comentar(reporteId: string, texto: string, quien: Funcionario) {
  const lote = writeBatch(db);
  lote.set(doc(collection(db, 'reportes', reporteId, 'historial')), {
    tipo: 'COMENTARIO', texto: texto.trim(), ...autor(quien), fecha: serverTimestamp(),
  });
  await lote.commit();
}

function mensajeConsulta(err: { code?: string; message?: string }): string {
  if (err.code === 'failed-precondition') {
    return 'Falta crear un índice en Firestore para este filtro (ver firebase/firestore.indexes.json). ' +
      'Mientras tanto, quita el filtro.';
  }
  if (err.code === 'permission-denied') return 'No tienes permiso para ver estos reportes.';
  return 'No se pudieron cargar los reportes.';
}
