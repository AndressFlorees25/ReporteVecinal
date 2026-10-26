import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type DocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../firebase';
import type { Funcionario } from '../tipos';

/** Círculo del mapa al que va dirigido un aviso; sin sector, el aviso es para toda la comuna. */
export interface Sector {
  nombre: string;
  lat: number;
  lng: number;
  radioMetros: number;
}

export interface Aviso {
  id: string;
  comunaId: string;
  titulo: string;
  mensaje: string;
  sector: Sector | null;
  creadoPor: string;
  creadoEn?: Date;
  /** Lo completa la Cloud Function `enviarAviso` cuando el push sale. */
  enviadoEn?: Date;
}

const fecha = (v: unknown) => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : undefined);

function aAviso(snap: DocumentSnapshot): Aviso {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    comunaId: d.comunaId ?? '',
    titulo: d.titulo ?? '',
    mensaje: d.mensaje ?? '',
    sector: typeof d.lat === 'number' && typeof d.lng === 'number' && typeof d.radioMetros === 'number'
      ? { nombre: d.sectorNombre ?? '', lat: d.lat, lng: d.lng, radioMetros: d.radioMetros }
      : null,
    creadoPor: d.creadoPor ?? '',
    creadoEn: fecha(d.creadoEn),
    enviadoEn: fecha(d.enviadoEn),
  };
}

/** Últimos avisos enviados en la comuna, en tiempo real. */
export function useAvisos(comunaId: string | null, maximo = 30) {
  const [estado, setEstado] = useState<{ datos: Aviso[]; error: string | null }>({ datos: [], error: null });
  useEffect(() => {
    if (!comunaId) return;
    return onSnapshot(
      query(collection(db, 'avisos'), where('comunaId', '==', comunaId), orderBy('creadoEn', 'desc'), limit(maximo)),
      (snap) => setEstado({ datos: snap.docs.map(aAviso), error: null }),
      (err) => setEstado({
        datos: [],
        error: err.code === 'failed-precondition'
          ? 'Falta crear el índice de avisos en Firestore (ver firebase/firestore.indexes.json).'
          : 'No se pudieron cargar los avisos.',
      }),
    );
  }, [comunaId, maximo]);
  return estado;
}

/** Crea el aviso: la app de los vecinos lo notifica y la Cloud Function lo manda por push. */
export async function enviarAviso(comunaId: string, titulo: string, mensaje: string, sector: Sector | null, quien: Funcionario) {
  await addDoc(collection(db, 'avisos'), {
    comunaId,
    titulo: titulo.trim(),
    mensaje: mensaje.trim(),
    ...(sector
      ? { sectorNombre: sector.nombre.trim(), lat: sector.lat, lng: sector.lng, radioMetros: sector.radioMetros }
      : {}),
    creadoPor: quien.uid,
    creadoEn: serverTimestamp(),
  });
}
