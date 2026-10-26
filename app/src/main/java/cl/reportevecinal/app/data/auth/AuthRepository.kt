package cl.reportevecinal.app.data.auth

import com.google.firebase.auth.EmailAuthProvider
import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

interface AuthRepository {
    /** UID del usuario con sesión iniciada, o null si no hay sesión. */
    val uidActual: String?

    /** Correo del usuario con sesión iniciada, o null si no hay sesión. */
    val emailActual: String?

    /** Emite el UID actual cada vez que cambia el estado de sesión. */
    fun observarSesion(): Flow<String?>

    suspend fun iniciarSesion(email: String, password: String)
    suspend fun registrarse(email: String, password: String)
    suspend fun enviarCorreoRecuperacion(email: String)

    /** Confirma la contraseña del usuario actual (Firebase exige un inicio de sesión reciente para borrar la cuenta). */
    suspend fun reautenticar(password: String)

    /** Elimina la cuenta del usuario actual; la sesión se cierra sola. */
    suspend fun eliminarCuenta()

    fun cerrarSesion()
}

class FirebaseAuthRepository(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) : AuthRepository {

    override val uidActual: String?
        get() = auth.currentUser?.uid

    override val emailActual: String?
        get() = auth.currentUser?.email

    override fun observarSesion(): Flow<String?> = callbackFlow {
        val listener = FirebaseAuth.AuthStateListener { trySend(it.currentUser?.uid) }
        auth.addAuthStateListener(listener)
        awaitClose { auth.removeAuthStateListener(listener) }
    }

    override suspend fun iniciarSesion(email: String, password: String) {
        auth.signInWithEmailAndPassword(email, password).await()
    }

    override suspend fun registrarse(email: String, password: String) {
        auth.createUserWithEmailAndPassword(email, password).await()
    }

    override suspend fun enviarCorreoRecuperacion(email: String) {
        auth.setLanguageCode("es")
        auth.sendPasswordResetEmail(email).await()
    }

    override suspend fun reautenticar(password: String) {
        val usuario = checkNotNull(auth.currentUser) { "No hay sesión iniciada." }
        val correo = checkNotNull(usuario.email) { "La cuenta no tiene correo." }
        usuario.reauthenticate(EmailAuthProvider.getCredential(correo, password)).await()
    }

    override suspend fun eliminarCuenta() {
        checkNotNull(auth.currentUser) { "No hay sesión iniciada." }.delete().await()
    }

    override fun cerrarSesion() = auth.signOut()
}
