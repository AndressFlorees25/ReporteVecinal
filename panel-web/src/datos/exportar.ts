import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { CATEGORIAS, ESTADOS, type Funcionario, type Reporte } from '../tipos';
import { aReporte } from './conversores';
import type { FiltrosReportes } from './reportes';

/** Todos los reportes de la comuna (sin el tope de la lista en pantalla), más recientes primero. */
async function todosLosReportes(comunaId: string): Promise<Reporte[]> {
  const snap = await getDocs(query(collection(db, 'reportes'), where('comunaId', '==', comunaId), orderBy('creadoEn', 'desc')));
  return snap.docs.map(aReporte);
}

const formatoFecha = new Intl.DateTimeFormat('es-CL', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago',
});

// Excel en Chile usa «;» como separador y «,» como decimal.
function celda(valor: string | number): string {
  const texto = typeof valor === 'number' ? String(valor).replace('.', ',') : valor;
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/**
 * Descarga un CSV que Excel abre directo, con los reportes que cumplen los filtros de la pantalla.
 * La municipalidad se lleva sus datos cuando quiera.
 */
export async function descargarExcel(
  comunaId: string,
  nombreComuna: string,
  filtros: FiltrosReportes,
  texto: string,
  funcionarios: Funcionario[],
): Promise<number> {
  const nombreDe = new Map(funcionarios.map((f) => [f.uid, f.nombre || f.email]));
  const buscar = texto.trim().toLowerCase();
  const reportes = (await todosLosReportes(comunaId)).filter((r) =>
    (!filtros.estado || r.estado === filtros.estado)
    && (!filtros.categoria || r.categoria === filtros.categoria)
    && (!buscar || r.descripcion.toLowerCase().includes(buscar) || r.id.toLowerCase().includes(buscar)));

  const encabezado = ['N.º de reporte', 'Fecha', 'Categoría', 'Descripción', 'Estado', 'Vecinos afectados', 'Canal',
    'Asignado a', 'Última gestión', 'Latitud', 'Longitud', 'Google Maps', 'Foto'];
  const filas = reportes.map((r) => [
    r.id,
    r.creadoEn ? formatoFecha.format(r.creadoEn) : '',
    CATEGORIAS[r.categoria].nombre,
    r.descripcion,
    ESTADOS[r.estado].nombre,
    r.apoyos + 1,
    r.origen === 'WHATSAPP' ? 'WhatsApp' : 'App',
    r.asignadoA ? nombreDe.get(r.asignadoA) ?? '' : '',
    r.actualizadoEn ? formatoFecha.format(r.actualizadoEn) : '',
    r.lat,
    r.lng,
    `https://www.google.com/maps?q=${r.lat},${r.lng}`,
    /^https?:\/\//.test(r.fotoUrl) ? r.fotoUrl : '',
  ]);

  const csv = [encabezado, ...filas].map((fila) => fila.map(celda).join(';')).join('\r\n');
  // El BOM hace que Excel lea bien tildes y eñes.
  const archivo = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(archivo);
  const hoy = new Date().toISOString().slice(0, 10);
  enlace.download = `reportes-${nombreComuna.toLowerCase().replace(/\s+/g, '-')}-${hoy}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
  return reportes.length;
}
