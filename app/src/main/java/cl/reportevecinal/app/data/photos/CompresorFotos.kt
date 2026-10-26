package cl.reportevecinal.app.data.photos

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.max
import kotlin.math.roundToInt

/** Foto lista para guardar: versión reducida y miniatura, ambas JPEG en la caché de la app. */
class FotosPreparadas(val foto: File, val miniatura: File)

/**
 * Reduce la foto antes de guardarla o subirla: una foto de cámara pasa de ~0,5–1 MB a ~150–250 KB,
 * y la miniatura (para listas) pesa ~20 KB. Corrige la orientación según el EXIF, para que la foto
 * no quede girada al perder los metadatos.
 */
object CompresorFotos {

    private const val LADO_MAXIMO = 1280
    private const val LADO_MINIATURA = 320
    private const val CALIDAD_FOTO = 75
    private const val CALIDAD_MINIATURA = 70

    suspend fun preparar(context: Context, origen: Uri, nombre: String): FotosPreparadas =
        withContext(Dispatchers.IO) {
            val resolver = context.contentResolver
            val rotacion = resolver.openInputStream(origen)?.use { ExifInterface(it).rotationDegrees } ?: 0

            // Primero solo las dimensiones, para decodificar ya submuestreada y no cargar 12 MP en memoria.
            val limites = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            resolver.openInputStream(origen)?.use { BitmapFactory.decodeStream(it, null, limites) }
            if (limites.outWidth <= 0 || limites.outHeight <= 0) error("No se pudo leer la foto.")

            val opciones = BitmapFactory.Options().apply {
                inSampleSize = submuestreo(max(limites.outWidth, limites.outHeight), LADO_MAXIMO)
            }
            val original = resolver.openInputStream(origen)?.use { BitmapFactory.decodeStream(it, null, opciones) }
                ?: error("No se pudo leer la foto.")

            val foto = rotar(ajustar(original, LADO_MAXIMO), rotacion)
            val miniatura = ajustar(foto, LADO_MINIATURA)

            val carpeta = File(context.cacheDir, "fotos_preparadas").apply { mkdirs() }
            FotosPreparadas(
                foto = guardar(foto, File(carpeta, "$nombre.jpg"), CALIDAD_FOTO),
                miniatura = guardar(miniatura, File(carpeta, "${nombre}_min.jpg"), CALIDAD_MINIATURA),
            ).also {
                if (miniatura !== foto) miniatura.recycle()
                foto.recycle()
            }
        }

    /** Mayor potencia de 2 que mantiene el lado mayor por sobre [objetivo]. */
    private fun submuestreo(ladoMayor: Int, objetivo: Int): Int {
        var muestra = 1
        while (ladoMayor / (muestra * 2) >= objetivo) muestra *= 2
        return muestra
    }

    private fun ajustar(bitmap: Bitmap, ladoMaximo: Int): Bitmap {
        val ladoMayor = max(bitmap.width, bitmap.height)
        if (ladoMayor <= ladoMaximo) return bitmap
        val escala = ladoMaximo.toFloat() / ladoMayor
        return Bitmap.createScaledBitmap(
            bitmap, (bitmap.width * escala).roundToInt(), (bitmap.height * escala).roundToInt(), true,
        )
    }

    private fun rotar(bitmap: Bitmap, grados: Int): Bitmap {
        if (grados == 0) return bitmap
        val matriz = Matrix().apply { postRotate(grados.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matriz, true)
    }

    private fun guardar(bitmap: Bitmap, destino: File, calidad: Int): File {
        destino.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, calidad, it) }
        return destino
    }
}
