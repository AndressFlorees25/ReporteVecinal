package cl.reportevecinal.app.data.photos

import android.content.Context
import android.net.Uri
import com.google.firebase.storage.FirebaseStorage
import com.google.firebase.storage.StorageReference
import com.google.firebase.storage.storageMetadata
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.tasks.await
import java.io.File

/**
 * Guarda las fotos en Firebase Storage: `reportes/{uid}/{reporteId}.jpg` y la miniatura
 * `reportes/{uid}/{reporteId}_min.jpg`.
 */
class FirebaseStoragePhotoRepository(
    private val context: Context,
    private val storage: FirebaseStorage = FirebaseStorage.getInstance(),
) : PhotoRepository {

    override suspend fun subirFoto(uid: String, reporteId: String, archivo: Uri): FotoSubida = coroutineScope {
        val preparadas = CompresorFotos.preparar(context, archivo, reporteId)
        val carpeta = storage.reference.child("reportes/$uid")
        try {
            val foto = async { subir(carpeta.child("$reporteId.jpg"), preparadas.foto) }
            val miniatura = async { subir(carpeta.child("${reporteId}_min.jpg"), preparadas.miniatura) }
            FotoSubida(url = foto.await(), miniaturaUrl = miniatura.await())
        } finally {
            preparadas.foto.delete()
            preparadas.miniatura.delete()
        }
    }

    private suspend fun subir(ref: StorageReference, archivo: File): String {
        ref.putFile(Uri.fromFile(archivo), storageMetadata { contentType = "image/jpeg" }).await()
        return ref.downloadUrl.await().toString()
    }
}
