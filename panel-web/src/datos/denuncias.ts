import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { DecisionDenuncia, Denuncia, Funcionario, Reporte } from '../tipos';
import { aDenuncia } from './conversores';

interface Resultado<T> {
  datos: T;
  cargando: boolean;
  error: string | null;
}

/** Denuncias de la comuna en tiempo real, más recientes primero. */
export function useDenuncias(comunaId: string | null, maximo = 500): Resultado<Denuncia[]> {
  const [estado, setEstado] = useState<Resultado<Denuncia[]>>({ datos: [], cargando: true, error: null });
  useEffect(() => {
    if (!comunaId) return;
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    return onSnapshot(
      query(collection(db, 'denuncias'), where('comunaId', '==', comunaId), orderBy('creadoEn', 'desc'), limit(maximo)),
      (snap) => setEstado({ datos: snap.docs.map(aDenuncia), cargando: false, error: null }),
      (err) => setEstado({
        datos: [],
        cargando: false,
        error: err.code === 'failed-precondition'
          ? 'Falta crear el índice de denuncias en Firestore (ver firebase/firestore.indexes.json).'
          : 'No se pudieron cargar las denuncias.',
      }),
    );
  }, [comunaId, maximo]);
  return estado;
}

/** Denuncias de un reporte (para su página de detalle). */
export function useDenunciasDeReporte(comunaId: string | null, reporteId: string): Denuncia[] {
  const [lista, setLista] = useState<Denuncia[]>([]);
  useEffect(() => {
    if (!comunaId) return;
    return onSnapshot(
      // El filtro por comuna es obligatorio: las reglas solo dejan leer denuncias de la propia comuna.
      query(collection(db, 'denuncias'), where('comunaId', '==', comunaId), where('reporteId', '==', reporteId)),
      (snap) => setLista(snap.docs.map(aDenuncia)),
      () => setLista([]),
    );
  }, [comunaId, reporteId]);
  return lista;
}

/** Agrupa las denuncias por reporte, con las pendientes primero. */
export function agruparPorReporte(denuncias: Denuncia[]): Map<string, Denuncia[]> {
  const grupos = new Map<string, Denuncia[]>();
  for (const d of denuncias) grupos.set(d.reporteId, [...(grupos.get(d.reporteId) ?? []), d]);
  return grupos;
}

const revision = (decision: DecisionDenuncia, quien: Funcionario) => ({
  decision, revisadaPor: quien.uid, revisadaEn: serverTimestamp(),
});

/** El reporte es legítimo: las denuncias quedan revisadas y el reporte sigue su curso. */
export async function descartarDenuncias(denuncias: Denuncia[], quien: Funcionario) {
  const lote = writeBatch(db);
  for (const d of denuncias) lote.update(doc(db, 'denuncias', d.id), revision('DESCARTADA', quien));
  await lote.commit();
}

/**
 * El reporte no procede: pasa a RESUELTO (deja de verse en el mapa de los vecinos), queda la razón
 * en el historial y las denuncias quedan revisadas. Todo en un solo lote.
 */
export async function cerrarReporteDenunciado(reporte: Reporte, denuncias: Denuncia[], nota: string, quien: Funcionario) {
  const lote = writeBatch(db);
  if (reporte.estado !== 'RESUELTO') {
    lote.update(doc(db, 'reportes', reporte.id), { estado: 'RESUELTO', actualizadoEn: serverTimestamp() });
    lote.set(doc(collection(db, 'reportes', reporte.id, 'historial')), {
      tipo: 'ESTADO', de: reporte.estado, a: 'RESUELTO',
      texto: nota.trim() || 'Cerrado por denuncia de vecinos: el reporte no procede.',
      autorUid: quien.uid, autorNombre: quien.nombre || quien.email, fecha: serverTimestamp(),
    });
  }
  for (const d of denuncias) lote.update(doc(db, 'denuncias', d.id), revision('REPORTE_CERRADO', quien));
  await lote.commit();
}
