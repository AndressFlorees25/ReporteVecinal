package cl.reportevecinal.app.data.ubicacion

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import cl.reportevecinal.app.data.avisos.PreferenciasAvisos
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await

data class Ubicacion(val lat: Double, val lng: Double, val precisionMetros: Float)

class UbicacionNoDisponibleException(mensaje: String) : Exception(mensaje)

interface UbicacionRepository {
    /** Obtiene la ubicación actual del dispositivo. Requiere permiso de ubicación concedido. */
    suspend fun obtenerUbicacionActual(): Ubicacion
}

/** [preferencias]: recuerda la última ubicación para filtrar los avisos por sector con la app cerrada. */
class FusedUbicacionRepository(
    private val context: Context,
    private val preferencias: PreferenciasAvisos,
) : UbicacionRepository {

    private val cliente = LocationServices.getFusedLocationProviderClient(context)

    @SuppressLint("MissingPermission") // Se verifica explícitamente con tienePermiso().
    override suspend fun obtenerUbicacionActual(): Ubicacion {
        if (!tienePermiso()) throw UbicacionNoDisponibleException("Falta el permiso de ubicación.")

        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        if (!LocationManagerCompat.isLocationEnabled(locationManager)) {
            throw UbicacionNoDisponibleException("Activa la ubicación (GPS) del teléfono.")
        }

        val cancelacion = CancellationTokenSource()
        val ubicacion = try {
            cliente.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancelacion.token).await()
                ?: cliente.lastLocation.await()
        } finally {
            cancelacion.cancel()
        }
        ubicacion ?: throw UbicacionNoDisponibleException("No se pudo obtener la ubicación. Intenta de nuevo.")
        preferencias.guardarUbicacion(ubicacion.latitude, ubicacion.longitude)
        return Ubicacion(ubicacion.latitude, ubicacion.longitude, ubicacion.accuracy)
    }

    private fun tienePermiso() = listOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    ).any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
}
