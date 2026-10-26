package cl.reportevecinal.app.ui.nuevoreporte

import android.Manifest
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Surface
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import cl.reportevecinal.app.data.model.Categoria
import cl.reportevecinal.app.ui.AppViewModelFactory
import cl.reportevecinal.app.ui.common.RojoEmergencia
import cl.reportevecinal.app.ui.common.TarjetaPermiso
import cl.reportevecinal.app.ui.common.icono
import cl.reportevecinal.app.ui.common.rememberSolicitudPermiso
import coil.compose.AsyncImage
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun NuevoReporteScreen(
    onEnviado: () -> Unit,
    /** Con el Modo Emergencia activo, las categorías de emergencia van primero. */
    modoEmergencia: Boolean = false,
    onUbicacionObtenida: () -> Unit = {},
    viewModel: NuevoReporteViewModel = viewModel(factory = AppViewModelFactory.Factory),
) {
    val estado by viewModel.uiState.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current

    val permisoCamara = rememberSolicitudPermiso(Manifest.permission.CAMERA)
    val permisoUbicacion = rememberSolicitudPermiso(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    )

    // La ubicación se pide automáticamente al abrir la pantalla (una sola vez).
    var ubicacionSolicitada by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        if (!permisoUbicacion.concedido && !ubicacionSolicitada) {
            ubicacionSolicitada = true
            permisoUbicacion.solicitar()
        }
    }
    LaunchedEffect(permisoUbicacion.concedido) {
        if (permisoUbicacion.concedido) {
            viewModel.obtenerUbicacion()
            onUbicacionObtenida()
        }
    }
    LaunchedEffect(Unit) {
        viewModel.enviado.collect {
            // Toast (y no snackbar) porque la pantalla se cierra al volver a «Mis reportes».
            Toast.makeText(context, "¡Reporte enviado! Gracias por avisar.", Toast.LENGTH_LONG).show()
            onEnviado()
        }
    }
    LaunchedEffect(estado.error) {
        estado.error?.let { snackbar.showSnackbar(it) }
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Nuevo reporte") }) },
        snackbarHost = { SnackbarHost(snackbar) },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // 1. Foto
            Seccion("1. Foto del problema")
            val modFoto = Modifier
                .fillMaxWidth()
                .aspectRatio(3f / 4f)
                .clip(RoundedCornerShape(12.dp))
            when {
                estado.foto != null -> Box(modFoto) {
                    AsyncImage(
                        model = estado.foto,
                        contentDescription = "Foto tomada",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.matchParentSize(),
                    )
                    OutlinedButton(
                        onClick = viewModel::descartarFoto,
                        enabled = !estado.enviando,
                        modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                    ) { Text("Tomar otra") }
                }
                permisoCamara.concedido -> CamaraCaptura(
                    onFotoTomada = viewModel::onFotoTomada,
                    onError = viewModel::onErrorCamara,
                    modifier = modFoto,
                )
                else -> TarjetaPermiso(
                    icono = Icons.Filled.PhotoCamera,
                    titulo = "Acceso a la cámara",
                    explicacion = "Necesitamos la cámara para que tomes una foto del problema que quieres reportar.",
                    solicitud = permisoCamara,
                )
            }

            // 2. Ubicación
            Seccion("2. Ubicación")
            if (permisoUbicacion.concedido) {
                FilaUbicacion(estado, onReintentar = { viewModel.obtenerUbicacion(forzar = true) })
            } else {
                TarjetaPermiso(
                    icono = Icons.Filled.LocationOff,
                    titulo = "Acceso a tu ubicación",
                    explicacion = "Usamos el GPS para registrar automáticamente dónde está el problema. " +
                        "Así la municipalidad puede encontrarlo.",
                    solicitud = permisoUbicacion,
                )
            }

            // 3. Categoría
            Seccion("3. Categoría")
            val (emergencias, habituales) = Categoria.entries.partition { it.emergencia }
            val grupos = listOf("Emergencia" to emergencias, "Problemas del barrio" to habituales)
            (if (modoEmergencia) grupos else grupos.reversed()).forEach { (titulo, categorias) ->
                Text(
                    titulo,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (categorias === emergencias) RojoEmergencia else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                FilaCategorias(categorias, estado.categoria, viewModel::onCategoria)
            }

            // 4. Urgencia
            Seccion("4. ¿Es urgente?")
            OpcionUrgencia(
                texto = "Hay personas en riesgo",
                marcado = estado.personasEnRiesgo,
                onCambio = viewModel::onPersonasEnRiesgo,
            )
            OpcionUrgencia(
                texto = "Afecta mi vivienda",
                marcado = estado.afectaVivienda,
                onCambio = viewModel::onAfectaVivienda,
            )
            if (estado.personasEnRiesgo || estado.afectaVivienda) {
                Text(
                    "Tu reporte quedará como prioritario para la municipalidad. " +
                        "Si hay riesgo de vida, llama primero al 131 (SAMU), 132 (Bomberos) o 133 (Carabineros).",
                    style = MaterialTheme.typography.bodySmall,
                    color = RojoEmergencia,
                )
            }

            // 5. Descripción
            Seccion("5. Descripción (opcional)")
            OutlinedTextField(
                value = estado.descripcion,
                onValueChange = viewModel::onDescripcion,
                placeholder = { Text("Ej: bache grande frente al número 123, peligroso para ciclistas") },
                supportingText = { Text("${estado.descripcion.length}/${NuevoReporteViewModel.MAX_DESCRIPCION}") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )

            Button(
                onClick = viewModel::enviar,
                enabled = estado.puedeEnviar,
                modifier = Modifier.fillMaxWidth().height(52.dp),
            ) {
                if (estado.enviando) {
                    CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(12.dp))
                    Text("Enviando…")
                } else {
                    Text("Enviar reporte")
                }
            }
            if (!estado.puedeEnviar && !estado.enviando) {
                Text(
                    "Para enviar necesitas una foto, una ubicación dentro de una comuna adherida y una categoría.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FilaCategorias(categorias: List<Categoria>, seleccionada: Categoria?, onCategoria: (Categoria) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        categorias.forEach { categoria ->
            FilterChip(
                selected = seleccionada == categoria,
                onClick = { onCategoria(categoria) },
                label = { Text(categoria.etiqueta) },
                leadingIcon = { Icon(categoria.icono, contentDescription = null, modifier = Modifier.size(18.dp)) },
            )
        }
    }
}

@Composable
private fun OpcionUrgencia(texto: String, marcado: Boolean, onCambio: (Boolean) -> Unit) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = if (marcado) RojoEmergencia.copy(alpha = 0.12f) else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier
            .fillMaxWidth()
            .toggleable(value = marcado, onValueChange = onCambio, role = Role.Checkbox),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 16.dp)) {
            // El clic lo maneja toda la fila (toggleable), por eso el checkbox no tiene onCheckedChange.
            Checkbox(checked = marcado, onCheckedChange = null, modifier = Modifier.padding(12.dp))
            Text(texto, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun Seccion(titulo: String) {
    Text(titulo, style = MaterialTheme.typography.titleMedium)
}

@Composable
private fun FilaUbicacion(estado: NuevoReporteUiState, onReintentar: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        when {
            estado.buscandoUbicacion -> {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(8.dp))
                Text("Obteniendo ubicación…", Modifier.weight(1f))
            }
            estado.ubicacion != null -> {
                Icon(Icons.Filled.LocationOn, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                val u = estado.ubicacion
                Column(Modifier.weight(1f)) {
                    Text(String.format(Locale.US, "%.5f, %.5f  (±%.0f m)", u.lat, u.lng, u.precisionMetros))
                    when {
                        estado.comuna != null -> Text(
                            "Comuna: ${estado.comuna.nombre}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        estado.sinCobertura -> Text(
                            "Esta ubicación no está en una comuna que use Reporte Vecinal, " +
                                "así que el reporte no se puede enviar.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
            else -> {
                Icon(Icons.Filled.LocationOff, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Spacer(Modifier.width(8.dp))
                Text(
                    estado.errorUbicacion ?: "Ubicación no disponible.",
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.weight(1f),
                )
            }
        }
        IconButton(onClick = onReintentar, enabled = !estado.buscandoUbicacion) {
            Icon(Icons.Filled.Refresh, contentDescription = "Actualizar ubicación")
        }
    }
}
