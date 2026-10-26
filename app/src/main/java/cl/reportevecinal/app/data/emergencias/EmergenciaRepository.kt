package cl.reportevecinal.app.data.emergencias

import cl.reportevecinal.app.data.model.Emergencia
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.callbackFlow

interface EmergenciaRepository {
    /** Comunas con el Modo Emergencia activo, actualizadas en tiempo real. */
    fun emergenciasActivas(): Flow<List<Emergencia>>
}

/**
 * Lee la colección `emergencias` (un documento por comuna, id = comunaId), que la municipalidad
 * activa y desactiva desde el panel. Va aparte de `comunas` para no descargar los límites (pesados)
 * cada vez que cambia el aviso.
 */
class FirestoreEmergenciaRepository(
    private val db: FirebaseFirestore = FirebaseFirestore.getInstance(),
) : EmergenciaRepository {

    override fun emergenciasActivas(): Flow<List<Emergencia>> = callbackFlow {
        val registro = db.collection(COLECCION)
            .whereEqualTo("activa", true)
            .addSnapshotListener { snapshot, error ->
                // Sin conexión o sin permiso no se muestra el banner, pero la app sigue funcionando.
                if (error != null) {
                    trySend(emptyList())
                    return@addSnapshotListener
                }
                trySend(
                    snapshot?.documents.orEmpty().map { doc ->
                        Emergencia(
                            comunaId = doc.id,
                            comunaNombre = doc.getString("comunaNombre").orEmpty(),
                            aviso = doc.getString("aviso").orEmpty(),
                            actualizadoEn = doc.getTimestamp("actualizadoEn")?.toDate(),
                        )
                    }
                )
            }
        awaitClose { registro.remove() }
    }

    companion object {
        const val COLECCION = "emergencias"
    }
}

/** En modo demo la emergencia se activa o desactiva desde la propia app, para poder probarla. */
class DemoEmergenciaRepository : EmergenciaRepository {
    val emergencias = MutableStateFlow<List<Emergencia>>(emptyList())

    override fun emergenciasActivas(): Flow<List<Emergencia>> = emergencias
}
