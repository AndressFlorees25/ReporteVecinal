package cl.reportevecinal.app.ui.misreportes

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Inbox
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import cl.reportevecinal.app.data.model.Reporte
import cl.reportevecinal.app.ui.AppViewModelFactory
import cl.reportevecinal.app.ui.common.EstadoChip
import cl.reportevecinal.app.ui.common.PrioritarioChip
import cl.reportevecinal.app.ui.common.color
import cl.reportevecinal.app.ui.common.icono
import coil.compose.AsyncImage
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MisReportesScreen(
    /** Solo en modo demo: activa o desactiva un Modo Emergencia de prueba. */
    onSimularEmergencia: (() -> Unit)? = null,
    viewModel: MisReportesViewModel = viewModel(factory = AppViewModelFactory.Factory),
) {
    val estado by viewModel.uiState.collectAsStateWithLifecycle()
    val eliminarCuenta by viewModel.eliminarCuenta.collectAsStateWithLifecycle()
    var menuAbierto by remember { mutableStateOf(false) }

    if (eliminarCuenta.visible) {
        DialogoEliminarCuenta(
            estado = eliminarCuenta,
            email = viewModel.emailActual,
            onPasswordChange = viewModel::onPasswordEliminarChange,
            onConfirmar = viewModel::confirmarEliminarCuenta,
            onCancelar = viewModel::ocultarEliminarCuenta,
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Mis reportes") },
                actions = {
                    Box {
                        IconButton(onClick = { menuAbierto = true }) {
                            Icon(Icons.Filled.MoreVert, contentDescription = "Más opciones")
                        }
                        DropdownMenu(expanded = menuAbierto, onDismissRequest = { menuAbierto = false }) {
                            DropdownMenuItem(
                                text = { Text("Cerrar sesión") },
                                leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null) },
                                onClick = {
                                    menuAbierto = false
                                    viewModel.cerrarSesion()
                                },
                            )
                            if (onSimularEmergencia != null) {
                                DropdownMenuItem(
                                    text = { Text("Simular Modo Emergencia (demo)") },
                                    leadingIcon = { Icon(Icons.Filled.Warning, contentDescription = null) },
                                    onClick = {
                                        menuAbierto = false
                                        onSimularEmergencia()
                                    },
                                )
                            }
                            DropdownMenuItem(
                                text = { Text("Eliminar mi cuenta", color = MaterialTheme.colorScheme.error) },
                                leadingIcon = {
                                    Icon(Icons.Filled.PersonRemove, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                                },
                                onClick = {
                                    menuAbierto = false
                                    viewModel.mostrarEliminarCuenta()
                                },
                            )
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
            when (val e = estado) {
                MisReportesUiState.Cargando -> CircularProgressIndicator()
                is MisReportesUiState.Error -> Text(
                    e.mensaje,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.padding(24.dp),
                )
                is MisReportesUiState.Listo ->
                    if (e.reportes.isEmpty()) ListaVacia() else ListaReportes(e.reportes)
            }
        }
    }
}

@Composable
private fun DialogoEliminarCuenta(
    estado: EliminarCuentaUiState,
    email: String?,
    onPasswordChange: (String) -> Unit,
    onConfirmar: () -> Unit,
    onCancelar: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onCancelar,
        icon = { Icon(Icons.Filled.PersonRemove, contentDescription = null) },
        title = { Text("¿Eliminar tu cuenta?") },
        text = {
            Column {
                Text(
                    "Se borrará tu cuenta${email?.let { " ($it)" } ?: ""} y no podrás recuperarla. " +
                        "Tus reportes quedarán anónimos (sin tu nombre ni correo) para que la " +
                        "municipalidad pueda seguir resolviéndolos.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = estado.password,
                    onValueChange = onPasswordChange,
                    label = { Text("Tu contraseña") },
                    singleLine = true,
                    enabled = !estado.eliminando,
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
                estado.error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onConfirmar, enabled = !estado.eliminando) {
                if (estado.eliminando) {
                    CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                } else {
                    Text("Eliminar", color = MaterialTheme.colorScheme.error)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onCancelar, enabled = !estado.eliminando) { Text("Cancelar") }
        },
    )
}

@Composable
private fun ListaVacia() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(32.dp)) {
        Icon(Icons.Filled.Inbox, contentDescription = null, modifier = Modifier.size(64.dp))
        Spacer(Modifier.height(8.dp))
        Text(
            "Aún no has hecho reportes.\nUsa la pestaña «Nuevo» para reportar un problema.",
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ListaReportes(reportes: List<Reporte>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(reportes, key = { it.id }) { ReporteItem(it) }
    }
}

private val formatoFecha = SimpleDateFormat("dd-MM-yyyy HH:mm", Locale.forLanguageTag("es-CL"))

@Composable
private fun ReporteItem(reporte: Reporte) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            val modFoto = Modifier
                .size(72.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.LightGray)
            if (reporte.fotoUrl.isBlank()) {
                // Reportes sin foto (por ejemplo, los de ejemplo del modo demo).
                Box(modFoto, contentAlignment = Alignment.Center) {
                    Icon(reporte.categoria.icono, contentDescription = null, tint = reporte.categoria.color)
                }
            } else {
                AsyncImage(
                    // La miniatura pesa ~20 KB; los reportes antiguos solo tienen la foto completa.
                    model = reporte.miniaturaUrl.ifBlank { reporte.fotoUrl },
                    contentDescription = "Foto del reporte",
                    contentScale = ContentScale.Crop,
                    modifier = modFoto,
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        reporte.categoria.icono,
                        contentDescription = null,
                        tint = reporte.categoria.color,
                        modifier = Modifier.size(18.dp),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(reporte.categoria.etiqueta, style = MaterialTheme.typography.titleSmall)
                }
                if (reporte.descripcion.isNotBlank()) {
                    Text(
                        reporte.descripcion,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    reporte.creadoEn?.let { formatoFecha.format(it) } ?: "Enviando…",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (reporte.apoyos > 0) {
                    Text(
                        if (reporte.apoyos == 1) "A 1 vecino más también le afecta"
                        else "A ${reporte.apoyos} vecinos más también les afecta",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                EstadoChip(reporte.estado)
                if (reporte.prioritario) PrioritarioChip()
            }
        }
    }
}
