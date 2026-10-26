// Modelo de datos compartido con la app Android y las reglas de Firestore (firebase/firestore.rules).

export type Rol = 'SUPERADMIN' | 'ADMIN' | 'OPERADOR' | 'CUADRILLA' | 'VISOR';
export type Estado = 'RECIBIDO' | 'ASIGNADO' | 'RESUELTO';
export type Categoria =
  | 'BACHE' | 'LUMINARIA' | 'MICROBASURAL' | 'OTRO'
  // Emergencias (tormentas, lluvias fuertes, cortes de servicios)
  | 'ANEGAMIENTO' | 'ARBOL_CAIDO' | 'CABLE_CORTADO' | 'ESTRUCTURA_DANADA' | 'CALLE_CORTADA'
  | 'CORTE_AGUA' | 'CORTE_LUZ';

export interface Funcionario {
  uid: string;
  email: string;
  nombre: string;
  comunaId: string | null; // null solo para SUPERADMIN
  rol: Rol;
  activo: boolean;
  creadoEn?: Date;
}

export interface Invitacion {
  email: string;
  comunaId: string;
  rol: Exclude<Rol, 'SUPERADMIN'>;
  invitadoPor: string;
  creadoEn?: Date;
}

export interface Comuna {
  id: string;
  nombre: string;
  region: string;
  activa: boolean;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  geojson: string;
}

export interface Reporte {
  id: string;
  uid: string;
  comunaId: string;
  categoria: Categoria;
  descripcion: string;
  fotoUrl: string;
  miniaturaUrl: string;
  lat: number;
  lng: number;
  estado: Estado;
  asignadoA?: string | null;
  creadoEn?: Date;
  actualizadoEn?: Date;
  /** Vecinos que marcaron «A mí también me afecta» (sin contar al autor). */
  apoyos: number;
  /** Canal por el que llegó: la app o el bot de WhatsApp. */
  origen: 'APP' | 'WHATSAPP';
  /** Urgencia marcada por el vecino (los reportes anteriores al Modo Emergencia no la traen). */
  personasEnRiesgo: boolean;
  afectaVivienda: boolean;
}

/** Modo Emergencia de una comuna (colección `emergencias`, id = comunaId). */
export interface Emergencia {
  activa: boolean;
  aviso: string;
  actualizadoEn?: Date;
  actualizadoPor?: string;
}

export type MotivoDenuncia = 'FALSO' | 'OFENSIVO' | 'DATOS_PERSONALES' | 'OTRO';
export type DecisionDenuncia = 'DESCARTADA' | 'REPORTE_CERRADO';

/** Un vecino denunció un reporte desde la app (id del documento: "{reporteId}_{uid}"). */
export interface Denuncia {
  id: string;
  reporteId: string;
  comunaId: string;
  uid: string;
  motivo: MotivoDenuncia;
  creadoEn?: Date;
  decision?: DecisionDenuncia;
  revisadaPor?: string;
  revisadaEn?: Date;
}

export const MOTIVOS_DENUNCIA: Record<MotivoDenuncia, string> = {
  FALSO: 'Falso o no existe',
  OFENSIVO: 'Ofensivo o spam',
  DATOS_PERSONALES: 'Muestra personas o patentes',
  OTRO: 'Otro motivo',
};

export const DECISIONES_DENUNCIA: Record<DecisionDenuncia, string> = {
  DESCARTADA: 'Descartada (el reporte sigue)',
  REPORTE_CERRADO: 'Reporte cerrado',
};

export interface EntradaHistorial {
  id: string;
  tipo: 'ESTADO' | 'ASIGNACION' | 'COMENTARIO';
  de?: string | null;
  a?: string | null;
  texto?: string | null;
  autorUid: string;
  autorNombre: string;
  fecha?: Date;
}

export const ROLES: Record<Rol, { nombre: string; descripcion: string }> = {
  SUPERADMIN: { nombre: 'Superadmin', descripcion: 'Administra todas las comunas' },
  ADMIN: { nombre: 'Administrador', descripcion: 'Todo en su comuna, incluidos los usuarios' },
  OPERADOR: { nombre: 'Operador', descripcion: 'Gestiona reportes: estados, asignaciones y comentarios' },
  CUADRILLA: { nombre: 'Cuadrilla', descripcion: 'Ve sus reportes asignados y los marca como resueltos' },
  VISOR: { nombre: 'Visor', descripcion: 'Solo mira el dashboard y los reportes' },
};

export const ESTADOS: Record<Estado, { nombre: string; color: string }> = {
  RECIBIDO: { nombre: 'Recibido', color: '#1565C0' },
  ASIGNADO: { nombre: 'Asignado', color: '#EF6C00' },
  RESUELTO: { nombre: 'Resuelto', color: '#2E7D32' },
};

export const CATEGORIAS: Record<Categoria, { nombre: string; color: string; icono: string; emergencia?: boolean }> = {
  BACHE: { nombre: 'Socavón / bache', color: '#8D6E63', icono: '🚧' },
  LUMINARIA: { nombre: 'Luminaria apagada', color: '#F9A825', icono: '💡' },
  MICROBASURAL: { nombre: 'Microbasural', color: '#2E7D32', icono: '🗑️' },
  OTRO: { nombre: 'Otro', color: '#546E7A', icono: '❓' },
  ANEGAMIENTO: { nombre: 'Anegamiento', color: '#0277BD', icono: '🌊', emergencia: true },
  ARBOL_CAIDO: { nombre: 'Árbol caído', color: '#33691E', icono: '🌳', emergencia: true },
  CABLE_CORTADO: { nombre: 'Cable eléctrico cortado', color: '#FF6F00', icono: '⚡', emergencia: true },
  ESTRUCTURA_DANADA: { nombre: 'Techo / estructura dañada', color: '#6D4C41', icono: '🏚️', emergencia: true },
  CALLE_CORTADA: { nombre: 'Calle cortada', color: '#AD1457', icono: '⛔', emergencia: true },
  CORTE_AGUA: { nombre: 'Corte de agua', color: '#00838F', icono: '🚱', emergencia: true },
  CORTE_LUZ: { nombre: 'Corte de luz', color: '#4527A0', icono: '🔌', emergencia: true },
};

export const CATEGORIAS_EMERGENCIA = (Object.keys(CATEGORIAS) as Categoria[]).filter((c) => CATEGORIAS[c].emergencia);

/** 2: hay personas en riesgo · 1: afecta una vivienda · 0: sin urgencia marcada. */
export const urgencia = (r: Reporte) => (r.personasEnRiesgo ? 2 : r.afectaVivienda ? 1 : 0);

export const NIVELES_URGENCIA = [
  { nombre: 'Sin urgencia marcada', color: '#546E7A' },
  { nombre: 'Afecta una vivienda', color: '#EF6C00' },
  { nombre: 'Personas en riesgo', color: '#C62828' },
] as const;

/** Roles que pueden cambiar estados y asignar reportes. */
export const puedeGestionar = (rol: Rol) => rol === 'SUPERADMIN' || rol === 'ADMIN' || rol === 'OPERADOR';

/** Roles que administran usuarios de su comuna. */
export const puedeAdministrarUsuarios = (rol: Rol) => rol === 'SUPERADMIN' || rol === 'ADMIN';
