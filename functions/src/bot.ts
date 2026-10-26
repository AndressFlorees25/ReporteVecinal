// Conversación del bot de WhatsApp: el vecino manda foto, ubicación y categoría, y queda un reporte
// igual a los de la app. La lógica no conoce Firebase ni WhatsApp: recibe todo en `Dependencias`,
// así se prueba sin red (pruebas/bot.test.ts).

import { createHash } from 'node:crypto';

export type Categoria = 'BACHE' | 'LUMINARIA' | 'MICROBASURAL' | 'OTRO';

export const CATEGORIAS: { id: Categoria; titulo: string; descripcion: string }[] = [
  { id: 'BACHE', titulo: 'Socavón / bache', descripcion: 'Hoyos en la calle o la vereda' },
  { id: 'LUMINARIA', titulo: 'Luminaria apagada', descripcion: 'Postes o focos sin luz' },
  { id: 'MICROBASURAL', titulo: 'Microbasural', descripcion: 'Basura o escombros acumulados' },
  { id: 'OTRO', titulo: 'Otro', descripcion: 'Semáforos, señales, árboles, etc.' },
];

const ESTADOS: Record<string, string> = { RECIBIDO: 'Recibido', ASIGNADO: 'Asignado', RESUELTO: 'Resuelto' };

/** Mensaje entrante ya simplificado desde el webhook. */
export interface MensajeEntrante {
  id: string;
  /** Teléfono del vecino en formato internacional, sin «+». */
  de: string;
  tipo: 'texto' | 'imagen' | 'ubicacion' | 'opcion' | 'otro';
  texto?: string;
  mediaId?: string;
  lat?: number;
  lng?: number;
  /** id de la fila elegida en una lista interactiva. */
  opcionId?: string;
}

export interface Sesion {
  reporteId?: string;
  fotoUrl?: string;
  lat?: number;
  lng?: number;
  comunaId?: string;
  categoria?: Categoria;
  /** El bot ya pidió la descripción: el próximo texto lo es. */
  esperandoDescripcion?: boolean;
  actualizadaEn: number;
  ultimoMensajeId?: string;
}

export interface ReporteNuevo {
  uid: string;
  comunaId: string;
  categoria: Categoria;
  descripcion: string;
  fotoUrl: string;
  lat: number;
  lng: number;
}

export interface ResumenReporte {
  id: string;
  categoria: string;
  estado: string;
  creadoEn?: Date;
}

export interface Dependencias {
  sesiones: {
    leer(clave: string): Promise<Sesion | null>;
    guardar(clave: string, sesion: Sesion): Promise<void>;
    borrar(clave: string): Promise<void>;
  };
  comunas: { comunaEn(lat: number, lng: number): Promise<{ id: string; nombre: string } | null> };
  reportes: {
    nuevoId(): string;
    crear(id: string, reporte: ReporteNuevo): Promise<void>;
    delUsuario(uid: string, maximo: number): Promise<ResumenReporte[]>;
  };
  /** Descarga la imagen de WhatsApp, la guarda y devuelve su URL pública. */
  fotos: { guardar(mediaId: string, reporteId: string): Promise<string> };
  whatsapp: {
    texto(a: string, cuerpo: string): Promise<void>;
    lista(a: string, cuerpo: string, boton: string, opciones: { id: string; titulo: string; descripcion: string }[]): Promise<void>;
  };
  ahora(): number;
}

/** Una conversación a medias se descarta después de 2 horas sin respuesta. */
export const VIGENCIA_SESION_MS = 2 * 60 * 60 * 1000;
const MAX_DESCRIPCION = 500;

/**
 * Identificador del vecino sin guardar su teléfono: los reportes por WhatsApp llevan este `uid`.
 * Con sal, para que no se pueda adivinar recorriendo números.
 */
export function uidDeTelefono(telefono: string, sal: string): string {
  return 'wa_' + createHash('sha256').update(`${sal}:${telefono}`).digest('hex').slice(0, 28);
}

const normalizar = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const TEXTOS = {
  bienvenida:
    '¡Hola! 👋 Soy el asistente de *Reporte Vecinal*.\n\n' +
    'Para avisar a la municipalidad de un bache, una luminaria apagada o un microbasural:\n' +
    '1️⃣ Envía una *foto* del problema\n' +
    '2️⃣ Comparte la *ubicación* donde está\n' +
    '3️⃣ Elige el *tipo* de problema\n\n' +
    'Empecemos: envía la foto 📷\n\n' +
    'En cualquier momento escribe *ESTADO* para ver tus reportes o *CANCELAR* para empezar de nuevo.',
  pedirFoto: 'Envía una *foto* del problema 📷 (con la cámara o desde tu galería).',
  pedirUbicacion:
    '¡Gracias! Ahora comparte la *ubicación* del problema 📍\n\n' +
    'Toca 📎 (o ➕) → *Ubicación* → *Enviar tu ubicación actual*. ' +
    'Si no estás en el lugar, mueve el mapa hasta el punto exacto y envíalo.',
  fueraDeCobertura:
    'Esa ubicación está fuera de las comunas que usan Reporte Vecinal por ahora 😕. ' +
    'Revisa que el punto esté bien y envíala de nuevo.',
  pedirCategoria: '¿Qué tipo de problema es?',
  botonCategoria: 'Elegir tipo',
  pedirDescripcion:
    'Por último, escribe una *descripción breve* (por ejemplo: «frente al paradero de Santa Rosa»).\n' +
    'Si no quieres agregar nada, responde *NO*.',
  cancelado: 'Listo, descarté el reporte. Cuando quieras, envía una foto para empezar uno nuevo.',
  sinReportes: 'Todavía no tienes reportes enviados por WhatsApp. Envía una foto para hacer el primero 📷',
  noEntiendo: 'Ese tipo de mensaje no lo puedo leer 🙈.',
  errorFoto: 'No pude descargar la foto 😕. ¿Puedes enviarla de nuevo?',
};

export function numeroCorto(id: string): string {
  return id.slice(0, 6).toUpperCase();
}

/** Procesa un mensaje del vecino y le responde. */
export async function procesarMensaje(msg: MensajeEntrante, deps: Dependencias, sal: string): Promise<void> {
  const clave = uidDeTelefono(msg.de, sal);
  const responder = (cuerpo: string) => deps.whatsapp.texto(msg.de, cuerpo);

  let sesion = await deps.sesiones.leer(clave);
  // WhatsApp puede reenviar el mismo mensaje si tardamos en responder.
  if (sesion?.ultimoMensajeId === msg.id) return;
  if (sesion && deps.ahora() - sesion.actualizadaEn > VIGENCIA_SESION_MS) sesion = null;

  const texto = msg.tipo === 'texto' ? normalizar(msg.texto ?? '') : '';

  // Comandos que funcionan en cualquier momento.
  if (['cancelar', 'salir', 'reiniciar'].includes(texto)) {
    await deps.sesiones.borrar(clave);
    await responder(TEXTOS.cancelado);
    return;
  }
  if (['estado', 'mis reportes', 'reportes'].includes(texto)) {
    await responder(await textoEstado(clave, deps));
    if (sesion) await deps.sesiones.guardar(clave, { ...sesion, ultimoMensajeId: msg.id, actualizadaEn: deps.ahora() });
    return;
  }

  const nueva = !sesion;
  const s: Sesion = sesion ?? { actualizadaEn: deps.ahora() };
  s.ultimoMensajeId = msg.id;
  s.actualizadaEn = deps.ahora();
  const guardar = () => deps.sesiones.guardar(clave, s);

  switch (msg.tipo) {
    case 'imagen': {
      s.reporteId ??= deps.reportes.nuevoId();
      try {
        s.fotoUrl = await deps.fotos.guardar(msg.mediaId ?? '', s.reporteId);
      } catch {
        await guardar();
        await responder(TEXTOS.errorFoto);
        return;
      }
      break;
    }
    case 'ubicacion': {
      const comuna = await deps.comunas.comunaEn(msg.lat ?? NaN, msg.lng ?? NaN);
      if (!comuna) {
        await guardar();
        await responder(TEXTOS.fueraDeCobertura);
        return;
      }
      s.lat = msg.lat;
      s.lng = msg.lng;
      s.comunaId = comuna.id;
      break;
    }
    case 'opcion': {
      const categoria = CATEGORIAS.find((c) => c.id === msg.opcionId);
      if (categoria && s.fotoUrl && s.comunaId) s.categoria = categoria.id;
      break;
    }
    case 'texto': {
      if (nueva) {
        await guardar();
        await responder(TEXTOS.bienvenida);
        return;
      }
      if (s.esperandoDescripcion && s.categoria) {
        const descripcion = ['no', 'nada', 'omitir', '-'].includes(texto) ? '' : (msg.texto ?? '').trim();
        await crearReporte(clave, s, descripcion.slice(0, MAX_DESCRIPCION), msg.de, deps);
        return;
      }
      // También se acepta el número de la categoría escrito a mano (1 a 4).
      const n = Number(texto);
      if (s.fotoUrl && s.comunaId && !s.categoria && Number.isInteger(n) && n >= 1 && n <= CATEGORIAS.length) {
        s.categoria = CATEGORIAS[n - 1].id;
      }
      break;
    }
    default:
      await guardar();
      await responder(TEXTOS.noEntiendo);
      // Se vuelve a pedir lo que falta más abajo.
      break;
  }

  await guardar();
  await pedirLoQueFalta(s, msg.de, deps);
  if (s.categoria && !s.esperandoDescripcion) {
    s.esperandoDescripcion = true;
    await guardar();
  }
}

async function pedirLoQueFalta(s: Sesion, telefono: string, deps: Dependencias): Promise<void> {
  if (!s.fotoUrl) return deps.whatsapp.texto(telefono, TEXTOS.pedirFoto);
  if (!s.comunaId) return deps.whatsapp.texto(telefono, TEXTOS.pedirUbicacion);
  if (!s.categoria) {
    return deps.whatsapp.lista(
      telefono,
      TEXTOS.pedirCategoria + '\n(También puedes responder con el número: 1, 2, 3 o 4).',
      TEXTOS.botonCategoria,
      CATEGORIAS.map((c, i) => ({ id: c.id, titulo: `${i + 1}. ${c.titulo}`, descripcion: c.descripcion })),
    );
  }
  return deps.whatsapp.texto(telefono, TEXTOS.pedirDescripcion);
}

async function crearReporte(clave: string, s: Sesion, descripcion: string, telefono: string, deps: Dependencias) {
  const id = s.reporteId ?? deps.reportes.nuevoId();
  await deps.reportes.crear(id, {
    uid: clave,
    comunaId: s.comunaId!,
    categoria: s.categoria!,
    descripcion,
    fotoUrl: s.fotoUrl!,
    lat: s.lat!,
    lng: s.lng!,
  });
  await deps.sesiones.borrar(clave);
  const categoria = CATEGORIAS.find((c) => c.id === s.categoria)?.titulo ?? '';
  await deps.whatsapp.texto(
    telefono,
    `✅ ¡Reporte enviado a la municipalidad!\n\n*N.º ${numeroCorto(id)}* · ${categoria}\n\n` +
      'Escribe *ESTADO* cuando quieras para ver cómo va. Para reportar otro problema, envía otra foto 📷',
  );
}

async function textoEstado(clave: string, deps: Dependencias): Promise<string> {
  const lista = await deps.reportes.delUsuario(clave, 5);
  if (lista.length === 0) return TEXTOS.sinReportes;
  const fecha = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: '2-digit', timeZone: 'America/Santiago' });
  const filas = lista.map((r) => {
    const cat = CATEGORIAS.find((c) => c.id === r.categoria)?.titulo ?? r.categoria;
    const cuando = r.creadoEn ? ` (${fecha.format(r.creadoEn)})` : '';
    return `• *N.º ${numeroCorto(r.id)}* ${cat}${cuando}: *${ESTADOS[r.estado] ?? r.estado}*`;
  });
  return `Tus últimos reportes:\n\n${filas.join('\n')}`;
}
