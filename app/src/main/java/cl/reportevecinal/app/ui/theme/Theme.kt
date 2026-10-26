package cl.reportevecinal.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Azul = Color(0xFF1565C0)
private val AzulClaro = Color(0xFF90CAF9)
private val Naranjo = Color(0xFFEF6C00)

private val LightColors = lightColorScheme(primary = Azul, secondary = Naranjo)
private val DarkColors = darkColorScheme(primary = AzulClaro, secondary = Naranjo)

@Composable
fun ReporteVecinalTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
