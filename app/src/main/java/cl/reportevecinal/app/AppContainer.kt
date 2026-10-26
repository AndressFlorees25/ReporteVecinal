package cl.reportevecinal.app

import android.app.Application
import android.content.Context
import cl.reportevecinal.app.data.auth.AuthRepository
import cl.reportevecinal.app.data.avisos.Aviso
import cl.reportevecinal.app.data.avisos.AvisoRepository
import cl.reportevecinal.app.data.avisos.FirestoreAvisoRepository
import cl.reportevecinal.app.data.avisos.NotificadorAvisos
import cl.reportevecinal.app.data.avisos.PreferenciasAvisos
import cl.reportevecinal.app.data.auth.FirebaseAuthRepository
import cl.reportevecinal.app.data.comunas.ComunaRepository
import cl.reportevecinal.app.data.comunas.DemoComunaRepository
import cl.reportevecinal.app.data.comunas.FirestoreComunaRepository
import cl.reportevecinal.app.data.demo.DemoAuthRepository
import cl.reportevecinal.app.data.demo.DemoReporteRepository
import cl.reportevecinal.app.data.emergencias.DemoEmergenciaRepository
import cl.reportevecinal.app.data.emergencias.EmergenciaRepository
import cl.reportevecinal.app.data.emergencias.FirestoreEmergenciaRepository
import cl.reportevecinal.app.data.photos.FirebaseStoragePhotoRepository
import cl.reportevecinal.app.data.photos.LocalPhotoRepository
import cl.reportevecinal.app.data.photos.PhotoRepository
import cl.reportevecinal.app.data.reportes.FirestoreReporteRepository
import cl.reportevecinal.app.data.reportes.ReporteRepository
import cl.reportevecinal.app.data.ubicacion.FusedUbicacionRepository
import cl.reportevecinal.app.data.ubicacion.UbicacionRepository
import com.google.firebase.FirebaseApp
import kotlinx.coroutines.flow.emptyFlow
import org.osmdroid.config.Configuration

/** Inyección de dependencias manual: aquí se eligen las implementaciones de cada repositorio. */
class AppContainer(context: Context) {

    /**
     * Modo demo: datos en memoria y usuario ficticio, sin Firebase. Se activa solo mientras
     * app/google-services.json sea el archivo de ejemplo del repositorio.
     */
    val modoDemo: Boolean = runCatching {
        FirebaseApp.getInstance().options.projectId == PROYECTO_EJEMPLO
    }.getOrDefault(true)

    val authRepository: AuthRepository by lazy {
        if (modoDemo) DemoAuthRepository() else FirebaseAuthRepository()
    }

    // Para cambiar el servicio de fotos, reemplaza esta implementación.
    val photoRepository: PhotoRepository by lazy {
        if (modoDemo || !SUBIR_FOTOS_A_STORAGE) LocalPhotoRepository(context)
        else FirebaseStoragePhotoRepository(context)
    }

    val reporteRepository: ReporteRepository by lazy {
        if (modoDemo) DemoReporteRepository(photoRepository) else FirestoreReporteRepository(photoRepository)
    }

    val preferenciasAvisos: PreferenciasAvisos by lazy { PreferenciasAvisos(context) }

    val ubicacionRepository: UbicacionRepository by lazy { FusedUbicacionRepository(context, preferenciasAvisos) }

    /** En modo demo no hay avisos reales; se simulan junto con el Modo Emergencia. */
    val avisoRepository: AvisoRepository by lazy {
        if (modoDemo) AvisoRepository { emptyFlow() } else FirestoreAvisoRepository()
    }

    val notificarAviso: (Aviso) -> Unit = { NotificadorAvisos.mostrar(context, it) }

    val comunaRepository: ComunaRepository by lazy {
        if (modoDemo) DemoComunaRepository() else FirestoreComunaRepository()
    }

    val emergenciaRepository: EmergenciaRepository by lazy {
        if (modoDemo) DemoEmergenciaRepository() else FirestoreEmergenciaRepository()
    }

    private companion object {
        const val PROYECTO_EJEMPLO = "reportevecinal-ejemplo"

        /**
         * false: las fotos se guardan solo en el teléfono (Firebase Storage aún no está activado,
         * porque requiere el plan Blaze). Cambiar a true cuando Storage esté listo.
         */
        const val SUBIR_FOTOS_A_STORAGE = false
    }
}

class ReporteVecinalApp : Application() {
    val container by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        // La política de uso de los servidores de OpenStreetMap exige un User-Agent que identifique la app.
        Configuration.getInstance().apply {
            load(this@ReporteVecinalApp, getSharedPreferences("osmdroid", MODE_PRIVATE))
            userAgentValue = packageName
        }
    }
}
