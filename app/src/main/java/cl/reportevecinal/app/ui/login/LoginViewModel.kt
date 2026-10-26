package cl.reportevecinal.app.ui.login

import android.util.Patterns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cl.reportevecinal.app.data.auth.AuthRepository
import com.google.firebase.FirebaseNetworkException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val modoRegistro: Boolean = false,
    val cargando: Boolean = false,
    val error: String? = null,
    /** Mensaje informativo (no de error), p. ej. que se envió el correo de recuperación. */
    val aviso: String? = null,
)

class LoginViewModel(
    private val authRepository: AuthRepository,
    val modoDemo: Boolean,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    /** Solo en modo demo: entra con un usuario ficticio. */
    fun entrarComoDemo() {
        _uiState.update { it.copy(email = "vecino@demo.cl", password = "demo1234", modoRegistro = false) }
        enviar()
    }

    fun onEmailChange(valor: String) = _uiState.update { it.copy(email = valor.trim(), error = null, aviso = null) }

    fun onPasswordChange(valor: String) = _uiState.update { it.copy(password = valor, error = null, aviso = null) }

    fun alternarModo() = _uiState.update { it.copy(modoRegistro = !it.modoRegistro, error = null, aviso = null) }

    fun recuperarPassword() {
        val email = _uiState.value.email
        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            _uiState.update { it.copy(error = "Escribe tu correo arriba y vuelve a tocar «¿Olvidaste tu contraseña?».", aviso = null) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(cargando = true, error = null, aviso = null) }
            try {
                authRepository.enviarCorreoRecuperacion(email)
                _uiState.update {
                    it.copy(cargando = false, aviso = "Te enviamos un correo a $email para crear una nueva contraseña. Revisa también la carpeta de spam.")
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(cargando = false, error = mensajeDeError(e)) }
            }
        }
    }

    fun enviar() {
        val estado = _uiState.value
        val errorValidacion = when {
            !Patterns.EMAIL_ADDRESS.matcher(estado.email).matches() -> "Ingresa un correo válido."
            estado.password.length < 6 -> "La contraseña debe tener al menos 6 caracteres."
            else -> null
        }
        if (errorValidacion != null) {
            _uiState.update { it.copy(error = errorValidacion) }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(cargando = true, error = null, aviso = null) }
            try {
                if (estado.modoRegistro) {
                    authRepository.registrarse(estado.email, estado.password)
                } else {
                    authRepository.iniciarSesion(estado.email, estado.password)
                }
                // La navegación ocurre sola al cambiar el estado de sesión.
                _uiState.update { it.copy(cargando = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(cargando = false, error = mensajeDeError(e)) }
            }
        }
    }

    private fun mensajeDeError(e: Exception): String = when (e) {
        is FirebaseAuthWeakPasswordException -> "La contraseña es muy débil."
        is FirebaseAuthUserCollisionException -> "Ya existe una cuenta con ese correo."
        is FirebaseAuthInvalidUserException,
        is FirebaseAuthInvalidCredentialsException -> "Correo o contraseña incorrectos."
        is FirebaseNetworkException -> "Sin conexión. Revisa tu internet."
        else -> e.localizedMessage ?: "Ocurrió un error inesperado."
    }
}
