package cl.reportevecinal.app.ui.misreportes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.reportevecinal.app.data.auth.AuthRepository
import cl.reportevecinal.app.data.model.Reporte
import cl.reportevecinal.app.data.reportes.ReporteRepository
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthRecentLoginRequiredException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface MisReportesUiState {
    data object Cargando : MisReportesUiState
    data class Listo(val reportes: List<Reporte>) : MisReportesUiState
    data class Error(val mensaje: String) : MisReportesUiState
}

/** Estado del diálogo «Eliminar mi cuenta». */
data class EliminarCuentaUiState(
    val visible: Boolean = false,
    val password: String = "",
    val eliminando: Boolean = false,
    val error: String? = null,
)

@OptIn(ExperimentalCoroutinesApi::class)
class MisReportesViewModel(
    private val authRepository: AuthRepository,
    private val reporteRepository: ReporteRepository,
) : ViewModel() {

    val uiState: StateFlow<MisReportesUiState> = authRepository.observarSesion()
        .filterNotNull()
        .flatMapLatest { uid ->
            reporteRepository.misReportes(uid)
                .map<List<Reporte>, MisReportesUiState> { MisReportesUiState.Listo(it) }
                .catch { emit(MisReportesUiState.Error(it.localizedMessage ?: "No se pudieron cargar tus reportes.")) }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MisReportesUiState.Cargando)

    private val _eliminarCuenta = MutableStateFlow(EliminarCuentaUiState())
    val eliminarCuenta: StateFlow<EliminarCuentaUiState> = _eliminarCuenta.asStateFlow()

    val emailActual: String? get() = authRepository.emailActual

    fun cerrarSesion() = authRepository.cerrarSesion()

    fun mostrarEliminarCuenta() = _eliminarCuenta.update { EliminarCuentaUiState(visible = true) }

    fun ocultarEliminarCuenta() = _eliminarCuenta.update { if (it.eliminando) it else EliminarCuentaUiState() }

    fun onPasswordEliminarChange(valor: String) = _eliminarCuenta.update { it.copy(password = valor, error = null) }

    /**
     * Confirma la contraseña, deja anónimos los reportes del vecino (la municipalidad los conserva
     * para resolverlos) y elimina la cuenta. Al cerrarse la sesión, la app vuelve sola al login.
     */
    fun confirmarEliminarCuenta() {
        val estado = _eliminarCuenta.value
        val uid = authRepository.uidActual ?: return
        if (estado.password.isEmpty()) {
            _eliminarCuenta.update { it.copy(error = "Escribe tu contraseña para confirmar.") }
            return
        }
        viewModelScope.launch {
            _eliminarCuenta.update { it.copy(eliminando = true, error = null) }
            try {
                authRepository.reautenticar(estado.password)
                reporteRepository.anonimizarReportes(uid)
                authRepository.eliminarCuenta()
                _eliminarCuenta.update { EliminarCuentaUiState() }
            } catch (e: Exception) {
                _eliminarCuenta.update { it.copy(eliminando = false, error = mensajeDeError(e)) }
            }
        }
    }

    private fun mensajeDeError(e: Exception): String = when (e) {
        is FirebaseAuthInvalidCredentialsException -> "La contraseña no es correcta."
        is FirebaseAuthRecentLoginRequiredException -> "Por seguridad, cierra sesión, vuelve a entrar e inténtalo de nuevo."
        is FirebaseNetworkException -> "Sin conexión. Revisa tu internet."
        else -> e.localizedMessage ?: "No se pudo eliminar la cuenta."
    }
}
