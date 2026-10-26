package cl.reportevecinal.app.data.reportes

import android.net.Uri
import cl.reportevecinal.app.data.model.Categoria
import cl.reportevecinal.app.data.model.Estado
import cl.reportevecinal.app.data.model.MotivoDenuncia
import cl.reportevecinal.app.data.model.Reporte
import cl.reportevecinal.app.data.photos.PhotoRepository
import com.firebase.geofire.GeoFireUtils
import com.firebase.geofire.GeoLocation
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.Query
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

interface ReporteRepository {
    /** Reportes del usuario, más recientes primero, actualizados en tiempo real. */
    fun misReportes(uid: String): Flow<List<Reporte>>

    /**
     * Reportes activos (recibidos o asignados) de cualquier vecino dentro de [radioMetros] alrededor
     * del punto dado. Los resueltos no se descargan: así las lecturas no crecen con el historial.
     */
    suspend fun reportesCercanos(lat: Double, lng: Double, radioMetros: Double): List<Reporte>

    /**
     * Sube la foto y crea el reporte con estado [Estado.RECIBIDO]. Devuelve el id creado.
     * [personasEnRiesgo] y [afectaVivienda] lo marcan como prioritario para la municipalidad.
     */
    suspend fun crearReporte(
        uid: String,
        comunaId: String,
        categoria: Categoria,
        descripcion: String,
        foto: Uri,
        lat: Double,
        lng: Double,
        personasEnRiesgo: Boolean = false,
        afectaVivienda: Boolean = false,
    ): String

    /**
     * Denuncia un reporte de otro vecino para que la municipalidad lo revise.
     * Lanza [DenunciaRepetidaException] si este usuario ya lo había denunciado.
     */
    suspend fun denunciar(reporte: Reporte, uid: String, motivo: MotivoDenuncia)

    /** Desvincula los reportes del usuario (antes de eliminar su cuenta); quedan anónimos. */
    suspend fun anonimizarReportes(uid: String)

    /** Si este usuario ya marcó «A mí también me afecta» en el reporte. */
    suspend fun yaApoyo(reporteId: String, uid: String): Boolean

    /** Marca (o quita) «A mí también me afecta»: guarda la marca del vecino y ajusta el contador. */
    suspend fun cambiarApoyo(reporteId: String, uid: String, apoyar: Boolean)
}

class DenunciaRepetidaException : Exception("Ya habías denunciado este reporte.")

/** Valor de `uid` de los reportes cuyo autor eliminó su cuenta. */
const val UID_CUENTA_ELIMINADA = "cuenta-eliminada"

class FirestoreReporteRepository(
    private val photoRepository: PhotoRepository,
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) : ReporteRepository {

    private val coleccion get() = db.collection(COLECCION)

    override fun misReportes(uid: String): Flow<List<Reporte>> = callbackFlow {
        val registro = coleccion
            .whereEqualTo("uid", uid)
            .orderBy("creadoEn", Query.Direction.DESCENDING)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot?.documents.orEmpty().mapNotNull { it.aReporte() })
            }
        awaitClose { registro.remove() }
    }

    override suspend fun reportesCercanos(
        lat: Double,
        lng: Double,
        radioMetros: Double,
    ): List<Reporte> = coroutineScope {
        val centro = GeoLocation(lat, lng)
        // Firestore no tiene consultas por radio: se consultan los rangos de geohash que cubren
        // el círculo y luego se descartan los falsos positivos de las esquinas.
        GeoFireUtils.getGeoHashQueryBounds(centro, radioMetros)
            .map { rango ->
                async {
                    // Requiere el índice compuesto (estado, geohash) de firebase/firestore.indexes.json.
                    coleccion.whereIn("estado", ESTADOS_ACTIVOS)
                        .orderBy("geohash")
                        .startAt(rango.startHash)
                        .endAt(rango.endHash)
                        .limit(MAXIMO_POR_RANGO)
                        .get()
                        .await()
                        .documents
                }
            }
            .awaitAll()
            .flatten()
            .mapNotNull { it.aReporte() }
            .distinctBy { it.id }
            .filter {
                GeoFireUtils.getDistanceBetween(GeoLocation(it.lat, it.lng), centro) <= radioMetros
            }
    }

    override suspend fun crearReporte(
        uid: String,
        comunaId: String,
        categoria: Categoria,
        descripcion: String,
        foto: Uri,
        lat: Double,
        lng: Double,
        personasEnRiesgo: Boolean,
        afectaVivienda: Boolean,
    ): String {
        val doc = coleccion.document()
        val subida = photoRepository.subirFoto(uid, doc.id, foto)
        doc.set(
            mapOf(
                "uid" to uid,
                "comunaId" to comunaId,
                "categoria" to categoria.name,
                "descripcion" to descripcion,
                "fotoUrl" to subida.url,
                "miniaturaUrl" to subida.miniaturaUrl,
                "lat" to lat,
                "lng" to lng,
                "geohash" to GeoFireUtils.getGeoHashForLocation(GeoLocation(lat, lng)),
                "estado" to Estado.RECIBIDO.name,
                "personasEnRiesgo" to personasEnRiesgo,
                "afectaVivienda" to afectaVivienda,
                "creadoEn" to FieldValue.serverTimestamp(),
            )
        ).await()
        return doc.id
    }

    override suspend fun denunciar(reporte: Reporte, uid: String, motivo: MotivoDenuncia) {
        val doc = db.collection(COLECCION_DENUNCIAS).document("${reporte.id}_$uid")
        try {
            doc.set(
                mapOf(
                    "reporteId" to reporte.id,
                    "comunaId" to reporte.comunaId,
                    "uid" to uid,
                    "motivo" to motivo.name,
                    "creadoEn" to FieldValue.serverTimestamp(),
                )
            ).await()
        } catch (e: FirebaseFirestoreException) {
            // Las reglas solo permiten crear: si ya existe, el set cuenta como edición y se rechaza.
            if (e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED) throw DenunciaRepetidaException()
            throw e
        }
    }

    override suspend fun yaApoyo(reporteId: String, uid: String): Boolean =
        coleccion.document(reporteId).collection(SUBCOLECCION_APOYOS).document(uid).get().await().exists()

    override suspend fun cambiarApoyo(reporteId: String, uid: String, apoyar: Boolean) {
        val reporte = coleccion.document(reporteId)
        val marca = reporte.collection(SUBCOLECCION_APOYOS).document(uid)
        // Las reglas exigen que la marca y el contador cambien juntos, en el mismo lote.
        db.runBatch { lote ->
            if (apoyar) lote.set(marca, mapOf("creadoEn" to FieldValue.serverTimestamp()))
            else lote.delete(marca)
            lote.update(reporte, "apoyos", FieldValue.increment(if (apoyar) 1 else -1))
        }.await()
    }

    override suspend fun anonimizarReportes(uid: String) {
        val documentos = coleccion.whereEqualTo("uid", uid).get().await().documents
        // Un lote admite hasta 500 escrituras.
        documentos.chunked(500).forEach { grupo ->
            db.runBatch { lote -> grupo.forEach { lote.update(it.reference, "uid", UID_CUENTA_ELIMINADA) } }.await()
        }
    }

    private fun DocumentSnapshot.aReporte(): Reporte? {
        val lat = getDouble("lat") ?: return null
        val lng = getDouble("lng") ?: return null
        return Reporte(
            id = id,
            uid = getString("uid").orEmpty(),
            comunaId = getString("comunaId").orEmpty(),
            categoria = enumOrDefault(getString("categoria"), Categoria.OTRO),
            descripcion = getString("descripcion").orEmpty(),
            fotoUrl = getString("fotoUrl").orEmpty(),
            miniaturaUrl = getString("miniaturaUrl").orEmpty(),
            lat = lat,
            lng = lng,
            geohash = getString("geohash").orEmpty(),
            estado = enumOrDefault(getString("estado"), Estado.RECIBIDO),
            creadoEn = getTimestamp("creadoEn")?.toDate(),
            apoyos = getLong("apoyos")?.toInt() ?: 0,
            // Los reportes anteriores al Modo Emergencia no traen estos campos.
            personasEnRiesgo = getBoolean("personasEnRiesgo") == true,
            afectaVivienda = getBoolean("afectaVivienda") == true,
        )
    }

    private inline fun <reified E : Enum<E>> enumOrDefault(valor: String?, defecto: E): E =
        enumValues<E>().firstOrNull { it.name == valor } ?: defecto

    companion object {
        const val COLECCION = "reportes"
        const val COLECCION_DENUNCIAS = "denuncias"
        const val SUBCOLECCION_APOYOS = "apoyos"
        private val ESTADOS_ACTIVOS = listOf(Estado.RECIBIDO.name, Estado.ASIGNADO.name)

        /** Tope por rango de geohash (suelen ser 4 a 9 rangos por búsqueda). */
        private const val MAXIMO_POR_RANGO = 150L
    }
}
