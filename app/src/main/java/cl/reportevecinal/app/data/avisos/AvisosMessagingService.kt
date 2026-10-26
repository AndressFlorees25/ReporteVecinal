package cl.reportevecinal.app.data.avisos

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Recibe los avisos push que publica la Cloud Function `enviarAviso`. Llegan como mensajes de
 * datos (no de notificación) para poder filtrar por sector aquí, incluso con la app cerrada.
 */
class AvisosMessagingService : FirebaseMessagingService() {

    override fun onMessageReceived(mensaje: RemoteMessage) {
        val aviso = Aviso.desdeDatos(mensaje.data) ?: return
        NotificadorAvisos.mostrar(applicationContext, aviso)
    }

    // La app usa temas por comuna (no tokens individuales), así que no hay nada que registrar.
    override fun onNewToken(token: String) = Unit
}
