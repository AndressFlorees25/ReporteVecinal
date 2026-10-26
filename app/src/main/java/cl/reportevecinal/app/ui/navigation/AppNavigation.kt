package cl.reportevecinal.app.ui.navigation

import android.Manifest
import android.os.Build

import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import cl.reportevecinal.app.ui.AppViewModelFactory
import cl.reportevecinal.app.ui.common.rememberSolicitudPermiso
import cl.reportevecinal.app.ui.emergencia.BannerEmergencia
import cl.reportevecinal.app.ui.emergencia.EmergenciaViewModel
import cl.reportevecinal.app.ui.mapa.MapaScreen
import cl.reportevecinal.app.ui.misreportes.MisReportesScreen
import cl.reportevecinal.app.ui.nuevoreporte.NuevoReporteScreen

enum class Destino(val ruta: String, val titulo: String, val icono: ImageVector) {
    MIS_REPORTES("mis_reportes", "Mis reportes", Icons.AutoMirrored.Filled.List),
    NUEVO("nuevo", "Nuevo", Icons.Filled.AddAPhoto),
    MAPA("mapa", "Mapa", Icons.Filled.Map),
}

/**
 * Navegación principal (con sesión iniciada): tres pestañas en la barra inferior y, si la
 * municipalidad activó el Modo Emergencia, el banner rojo con el aviso vigente arriba de todo.
 */
@Composable
fun AppNavigation(
    navController: NavHostController = rememberNavController(),
    // Fuera del NavHost, así queda asociado a la actividad y no se recrea al cambiar de pestaña.
    emergenciaViewModel: EmergenciaViewModel = viewModel(factory = AppViewModelFactory.Factory),
) {
    val entradaActual by navController.currentBackStackEntryAsState()
    val rutaActual = entradaActual?.destination?.route
    val emergencia by emergenciaViewModel.emergencia.collectAsStateWithLifecycle()

    // Desde Android 13 hay que pedir permiso para mostrar los avisos de la municipalidad.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val permisoNotificaciones = rememberSolicitudPermiso(Manifest.permission.POST_NOTIFICATIONS)
        LaunchedEffect(Unit) {
            if (!permisoNotificaciones.concedido) permisoNotificaciones.solicitar()
        }
    }

    Scaffold(
        topBar = {
            emergencia?.let {
                BannerEmergencia(
                    emergencia = it,
                    onReportar = if (rutaActual == Destino.NUEVO.ruta) null else ({ navController.irA(Destino.NUEVO) }),
                )
            }
        },
        bottomBar = {
            NavigationBar {
                Destino.entries.forEach { destino ->
                    NavigationBarItem(
                        selected = rutaActual == destino.ruta,
                        onClick = { navController.irA(destino) },
                        icon = { Icon(destino.icono, contentDescription = null) },
                        label = { Text(destino.titulo) },
                    )
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = Destino.MIS_REPORTES.ruta,
            // consumeWindowInsets evita que las pantallas internas vuelvan a sumar las barras del sistema.
            modifier = Modifier.padding(padding).consumeWindowInsets(padding),
        ) {
            composable(Destino.MIS_REPORTES.ruta) {
                MisReportesScreen(
                    onSimularEmergencia = emergenciaViewModel.takeIf { it.puedeSimular }?.let { it::simularEmergencia },
                )
            }
            composable(Destino.NUEVO.ruta) {
                NuevoReporteScreen(
                    modoEmergencia = emergencia != null,
                    onEnviado = { navController.irA(Destino.MIS_REPORTES) },
                    onUbicacionObtenida = emergenciaViewModel::actualizarComuna,
                )
            }
            composable(Destino.MAPA.ruta) { MapaScreen() }
        }
    }
}

fun NavHostController.irA(destino: Destino) {
    navigate(destino.ruta) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}
