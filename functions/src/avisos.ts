// Arma el mensaje push de un aviso de la municipalidad (colección `avisos`).
//
// Se envía como mensaje de DATOS (sin bloque `notification`) al tema de la comuna: así la app decide,
// incluso cerrada, si el vecino está dentro del sector y muestra ella la notificación.

import type { Message } from 'firebase-admin/messaging';

export interface Aviso {
  comunaId: string;
  titulo: string;
  mensaje: string;
  sectorNombre?: string;
  lat?: number;
  lng?: number;
  radioMetros?: number;
}

/** Tema de FCM de cada comuna; la app se suscribe al de la comuna donde está el vecino. */
export const temaComuna = (comunaId: string) => `comuna_${comunaId}`;

/** Los avisos dejan de tener sentido después de unas horas: no se entregan pasado este plazo. */
export const VIGENCIA_PUSH_MS = 6 * 60 * 60 * 1000;

export function mensajeAviso(avisoId: string, aviso: Aviso): Message {
  // FCM solo admite valores de texto en `data`.
  const data: Record<string, string> = {
    avisoId,
    comunaId: aviso.comunaId,
    titulo: aviso.titulo,
    mensaje: aviso.mensaje,
  };
  if (typeof aviso.lat === 'number' && typeof aviso.lng === 'number' && typeof aviso.radioMetros === 'number') {
    data.lat = String(aviso.lat);
    data.lng = String(aviso.lng);
    data.radioMetros = String(aviso.radioMetros);
    data.sectorNombre = aviso.sectorNombre ?? '';
  }
  return {
    topic: temaComuna(aviso.comunaId),
    data,
    // Alta prioridad: despierta al teléfono aunque esté en reposo.
    android: { priority: 'high', ttl: VIGENCIA_PUSH_MS },
  };
}
