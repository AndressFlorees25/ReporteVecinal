package cl.reportevecinal.app.ui.emergencia

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.reportevecinal.app.data.avisos.Aviso
import cl.reportevecinal.app.data.avisos.AvisoRepository
import cl.reportevecinal.app.data.avisos.PreferenciasAvisos
import cl.reportevecinal.app.data.comunas.ComunaRepository
import cl.reportevecinal.app.data.emergencias.DemoEmergenciaRepository
import cl.reportevecinal.app.data.emergencias.EmergenciaRepository
import cl.reportevecinal.app.data.model.Emergencia
import cl.reportevecinal.app.data.ubicacion.UbicacionRepository
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Modo Emergencia y avisos de la comuna donde está el vecino. Vive a nivel de la actividad: lo
 * comparten el banner de la navegación y la pantalla de nuevo reporte.
 *
 * [preferenciasAvisos] es null en modo demo (no hay push real). [notificar] muestra un aviso como
 * notificación del sistema; se usa también con la app abierta, por si el push no está disponible.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class EmergenciaViewModel(
    private val emergenciaRepository: EmergenciaRepository,
    private val ubicacionRepository: UbicacionRepository,
    private val comunaRepository: ComunaRepository,
    avisoRepository: AvisoRepository,
    private val preferenciasAvisos: PreferenciasAvisos?,
    private val notificar: (Aviso) -> Unit,
) : ViewModel() {

    /** Comuna donde está el vecino; null si aún no se sabe (sin permiso de ubicación, por ejemplo). */
    private val comunaId = MutableStateFlow<String?>(null)

    /**
     * Emergencia vigente para el vecino. Si no se conoce su comuna se muestra cualquiera activa:
     * es preferible un aviso de más que perderse uno.
     */
    val emergencia: StateFlow<Emergencia?> =
        combine(emergenciaRepository.emergenciasActivas(), comunaId) { activas, comuna ->
            if (comuna == null) activas.firstOrNull() else activas.firstOrNull { it.comunaId == comuna }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    /** En modo demo no hay panel municipal: la emergencia se simula desde la app. */
    val puedeSimular: Boolean get() = emergenciaRepository is DemoEmergenciaRepository

    init {
        actualizarComuna()
        // Mientras la app está abierta, cada aviso nuevo de la comuna se notifica al instante (aunque
        // la Cloud Function del push no esté desplegada). Los repetidos se descartan al notificar.
        viewModelScope.launch {
            comunaId.filterNotNull()
                .flatMapLatest { avisoRepository.avisosRecientes(it) }
                .collect { avisos -> avisos.forEach(notificar) }
        }
    }

    /** Vuelve a ubicar al vecino (por ejemplo, después de que concede el permiso de ubicación). */
    fun actualizarComuna() {
        viewModelScope.launch {
            runCatching {
                val u = ubicacionRepository.obtenerUbicacionActual()
                comunaRepository.comunaEn(u.lat, u.lng)
            }.onSuccess { comuna ->
                if (comuna != null) {
                    comunaId.value = comuna.id
                    preferenciasAvisos?.suscribirComuna(comuna.id)
                }
            }
        }
    }

    fun simularEmergencia() {
        val demo = emergenciaRepository as? DemoEmergenciaRepository ?: return
        demo.emergencias.value = if (demo.emergencias.value.isEmpty()) {
            notificar(
                Aviso(
                    id = "demo-${System.currentTimeMillis()}",
                    comunaId = "demo",
                    titulo = "Evite Av. Principal",
                    mensaje = "Paso bajo nivel anegado. Use rutas alternativas.",
                )
            )
            listOf(
                Emergencia(
                    comunaId = "demo",
                    comunaNombre = "Comuna demo",
                    aviso = "Sistema frontal: evite el paso bajo nivel de Av. Principal. " +
                        "Albergue habilitado en la sede vecinal.",
                )
            )
        } else {
            emptyList()
        }
    }
}
