import { CATEGORIAS, ESTADOS, NIVELES_URGENCIA, urgencia, type Categoria, type Estado, type Reporte } from '../tipos';

export function ChipEstado({ estado }: { estado: Estado }) {
  return <span className="chip" style={{ background: ESTADOS[estado].color }}>{ESTADOS[estado].nombre}</span>;
}

export function EtiquetaCategoria({ categoria }: { categoria: Categoria }) {
  const c = CATEGORIAS[categoria];
  return <span><span aria-hidden>{c.icono}</span> {c.nombre}</span>;
}

/** Urgencia marcada por el vecino; no muestra nada si no marcó ninguna. */
export function ChipUrgencia({ reporte }: { reporte: Reporte }) {
  const nivel = urgencia(reporte);
  if (nivel === 0) return null;
  return <span className="chip" style={{ background: NIVELES_URGENCIA[nivel].color }}>❗ {NIVELES_URGENCIA[nivel].nombre}</span>;
}

/** La app guarda fotos con URL http(s) si están en la nube; `file://` significa que quedaron en el teléfono. */
export const fotoEnLaNube = (r: Reporte) => /^https?:\/\//.test(r.fotoUrl);

export function Miniatura({ reporte }: { reporte: Reporte }) {
  // La miniatura pesa ~20 KB; los reportes antiguos solo tienen la foto completa.
  const url = /^https?:\/\//.test(reporte.miniaturaUrl) ? reporte.miniaturaUrl : reporte.fotoUrl;
  return fotoEnLaNube(reporte)
    ? <img className="miniatura" src={url} alt="" loading="lazy" />
    : <span className="miniatura" aria-hidden>{CATEGORIAS[reporte.categoria].icono}</span>;
}

const formato = new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' });
export const formatearFecha = (f?: Date) => (f ? formato.format(f) : '—');
