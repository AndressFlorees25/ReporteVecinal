package cl.reportevecinal.app.data.photos

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Guarda la foto (comprimida) y su miniatura solo en el almacenamiento interno del teléfono y
 * devuelve sus Uri locales (`file://…`), sin subirlas a ningún servidor.
 *
 * Sirve para el modo demo y para probar con Firebase mientras Storage no esté activado.
 * Limitación: la foto solo se ve en el teléfono que la tomó.
 */
class LocalPhotoRepository(private val context: Context) : PhotoRepository {

    override suspend fun subirFoto(uid: String, reporteId: String, archivo: Uri): FotoSubida {
        val preparadas = CompresorFotos.preparar(context, archivo, reporteId)
        return withContext(Dispatchers.IO) {
            val carpeta = File(context.filesDir, "fotos_reportes").apply { mkdirs() }
            FotoSubida(
                url = mover(preparadas.foto, File(carpeta, "$reporteId.jpg")),
                miniaturaUrl = mover(preparadas.miniatura, File(carpeta, "${reporteId}_min.jpg")),
            )
        }
    }

    private fun mover(origen: File, destino: File): String {
        origen.copyTo(destino, overwrite = true)
        origen.delete()
        return Uri.fromFile(destino).toString()
    }
}
