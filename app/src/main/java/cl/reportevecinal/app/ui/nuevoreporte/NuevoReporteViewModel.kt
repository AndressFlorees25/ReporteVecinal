package cl.reportevecinal.app.ui.nuevoreporte

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.reportevecinal.app.data.auth.AuthRepository
import cl.reportevecinal.app.data.comunas.Comuna
import cl.reportevecinal.app.data.comunas.ComunaRepository
import cl.reportevecinal.app.data.model.Categoria
import cl.reportevecinal.app.data.reportes.ReporteRepository
import cl.reportevecinal.app.data.ubicacion.Ubicacion
import cl.reportevecinal.app.data.ubicacion.UbicacionRepository
import com.google.firebase.FirebaseNetworkException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class NuevoReporteUiState(
    val foto: Uri? = null,
    val ubicacion: Ubicacion? = null,
    val buscandoUbicacion: Boolean = false,
    val errorUbicacion: String? = null,
    /** Comuna cliente donde está el problema; null si aún no se sabe o no hay cobertura. */
    val comuna: Comuna? = null,
    /** La ubicación está fuera de las comunas que usan Reporte Vecinal. */
    val sinCobertura: Boolean = false,
    val categoria: Categoria? = null,
    val descripcion: String = "",
    /** Urgencia: cualquiera de las dos marca el reporte como prioritario. */
    val personasEnRiesgo: Boolean = false,
    val afectaVivienda: Boolean = false,
    val enviando: Boolean = false,
    val error: String? = null,
) {
    val puedeEnviar: Boolean
        get() = foto != null && ubicacion != null && comuna != null && categoria != null && !enviando
}

class NuevoReporteViewModel(
    private val authRepository: AuthRepository,
    private val reporteRepository: ReporteRepository,
    private val ubicacionRepository: UbicacionRepository,
    private val comunaRepository: ComunaRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NuevoReporteUiState())
    val uiState: StateFlow<NuevoReporteUiState> = _uiState.asStateFlow()

    /** Se emite una vez cuando el reporte se envía correctamente. */
    private val _enviado = Channel<Unit>(Channel.BUFFERED)
    val enviado = _enviado.receiveAsFlow()

    fun onFotoTomada(uri: Uri) = _uiState.update { it.copy(foto = uri, error = null) }

    fun descartarFoto() = _uiState.update { it.copy(foto = null) }

    fun onErrorCamara(mensaje: String) = _uiState.update { it.copy(error = mensaje) }

    fun onCategoria(categoria: Categoria) = _uiState.update { it.copy(categoria = categoria, error = null) }

    fun onPersonasEnRiesgo(valor: Boolean) = _uiState.update { it.copy(personasEnRiesgo = valor) }

    fun onAfectaVivienda(valor: Boolean) = _uiState.update { it.copy(afectaVivienda = valor) }

    fun onDescripcion(texto: String) {
        if (texto.length <= MAX_DESCRIPCION) _uiState.update { it.copy(descripcion = texto) }
    }

    fun obtenerUbicacion(forzar: Boolean = false) {
        val estado = _uiState.value
        if (estado.buscandoUbicacion || (estado.ubicacion != null && !forzar)) return
        viewModelScope.launch {
            _uiState.update {
                it.copy(buscandoUbicacion = true, errorUbicacion = null, comuna = null, sinCobertura = false)
            }
            try {
                val ubicacion = ubicacionRepository.obtenerUbicacionActual()
                // El reporte pertenece a la comuna donde está el problema, según los límites en Firestore.
                val comuna = comunaRepository.comunaEn(ubicacion.lat, ubicacion.lng)
                _uiState.update {
                    it.copy(
                        ubicacion = ubicacion,
                        comuna = comuna,
                        sinCobertura = comuna == null,
                        buscandoUbicacion = false,
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(buscandoUbicacion = false, errorUbicacion = e.localizedMessage ?: "No se pudo obtener la ubicación.")
                }
            }
        }
    }

    fun enviar() {
        val estado = _uiState.value
        val uid = authRepository.uidActual
        val foto = estado.foto
        val ubicacion = estado.ubicacion
        val categoria = estado.categoria
        val comuna = estado.comuna
        if (uid == null || foto == null || ubicacion == null || comuna == null || categoria == null || estado.enviando) {
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(enviando = true, error = null) }
            try {
                reporteRepository.crearReporte(
                    uid = uid,
                    comunaId = comuna.id,
                    categoria = categoria,
                    descripcion = estado.descripcion.trim(),
                    foto = foto,
                    lat = ubicacion.lat,
                    lng = ubicacion.lng,
                    personasEnRiesgo = estado.personasEnRiesgo,
                    afectaVivienda = estado.afectaVivienda,
                )
                // Se conserva la ubicación para el siguiente reporte; el resto se limpia.
                _uiState.value = NuevoReporteUiState(ubicacion = ubicacion, comuna = comuna)
                _enviado.send(Unit)
            } catch (e: Exception) {
                val mensaje = if (e is FirebaseNetworkException) {
                    "Sin conexión. Revisa tu internet e intenta de nuevo."
                } else {
                    "No se pudo enviar el reporte: ${e.localizedMessage}"
                }
                _uiState.update { it.copy(enviando = false, error = mensaje) }
            }
        }
    }

    companion object {
        const val MAX_DESCRIPCION = 500
    }
}
