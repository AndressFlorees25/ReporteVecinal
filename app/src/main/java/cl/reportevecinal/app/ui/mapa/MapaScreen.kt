package cl.reportevecinal.app.ui.mapa

import android.Manifest
import android.content.Context
import android.graphics.drawable.Drawable
import androidx.compose.foundation.background
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.LocationOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ThumbUp
import androidx.compose.material.icons.outlined.ThumbUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import cl.reportevecinal.app.R
import cl.reportevecinal.app.data.model.Categoria
import cl.reportevecinal.app.data.model.MotivoDenuncia
import cl.reportevecinal.app.data.model.Reporte
import cl.reportevecinal.app.ui.AppViewModelFactory
import cl.reportevecinal.app.ui.common.EstadoChip
import cl.reportevecinal.app.ui.common.TarjetaPermiso
import cl.reportevecinal.app.ui.common.PrioritarioChip
import cl.reportevecinal.app.ui.common.color
import cl.reportevecinal.app.ui.common.icono
import cl.reportevecinal.app.ui.common.rememberSolicitudPermiso
import coil.compose.AsyncImage
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon

private const val ZOOM_INICIAL = 15.0

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapaScreen(viewModel: MapaViewModel = viewModel(factory = AppViewModelFactory.Factory)) {
    val estado by viewModel.uiState.collectAsStateWithLifecycle()
    val permisoUbicacion = rememberSolicitudPermiso(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    )
    LaunchedEffect(permisoUbicacion.concedido) {
        if (permisoUbicacion.concedido && estado.centro == null) viewModel.cargar()
    }
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(estado.mensajeDenuncia) {
        estado.mensajeDenuncia?.let {
            viewModel.mensajeDenunciaMostrado()
            snackbar.showSnackbar(it)
        }
    }
    var reporteADenunciar by remember { mutableStateOf<Reporte?>(null) }
    reporteADenunciar?.let { reporte ->
        DialogoDenuncia(
            onEnviar = { motivo ->
                reporteADenunciar = null
                viewModel.denunciar(reporte, motivo)
            },
            onCancelar = { reporteADenunciar = null },
        )
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("Reportes cercanos") }) },
        snackbarHost = { SnackbarHost(snackbar) },
        floatingActionButton = {
            // Se oculta mientras se ve la tarjeta de un reporte, para no taparla.
            if (permisoUbicacion.concedido && estado.seleccionado == null) {
                FloatingActionButton(onClick = { if (!estado.cargando) viewModel.cargar() }) {
                    if (estado.cargando) {
                        CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Filled.Refresh, contentDescription = "Actualizar")
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (!permisoUbicacion.concedido) {
                TarjetaPermiso(
                    icono = Icons.Filled.LocationOff,
                    titulo = "Acceso a tu ubicación",
                    explicacion = "Para mostrarte los reportes cercanos necesitamos saber dónde estás.",
                    solicitud = permisoUbicacion,
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                )
                return@Box
            }

            MapaOsm(estado, onSeleccionar = viewModel::seleccionar, modifier = Modifier.fillMaxSize())

            estado.seleccionado?.let { reporte ->
                TarjetaReporte(
                    reporte = reporte,
                    esPropio = viewModel.esPropio(reporte),
                    yaApoyo = estado.yaApoyo,
                    cambiandoApoyo = estado.cambiandoApoyo,
                    denunciando = estado.denunciando,
                    onApoyar = viewModel::alternarApoyo,
                    onDenunciar = { reporteADenunciar = reporte },
                    onCerrar = { viewModel.seleccionar(null) },
                    modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                )
            }

            Column(
                Modifier.align(Alignment.TopCenter).padding(12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Leyenda()
                val mensaje = when {
                    estado.error != null -> estado.error
                    estado.centro == null -> "Obteniendo tu ubicación…"
                    !estado.cargando && estado.reportes.isEmpty() -> "No hay reportes activos en 2 km a la redonda."
                    else -> null
                }
                mensaje?.let { Aviso(it, esError = estado.error != null) }
            }
        }
    }
}

@Composable
private fun TarjetaReporte(
    reporte: Reporte,
    esPropio: Boolean,
    yaApoyo: Boolean?,
    cambiandoApoyo: Boolean,
    denunciando: Boolean,
    onApoyar: () -> Unit,
    onDenunciar: () -> Unit,
    onCerrar: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Card(modifier.fillMaxWidth(), elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            val miniatura = reporte.miniaturaUrl.ifBlank { reporte.fotoUrl }
            if (miniatura.isNotBlank()) {
                AsyncImage(
                    model = miniatura,
                    contentDescription = "Foto del reporte",
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)),
                )
                Spacer(Modifier.width(12.dp))
            }
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(reporte.categoria.icono, contentDescription = null, tint = reporte.categoria.color, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(reporte.categoria.etiqueta, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    EstadoChip(reporte.estado)
                }
                if (reporte.prioritario) PrioritarioChip(Modifier.padding(top = 4.dp))
                if (reporte.descripcion.isNotBlank()) {
                    Text(
                        reporte.descripcion,
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    textoApoyos(reporte.apoyos, esPropio),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!esPropio) {
                    val apoyado = yaApoyo == true
                    val modificador = Modifier.fillMaxWidth()
                    val contenido: @Composable RowScope.() -> Unit = {
                        Icon(
                            if (apoyado) Icons.Filled.ThumbUp else Icons.Outlined.ThumbUp,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(8.dp))
                        Text(if (apoyado) "Te afecta · Quitar" else "A mí también me afecta")
                    }
                    val habilitado = yaApoyo != null && !cambiandoApoyo
                    if (apoyado) {
                        OutlinedButton(onClick = onApoyar, enabled = habilitado, modifier = modificador, content = contenido)
                    } else {
                        Button(onClick = onApoyar, enabled = habilitado, modifier = modificador, content = contenido)
                    }
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    if (!esPropio) {
                        TextButton(onClick = onDenunciar, enabled = !denunciando) {
                            Icon(Icons.Filled.Flag, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Denunciar")
                        }
                    }
                    TextButton(onClick = onCerrar) { Text("Cerrar") }
                }
            }
        }
    }
}

private fun textoApoyos(apoyos: Int, esPropio: Boolean): String = when {
    apoyos == 0 && esPropio -> "Tu reporte · aún nadie más lo ha apoyado"
    apoyos == 0 -> "Sé el primero en decir que también te afecta"
    apoyos == 1 -> "A 1 vecino más también le afecta"
    else -> "A $apoyos vecinos más también les afecta"
}

@Composable
private fun DialogoDenuncia(onEnviar: (MotivoDenuncia) -> Unit, onCancelar: () -> Unit) {
    var motivo by remember { mutableStateOf<MotivoDenuncia?>(null) }
    AlertDialog(
        onDismissRequest = onCancelar,
        icon = { Icon(Icons.Filled.Flag, contentDescription = null) },
        title = { Text("Denunciar reporte") },
        text = {
            Column(Modifier.selectableGroup()) {
                Text("¿Qué problema tiene este reporte?", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(8.dp))
                MotivoDenuncia.entries.forEach { opcion ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(selected = motivo == opcion, onClick = { motivo = opcion }, role = Role.RadioButton)
                            .padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = motivo == opcion, onClick = null)
                        Spacer(Modifier.width(8.dp))
                        Text(opcion.etiqueta, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { motivo?.let(onEnviar) }, enabled = motivo != null) { Text("Enviar") }
        },
        dismissButton = { TextButton(onClick = onCancelar) { Text("Cancelar") } },
    )
}

@Composable
private fun MapaOsm(estado: MapaUiState, onSeleccionar: (Reporte) -> Unit, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(org.osmdroid.views.CustomZoomButtonsController.Visibility.NEVER)
            controller.setZoom(ZOOM_INICIAL)
        }
    }
    // osmdroid necesita que se le avise de onResume/onPause para manejar su caché de teselas.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, evento ->
            when (evento) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onDetach()
        }
    }

    // Centrar el mapa solo cuando cambia la ubicación, para no pisar el zoom/desplazamiento del usuario.
    LaunchedEffect(estado.centro) {
        estado.centro?.let { mapView.controller.animateTo(GeoPoint(it.lat, it.lng)) }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier,
        update = { mapa -> dibujarCapas(mapa, context, estado, onSeleccionar) },
    )
}

private fun dibujarCapas(mapa: MapView, context: Context, estado: MapaUiState, onSeleccionar: (Reporte) -> Unit) {
    mapa.overlays.clear()
    val centro = estado.centro
    if (centro != null) {
        val punto = GeoPoint(centro.lat, centro.lng)
        // Círculo del radio de búsqueda.
        mapa.overlays += Polygon(mapa).apply {
            points = Polygon.pointsAsCircle(punto, MapaViewModel.RADIO_METROS)
            fillPaint.color = 0x141565C0
            outlinePaint.color = 0x661565C0
            outlinePaint.strokeWidth = 3f
        }
        mapa.overlays += Marker(mapa).apply {
            position = punto
            icon = ContextCompat.getDrawable(context, R.drawable.ic_mi_ubicacion)
            setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
            title = "Estás aquí"
        }
    }
    estado.reportes.forEach { reporte -> mapa.overlays += marcadorReporte(mapa, context, reporte, onSeleccionar) }
    mapa.invalidate()
}

private fun marcadorReporte(
    mapa: MapView,
    context: Context,
    reporte: Reporte,
    onSeleccionar: (Reporte) -> Unit,
) = Marker(mapa).apply {
    position = GeoPoint(reporte.lat, reporte.lng)
    icon = pinDeColor(context, reporte.categoria)
    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
    // En vez de la burbuja de osmdroid, el detalle se muestra en una tarjeta de Compose.
    setOnMarkerClickListener { _, _ ->
        onSeleccionar(reporte)
        true
    }
}

private fun pinDeColor(context: Context, categoria: Categoria): Drawable? =
    ContextCompat.getDrawable(context, R.drawable.ic_pin)?.mutate()?.apply {
        setTint(categoria.color.toArgb())
    }

@Composable
private fun Leyenda() {
    // Con las categorías de emergencia ya no caben todas: la leyenda se desliza de lado.
    Row(
        Modifier
            .horizontalScroll(rememberScrollState())
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.92f), RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Categoria.entries.forEach { categoria ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(10.dp).background(categoria.color, CircleShape))
                Spacer(Modifier.width(4.dp))
                Text(categoria.etiqueta.substringBefore(" /"), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun Aviso(texto: String, esError: Boolean) {
    Text(
        texto,
        color = if (esError) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onSurface,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier
            .background(
                if (esError) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.surface.copy(alpha = 0.92f),
                RoundedCornerShape(12.dp),
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
    )
}
