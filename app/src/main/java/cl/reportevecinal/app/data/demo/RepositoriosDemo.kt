package cl.reportevecinal.app.data.demo

import android.net.Uri
import cl.reportevecinal.app.data.auth.AuthRepository
import cl.reportevecinal.app.data.model.Categoria
import cl.reportevecinal.app.data.model.Estado
import cl.reportevecinal.app.data.model.MotivoDenuncia
import cl.reportevecinal.app.data.model.Reporte
import cl.reportevecinal.app.data.photos.PhotoRepository
import cl.reportevecinal.app.data.reportes.DenunciaRepetidaException
import cl.reportevecinal.app.data.reportes.ReporteRepository
import cl.reportevecinal.app.data.reportes.UID_CUENTA_ELIMINADA
import com.firebase.geofire.GeoFireUtils
import com.firebase.geofire.GeoLocation
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import java.util.Date
import java.util.UUID
import kotlin.math.cos
import kotlin.random.Random

/*
 * Implementaciones en memoria para probar la app sin Firebase («modo demo»).
 * Se activan solas mientras app/google-services.json sea el archivo de ejemplo.
 * Los datos se pierden al cerrar la app.
 */

const val UID_DEMO = "vecino-demo"

class DemoAuthRepository : AuthRepository {
    private val sesion = MutableStateFlow<String?>(null)

    override val uidActual: String? get() = sesion.value
    override val emailActual: String? get() = sesion.value?.let { "vecino@demo.cl" }
    override fun observarSesion(): Flow<String?> = sesion

    override suspend fun iniciarSesion(email: String, password: String) {
        delay(400) // Simula la latencia de red.
        sesion.value = UID_DEMO
    }

    override suspend fun registrarse(email: String, password: String) = iniciarSesion(email, password)

    override suspend fun enviarCorreoRecuperacion(email: String) = delay(400)

    override suspend fun reautenticar(password: String) = delay(300)

    override suspend fun eliminarCuenta() {
        delay(400)
        sesion.value = null
    }

    override fun cerrarSesion() {
        sesion.value = null
    }
}

class DemoReporteRepository(private val photoRepository: PhotoRepository) : ReporteRepository {

    private val reportes = MutableStateFlow(reportesPropiosDeEjemplo())
    private var vecinosGenerados = false

    override fun misReportes(uid: String): Flow<List<Reporte>> =
        reportes.map { lista -> lista.filter { it.uid == uid }.sortedByDescending { it.creadoEn } }

    override suspend fun reportesCercanos(lat: Double, lng: Double, radioMetros: Double): List<Reporte> {
        delay(500)
        // La primera vez se "siembran" reportes de otros vecinos alrededor de tu ubicación real.
        if (!vecinosGenerados) {
            vecinosGenerados = true
            reportes.update { it + reportesVecinosAlrededor(lat, lng) }
        }
        val centro = GeoLocation(lat, lng)
        return reportes.value.filter {
            it.estado != Estado.RESUELTO &&
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
        val id = UUID.randomUUID().toString()
        val subida = photoRepository.subirFoto(uid, id, foto)
        val nuevo = Reporte(
            id = id,
            uid = uid,
            comunaId = comunaId,
            categoria = categoria,
            descripcion = descripcion,
            fotoUrl = subida.url,
            miniaturaUrl = subida.miniaturaUrl,
            lat = lat,
            lng = lng,
            geohash = GeoFireUtils.getGeoHashForLocation(GeoLocation(lat, lng)),
            estado = Estado.RECIBIDO,
            creadoEn = Date(),
            personasEnRiesgo = personasEnRiesgo,
            afectaVivienda = afectaVivienda,
        )
        reportes.update { listOf(nuevo) + it }
        // Si ya se generaron los vecinos, tus reportes nuevos también aparecen en el mapa.
        return id
    }

    private val denunciados = mutableSetOf<String>()

    override suspend fun denunciar(reporte: Reporte, uid: String, motivo: MotivoDenuncia) {
        delay(300)
        if (!denunciados.add("${reporte.id}_$uid")) throw DenunciaRepetidaException()
    }

    private val apoyados = mutableSetOf<String>()

    override suspend fun yaApoyo(reporteId: String, uid: String) = "${reporteId}_$uid" in apoyados

    override suspend fun cambiarApoyo(reporteId: String, uid: String, apoyar: Boolean) {
        delay(200)
        val clave = "${reporteId}_$uid"
        val cambio = if (apoyar && apoyados.add(clave)) 1 else if (!apoyar && apoyados.remove(clave)) -1 else 0
        reportes.update { lista -> lista.map { if (it.id == reporteId) it.copy(apoyos = it.apoyos + cambio) else it } }
    }

    override suspend fun anonimizarReportes(uid: String) {
        reportes.update { lista -> lista.map { if (it.uid == uid) it.copy(uid = UID_CUENTA_ELIMINADA) else it } }
    }

    private fun reportesPropiosDeEjemplo(): List<Reporte> {
        val ahora = System.currentTimeMillis()
        val hora = 3_600_000L
        // Ubicados en el centro de Santiago; los nuevos que crees usarán tu GPS real.
        return listOf(
            ejemplo(UID_DEMO, Categoria.LUMINARIA, "Poste apagado hace una semana en la esquina.", Estado.RESUELTO, -33.4372, -70.6506, ahora - 240 * hora),
            ejemplo(UID_DEMO, Categoria.BACHE, "Bache profundo en la pista derecha, frente al paradero.", Estado.ASIGNADO, -33.4410, -70.6540, ahora - 52 * hora),
            ejemplo(UID_DEMO, Categoria.MICROBASURAL, "Acumulación de escombros y bolsas en el sitio eriazo.", Estado.RECIBIDO, -33.4455, -70.6600, ahora - 3 * hora),
        )
    }

    private fun reportesVecinosAlrededor(lat: Double, lng: Double): List<Reporte> {
        val random = Random(42)
        val descripciones = mapOf(
            Categoria.BACHE to "Socavón en la calzada",
            Categoria.LUMINARIA to "Luminaria apagada",
            Categoria.MICROBASURAL to "Basura acumulada en la esquina",
            Categoria.OTRO to "Semáforo intermitente",
            Categoria.ANEGAMIENTO to "Calle inundada, el agua llega a la vereda",
            Categoria.ARBOL_CAIDO to "Árbol caído sobre la calzada",
            Categoria.CABLE_CORTADO to "Cable colgando cerca del paradero",
            Categoria.ESTRUCTURA_DANADA to "Se voló parte del techo de una casa",
            Categoria.CALLE_CORTADA to "Pasaje cortado por escombros",
            Categoria.CORTE_AGUA to "Sin agua desde la mañana",
            Categoria.CORTE_LUZ to "Toda la cuadra sin luz",
        )
        return List(Categoria.entries.size + 4) { i ->
            val categoria = Categoria.entries[i % Categoria.entries.size]
            // Desplazamiento aleatorio de hasta ~1,6 km.
            val dLat = (random.nextDouble() - 0.5) * 0.03
            val dLng = (random.nextDouble() - 0.5) * 0.03 / cos(Math.toRadians(lat))
            ejemplo(
                uid = "otro-vecino-$i",
                categoria = categoria,
                descripcion = descripciones.getValue(categoria),
                estado = Estado.entries[random.nextInt(Estado.entries.size)],
                lat = lat + dLat,
                lng = lng + dLng,
                creadoEn = System.currentTimeMillis() - random.nextLong(1, 400) * 3_600_000L,
                personasEnRiesgo = categoria.emergencia && i % 3 == 0,
                afectaVivienda = categoria.emergencia && i % 2 == 0,
            )
        }
    }

    private fun ejemplo(
        uid: String,
        categoria: Categoria,
        descripcion: String,
        estado: Estado,
        lat: Double,
        lng: Double,
        creadoEn: Long,
        personasEnRiesgo: Boolean = false,
        afectaVivienda: Boolean = false,
    ) = Reporte(
        id = UUID.randomUUID().toString(),
        uid = uid,
        categoria = categoria,
        descripcion = descripcion,
        fotoUrl = "",
        lat = lat,
        lng = lng,
        geohash = GeoFireUtils.getGeoHashForLocation(GeoLocation(lat, lng)),
        estado = estado,
        creadoEn = Date(creadoEn),
        personasEnRiesgo = personasEnRiesgo,
        afectaVivienda = afectaVivienda,
    )
}
