import type { DocumentSnapshot, Timestamp } from 'firebase/firestore';
import type { Comuna, Denuncia, Emergencia, EntradaHistorial, Funcionario, Invitacion, Reporte } from '../tipos';

const fecha = (valor: unknown): Date | undefined =>
  valor && typeof (valor as Timestamp).toDate === 'function' ? (valor as Timestamp).toDate() : undefined;

export function aFuncionario(snap: DocumentSnapshot): Funcionario {
  const d = snap.data() ?? {};
  return {
    uid: snap.id,
    email: d.email ?? '',
    nombre: d.nombre ?? '',
    comunaId: d.comunaId ?? null,
    rol: d.rol,
    activo: d.activo === true,
    creadoEn: fecha(d.creadoEn),
  };
}

export function aInvitacion(snap: DocumentSnapshot): Invitacion {
  const d = snap.data() ?? {};
  return {
    email: snap.id,
    comunaId: d.comunaId,
    rol: d.rol,
    invitadoPor: d.invitadoPor,
    creadoEn: fecha(d.creadoEn),
  };
}

export function aComuna(snap: DocumentSnapshot): Comuna {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    nombre: d.nombre ?? snap.id,
    region: d.region ?? '',
    activa: d.activa === true,
    minLat: d.minLat,
    maxLat: d.maxLat,
    minLng: d.minLng,
    maxLng: d.maxLng,
    geojson: d.geojson ?? '',
  };
}

export function aReporte(snap: DocumentSnapshot): Reporte {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    uid: d.uid ?? '',
    comunaId: d.comunaId ?? '',
    categoria: d.categoria ?? 'OTRO',
    descripcion: d.descripcion ?? '',
    fotoUrl: d.fotoUrl ?? '',
    miniaturaUrl: d.miniaturaUrl ?? '',
    lat: d.lat,
    lng: d.lng,
    estado: d.estado ?? 'RECIBIDO',
    asignadoA: d.asignadoA ?? null,
    creadoEn: fecha(d.creadoEn),
    actualizadoEn: fecha(d.actualizadoEn),
    apoyos: typeof d.apoyos === 'number' ? d.apoyos : 0,
    origen: d.origen === 'WHATSAPP' ? 'WHATSAPP' : 'APP',
    personasEnRiesgo: d.personasEnRiesgo === true,
    afectaVivienda: d.afectaVivienda === true,
  };
}

export function aEmergencia(snap: DocumentSnapshot): Emergencia {
  const d = snap.data() ?? {};
  return {
    activa: d.activa === true,
    aviso: d.aviso ?? '',
    actualizadoEn: fecha(d.actualizadoEn),
    actualizadoPor: d.actualizadoPor,
  };
}

export function aDenuncia(snap: DocumentSnapshot): Denuncia {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    reporteId: d.reporteId ?? '',
    comunaId: d.comunaId ?? '',
    uid: d.uid ?? '',
    motivo: d.motivo ?? 'OTRO',
    creadoEn: fecha(d.creadoEn),
    decision: d.decision,
    revisadaPor: d.revisadaPor,
    revisadaEn: fecha(d.revisadaEn),
  };
}

export function aEntradaHistorial(snap: DocumentSnapshot): EntradaHistorial {
  const d = snap.data() ?? {};
  return {
    id: snap.id,
    tipo: d.tipo,
    de: d.de ?? null,
    a: d.a ?? null,
    texto: d.texto ?? null,
    autorUid: d.autorUid,
    autorNombre: d.autorNombre ?? '',
    fecha: fecha(d.fecha),
  };
}
