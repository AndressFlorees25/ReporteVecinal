package cl.reportevecinal.app.ui.common

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LifecycleResumeEffect

/**
 * Estado de una solicitud de permisos en tiempo de ejecución.
 *
 * Se considera concedido si al menos uno de [permisos] fue otorgado (útil para ubicación, donde
 * basta con la aproximada si el usuario no concede la precisa).
 */
@Stable
class SolicitudPermiso internal constructor(
    private val permisos: List<String>,
    private val context: Context,
) {
    var concedido by mutableStateOf(calcularConcedido())
        private set

    /** El usuario lo rechazó con «No volver a preguntar»: solo se puede activar en Ajustes. */
    var denegadoPermanente by mutableStateOf(false)
        private set

    internal var lanzar: () -> Unit = {}

    fun solicitar() = lanzar()

    fun abrirAjustes() {
        context.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }

    internal fun actualizar() {
        concedido = calcularConcedido()
        if (concedido) denegadoPermanente = false
    }

    internal fun alRechazar() {
        val activity = context.buscarActivity() ?: return
        // Tras un rechazo, si el sistema ya no ofrece mostrar la explicación, el diálogo no volverá a aparecer.
        denegadoPermanente = permisos.none { ActivityCompat.shouldShowRequestPermissionRationale(activity, it) }
    }

    private fun calcularConcedido() = permisos.any {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }
}

@Composable
fun rememberSolicitudPermiso(vararg permisos: String): SolicitudPermiso {
    val context = LocalContext.current
    val solicitud = remember(*permisos) { SolicitudPermiso(permisos.toList(), context) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        solicitud.actualizar()
        if (!solicitud.concedido) solicitud.alRechazar()
    }
    solicitud.lanzar = { launcher.launch(arrayOf(*permisos)) }
    // Al volver de Ajustes (u otra app) se revisa si el permiso cambió.
    LifecycleResumeEffect(solicitud) {
        solicitud.actualizar()
        onPauseOrDispose { }
    }
    return solicitud
}

/** Tarjeta que explica para qué se necesita un permiso y ofrece concederlo o ir a Ajustes. */
@Composable
fun TarjetaPermiso(
    icono: ImageVector,
    titulo: String,
    explicacion: String,
    solicitud: SolicitudPermiso,
    modifier: Modifier = Modifier,
) {
    Card(modifier.fillMaxWidth()) {
        Column(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(icono, contentDescription = null, modifier = Modifier.size(40.dp))
            Text(titulo, style = MaterialTheme.typography.titleMedium)
            Text(explicacion, textAlign = TextAlign.Center, style = MaterialTheme.typography.bodyMedium)
            if (solicitud.denegadoPermanente) {
                Text(
                    "Rechazaste el permiso. Puedes activarlo en Ajustes > Permisos.",
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
                Button(onClick = solicitud::abrirAjustes) { Text("Abrir ajustes") }
            } else {
                Button(onClick = solicitud::solicitar) { Text("Conceder permiso") }
            }
        }
    }
}

private fun Context.buscarActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.buscarActivity()
    else -> null
}
