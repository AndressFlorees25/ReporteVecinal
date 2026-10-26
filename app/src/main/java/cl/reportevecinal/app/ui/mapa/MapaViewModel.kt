package cl.reportevecinal.app.ui.mapa

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.reportevecinal.app.data.auth.AuthRepository
import cl.reportevecinal.app.data.model.MotivoDenuncia
import cl.reportevecinal.app.data.model.Reporte
import cl.reportevecinal.app.data.reportes.DenunciaRepetidaException
import cl.reportevecinal.app.data.reportes.ReporteRepository
import cl.reportevecinal.app.data.ubicacion.Ubicacion
import cl.reportevecinal.app.data.ubicacion.UbicacionRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MapaUiState(
    val centro: Ubicacion? = null,
    val reportes: List<Reporte> = emptyList(),
    val cargando: Boolean = false,
    val error: String? = null,
    /** Reporte cuyo pin tocó el usuario; se muestra en una tarjeta con la opción de denunciarlo. */
    val seleccionado: Reporte? = null,
    /** Si el usuario ya marcó «A mí también me afecta» en el seleccionado; null mientras se consulta. */
    val yaApoyo: Boolean? = null,
    val cambiandoApoyo: Boolean = false,
    val denunciando: Boolean = false,
    /** Resultado de la última denuncia (o de un apoyo fallido), para mostrarlo una vez. */
    val mensajeDenuncia: String? = null,
)

class MapaViewModel(
    private val ubicacionRepository: UbicacionRepository,
    private val reporteRepository: ReporteRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(MapaUiState())
    val uiState: StateFlow<MapaUiState> = _uiState.asStateFlow()

    /** Obtiene la ubicación actual y carga los reportes en [RADIO_METROS] a la redonda. */
    fun cargar() {
        if (_uiState.value.cargando) return
        viewModelScope.launch {
            _uiState.update { it.copy(cargando = true, error = null) }
            try {
                val centro = ubicacionRepository.obtenerUbicacionActual()
                _uiState.update { it.copy(centro = centro) }
                val reportes = reporteRepository.reportesCercanos(centro.lat, centro.lng, RADIO_METROS)
                _uiState.update { estado ->
                    estado.copy(
                        reportes = reportes,
                        cargando = false,
                        seleccionado = estado.seleccionado?.let { sel -> reportes.find { it.id == sel.id } },
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(cargando = false, error = e.localizedMessage ?: "No se pudieron cargar los reportes cercanos.")
                }
            }
        }
    }

    fun seleccionar(reporte: Reporte?) {
        _uiState.update { it.copy(seleccionado = reporte, yaApoyo = null) }
        val uid = authRepository.uidActual
        if (reporte == null || uid == null || esPropio(reporte)) return
        viewModelScope.launch {
            val apoyo = runCatching { reporteRepository.yaApoyo(reporte.id, uid) }.getOrDefault(false)
            _uiState.update { if (it.seleccionado?.id == reporte.id) it.copy(yaApoyo = apoyo) else it }
        }
    }

    /** Marca o quita «A mí también me afecta» en el reporte seleccionado. */
    fun alternarApoyo() {
        val estado = _uiState.value
        val reporte = estado.seleccionado ?: return
        val apoyar = estado.yaApoyo != true
        val uid = authRepository.uidActual ?: return
        if (estado.cambiandoApoyo || estado.yaApoyo == null) return
        viewModelScope.launch {
            _uiState.update { it.copy(cambiandoApoyo = true) }
            try {
                reporteRepository.cambiarApoyo(reporte.id, uid, apoyar)
                val actualizado = reporte.copy(apoyos = (reporte.apoyos + if (apoyar) 1 else -1).coerceAtLeast(0))
                _uiState.update { e ->
                    e.copy(
                        cambiandoApoyo = false,
                        yaApoyo = apoyar,
                        seleccionado = actualizado,
                        reportes = e.reportes.map { if (it.id == reporte.id) actualizado else it },
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(cambiandoApoyo = false, mensajeDenuncia = "No se pudo guardar tu apoyo: ${e.localizedMessage ?: "error desconocido"}")
                }
            }
        }
    }

    /** Solo se pueden denunciar reportes de otros vecinos. */
    fun esPropio(reporte: Reporte): Boolean = reporte.uid == authRepository.uidActual

    fun denunciar(reporte: Reporte, motivo: MotivoDenuncia) {
        val uid = authRepository.uidActual ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(denunciando = true) }
            val mensaje = try {
                reporteRepository.denunciar(reporte, uid, motivo)
                "Gracias. La municipalidad revisará este reporte."
            } catch (e: DenunciaRepetidaException) {
                e.message
            } catch (e: Exception) {
                "No se pudo enviar la denuncia: ${e.localizedMessage ?: "error desconocido"}"
            }
            _uiState.update { it.copy(denunciando = false, mensajeDenuncia = mensaje) }
        }
    }

    fun mensajeDenunciaMostrado() = _uiState.update { it.copy(mensajeDenuncia = null) }

    companion object {
        const val RADIO_METROS = 2_000.0
    }
}
