package cl.reportevecinal.app.data.comunas

import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.tasks.await

data class Comuna(val id: String, val nombre: String)

interface ComunaRepository {
    /** Comuna cliente que contiene el punto, o null si el punto no está en ninguna comuna activa. */
    suspend fun comunaEn(lat: Double, lng: Double): Comuna?
}

/**
 * Lee los límites de las comunas activas desde Firestore (colección `comunas`), así se pueden
 * agregar comunas nuevas desde el panel sin actualizar la app.
 *
 * Cada documento tiene `nombre`, `activa`, el rectángulo `minLat`/`maxLat`/`minLng`/`maxLng` y
 * `geojson`: la geometría (Polygon o MultiPolygon) como texto, porque Firestore no admite listas
 * de listas.
 */
class FirestoreComunaRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) : ComunaRepository {

    private val mutex = Mutex()
    private var cache: List<LimiteComuna>? = null
    private var cargadoEn = 0L

    override suspend fun comunaEn(lat: Double, lng: Double): Comuna? {
        val limites = limitesActivos()
        return limites.firstOrNull { it.contiene(lat, lng) }?.comuna
    }

    private suspend fun limitesActivos(): List<LimiteComuna> = mutex.withLock {
        val vigente = cache?.takeIf { System.currentTimeMillis() - cargadoEn < DURACION_CACHE_MS }
        vigente ?: db.collection("comunas")
            .whereEqualTo("activa", true)
            .get()
            .await()
            .documents
            .mapNotNull { doc ->
                runCatching {
                    LimiteComuna(
                        comuna = Comuna(doc.id, doc.getString("nombre").orEmpty()),
                        minLat = doc.getDouble("minLat")!!,
                        maxLat = doc.getDouble("maxLat")!!,
                        minLng = doc.getDouble("minLng")!!,
                        maxLng = doc.getDouble("maxLng")!!,
                        poligonos = Geometria.desdeGeoJson(doc.getString("geojson")!!),
                    )
                }.getOrNull()
            }
            .also {
                cache = it
                cargadoEn = System.currentTimeMillis()
            }
    }

    private companion object {
        const val DURACION_CACHE_MS = 30 * 60 * 1000L
    }
}

/** En modo demo cualquier punto pertenece a una comuna ficticia. */
class DemoComunaRepository : ComunaRepository {
    override suspend fun comunaEn(lat: Double, lng: Double) = Comuna("demo", "Comuna demo")
}

private class LimiteComuna(
    val comuna: Comuna,
    val minLat: Double,
    val maxLat: Double,
    val minLng: Double,
    val maxLng: Double,
    val poligonos: List<Poligono>,
) {
    fun contiene(lat: Double, lng: Double): Boolean =
        lat in minLat..maxLat && lng in minLng..maxLng && poligonos.any { it.contiene(lat, lng) }
}
