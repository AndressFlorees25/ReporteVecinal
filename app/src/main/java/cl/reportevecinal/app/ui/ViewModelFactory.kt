package cl.reportevecinal.app.ui

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import cl.reportevecinal.app.AppContainer
import cl.reportevecinal.app.ReporteVecinalApp
import cl.reportevecinal.app.ui.emergencia.EmergenciaViewModel
import cl.reportevecinal.app.ui.login.LoginViewModel
import cl.reportevecinal.app.ui.mapa.MapaViewModel
import cl.reportevecinal.app.ui.misreportes.MisReportesViewModel
import cl.reportevecinal.app.ui.nuevoreporte.NuevoReporteViewModel

/** Crea los ViewModels de la app pasándoles sus dependencias desde [AppContainer]. */
object AppViewModelFactory {
    val Factory: ViewModelProvider.Factory = viewModelFactory {
        initializer { LoginViewModel(container().authRepository, container().modoDemo) }
        initializer {
            MisReportesViewModel(container().authRepository, container().reporteRepository)
        }
        initializer {
            val c = container()
            NuevoReporteViewModel(c.authRepository, c.reporteRepository, c.ubicacionRepository, c.comunaRepository)
        }
        initializer {
            val c = container()
            MapaViewModel(c.ubicacionRepository, c.reporteRepository, c.authRepository)
        }
        initializer {
            val c = container()
            EmergenciaViewModel(
                c.emergenciaRepository,
                c.ubicacionRepository,
                c.comunaRepository,
                c.avisoRepository,
                c.preferenciasAvisos.takeUnless { c.modoDemo },
                c.notificarAviso,
            )
        }
    }

    private fun androidx.lifecycle.viewmodel.CreationExtras.container(): AppContainer =
        (this[APPLICATION_KEY] as ReporteVecinalApp).container
}
