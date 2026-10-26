package cl.reportevecinal.app.data.photos

import android.net.Uri

/** URLs de la foto guardada y de su miniatura (para listas). */
data class FotoSubida(val url: String, val miniaturaUrl: String)

/**
 * Subida de fotos de los reportes.
 *
 * Es la única pieza de la app que sabe dónde se guardan las imágenes. Para usar otro servicio
 * (Cloudinary, S3, un backend propio, etc.) basta con crear otra implementación de esta interfaz
 * y cambiarla en [cl.reportevecinal.app.AppContainer]. Las implementaciones comprimen la foto con
 * [CompresorFotos] antes de guardarla.
 */
interface PhotoRepository {
    /**
     * Guarda la imagen ubicada en [archivo] (y una miniatura) y devuelve sus URLs de descarga.
     *
     * @param uid usuario dueño del reporte.
     * @param reporteId identificador del reporte al que pertenece la foto.
     */
    suspend fun subirFoto(uid: String, reporteId: String, archivo: Uri): FotoSubida
}
