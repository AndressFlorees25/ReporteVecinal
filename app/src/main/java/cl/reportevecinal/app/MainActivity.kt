package cl.reportevecinal.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cl.reportevecinal.app.ui.login.LoginScreen
import cl.reportevecinal.app.ui.navigation.AppNavigation
import cl.reportevecinal.app.ui.theme.ReporteVecinalTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val auth = (application as ReporteVecinalApp).container.authRepository
        setContent {
            ReporteVecinalTheme {
                val sesion = remember { auth.observarSesion() }
                val uid by sesion.collectAsStateWithLifecycle(auth.uidActual)
                if (uid == null) LoginScreen() else AppNavigation()
            }
        }
    }
}
