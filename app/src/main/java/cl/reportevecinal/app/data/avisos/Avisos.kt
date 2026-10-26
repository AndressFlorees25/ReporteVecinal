package cl.reportevecinal.app.data.avisos

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import cl.reportevecinal.app.MainActivity
import cl.reportevecinal.app.R
import com.firebase.geofire.GeoFireUtils
import com.firebase.geofire.GeoLocation
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.util.Date

/**
 * Aviso de la municipalidad a los vecinos («Evite calle X», «Albergue habilitado en sede Y»).
 * Sin [sector] es para toda la comuna; con sector, solo para quienes estén dentro del círculo.
 */
data class Aviso(
    val id: String,
    val comunaId: String,
    val titulo: String,
    val mensaje: String,
    val sector: Sector? = null,
    val creadoEn: Date? = null,
) {
    data class Sector(val nombre: String, val lat: Double, val lng: Double, val radioMetros: Double)

    /**
     * Si el aviso le corresponde a un vecino en el punto dado. Sin ubicación conocida se muestra
     * igual: es preferible un aviso de más que perderse uno.
     */
    fun aplicaEn(lat: Double?, lng: Double?): Boolean {
        val s = sector ?: return true
        if (lat == null || lng == null) return true
        return GeoFireUtils.getDistanceBetween(GeoLocation(lat, lng), GeoLocation(s.lat, s.lng)) <= s.radioMetros
    }

    companion object {
        /** Arma el aviso desde los datos de un mensaje push (todos los valores llegan como texto). */
        fun desdeDatos(datos: Map<String, String>): Aviso? {
            val id = datos["avisoId"] ?: return null
            val lat = datos["lat"]?.toDoubleOrNull()
            val lng = datos["lng"]?.toDoubleOrNull()
            val radio = datos["radioMetros"]?.toDoubleOrNull()
            return Aviso(
                id = id,
                comunaId = datos["comunaId"].orEmpty(),
                titulo = datos["titulo"].orEmpty(),
                mensaje = datos["mensaje"].orEmpty(),
                sector = if (lat != null && lng != null && radio != null) {
                    Aviso.Sector(datos["sectorNombre"].orEmpty(), lat, lng, radio)
                } else {
                    null
                },
            )
        }
    }
}

/** Tema de FCM de cada comuna: la Cloud Function `enviarAviso` publica ahí cada aviso nuevo. */
fun temaComuna(comunaId: String) = "comuna_$comunaId"

/**
 * Lo que la app recuerda para los avisos: la comuna suscrita, la última ubicación conocida (para
 * filtrar por sector aunque la app esté cerrada) y los avisos ya mostrados (para no repetirlos).
 */
class PreferenciasAvisos(context: Context) {
    private val prefs = context.getSharedPreferences("avisos", Context.MODE_PRIVATE)

    fun guardarUbicacion(lat: Double, lng: Double) = prefs.edit {
        putString(CLAVE_LAT, lat.toString())
        putString(CLAVE_LNG, lng.toString())
    }

    val ultimaLat: Double? get() = prefs.getString(CLAVE_LAT, null)?.toDoubleOrNull()
    val ultimaLng: Double? get() = prefs.getString(CLAVE_LNG, null)?.toDoubleOrNull()

    /** Marca el aviso como mostrado. Devuelve false si ya se había mostrado antes. */
    @Synchronized
    fun marcarMostrado(avisoId: String): Boolean {
        val mostrados = prefs.getString(CLAVE_MOSTRADOS, "").orEmpty().split(',').filter { it.isNotBlank() }
        if (avisoId in mostrados) return false
        prefs.edit { putString(CLAVE_MOSTRADOS, (mostrados + avisoId).takeLast(MAXIMO_RECORDADOS).joinToString(",")) }
        return true
    }

    /** Se suscribe al tema de la comuna (y se da de baja del anterior si el vecino cambió de comuna). */
    fun suscribirComuna(comunaId: String) {
        val anterior = prefs.getString(CLAVE_COMUNA, null)
        if (anterior == comunaId) return
        val mensajeria = runCatching { FirebaseMessaging.getInstance() }.getOrNull() ?: return
        if (anterior != null) mensajeria.unsubscribeFromTopic(temaComuna(anterior))
        mensajeria.subscribeToTopic(temaComuna(comunaId)).addOnSuccessListener {
            prefs.edit { putString(CLAVE_COMUNA, comunaId) }
        }
    }

    private companion object {
        const val CLAVE_LAT = "lat"
        const val CLAVE_LNG = "lng"
        const val CLAVE_MOSTRADOS = "mostrados"
        const val CLAVE_COMUNA = "comuna"
        const val MAXIMO_RECORDADOS = 50
    }
}

/** Muestra los avisos como notificaciones del sistema, en el canal «Avisos de la municipalidad». */
object NotificadorAvisos {
    const val CANAL = "avisos"

    fun mostrar(context: Context, aviso: Aviso) {
        val prefs = PreferenciasAvisos(context)
        if (!aviso.aplicaEn(prefs.ultimaLat, prefs.ultimaLng)) return
        if (!puedeNotificar(context)) return
        // Puede llegar dos veces (push y escucha de Firestore con la app abierta): se muestra una sola.
        if (!prefs.marcarMostrado(aviso.id)) return
        crearCanal(context)

        val abrirApp = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val texto = aviso.sector?.nombre?.takeIf { it.isNotBlank() }?.let { "${aviso.mensaje}\n📍 $it" } ?: aviso.mensaje
        val notificacion = NotificationCompat.Builder(context, CANAL)
            .setSmallIcon(R.drawable.ic_aviso)
            .setColor(0xFFC62828.toInt())
            .setContentTitle(aviso.titulo.ifBlank { "Aviso de la municipalidad" })
            .setContentText(aviso.mensaje)
            .setStyle(NotificationCompat.BigTextStyle().bigText(texto))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(abrirApp)
            .setAutoCancel(true)
            .build()
        @Suppress("MissingPermission") // Verificado en puedeNotificar().
        NotificationManagerCompat.from(context).notify(aviso.id.hashCode(), notificacion)
    }

    private fun puedeNotificar(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun crearCanal(context: Context) {
        val canal = NotificationChannel(CANAL, "Avisos de la municipalidad", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Cortes de calle, albergues y otros avisos durante emergencias"
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(canal)
    }
}

fun interface AvisoRepository {
    /** Avisos de la comuna de las últimas horas, más recientes primero, en tiempo real. */
    fun avisosRecientes(comunaId: String): Flow<List<Aviso>>
}

class FirestoreAvisoRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) : AvisoRepository {

    override fun avisosRecientes(comunaId: String): Flow<List<Aviso>> = callbackFlow {
        val desde = Date(System.currentTimeMillis() - VIGENCIA_MS)
        // Requiere el índice compuesto (comunaId, creadoEn) de firebase/firestore.indexes.json.
        val registro = db.collection(COLECCION)
            .whereEqualTo("comunaId", comunaId)
            .whereGreaterThan("creadoEn", desde)
            .orderBy("creadoEn", Query.Direction.DESCENDING)
            .limit(20)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                trySend(
                    snapshot?.documents.orEmpty().map { doc ->
                        val lat = doc.getDouble("lat")
                        val lng = doc.getDouble("lng")
                        val radio = doc.getDouble("radioMetros")
                        Aviso(
                            id = doc.id,
                            comunaId = comunaId,
                            titulo = doc.getString("titulo").orEmpty(),
                            mensaje = doc.getString("mensaje").orEmpty(),
                            sector = if (lat != null && lng != null && radio != null) {
                                Aviso.Sector(doc.getString("sectorNombre").orEmpty(), lat, lng, radio)
                            } else {
                                null
                            },
                            creadoEn = doc.getTimestamp("creadoEn")?.toDate(),
                        )
                    }
                )
            }
        awaitClose { registro.remove() }
    }

    companion object {
        const val COLECCION = "avisos"
        /** Un aviso de más de 6 horas ya no se notifica al abrir la app. */
        const val VIGENCIA_MS = 6 * 60 * 60 * 1000L
    }
}
