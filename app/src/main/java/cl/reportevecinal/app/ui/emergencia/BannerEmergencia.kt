package cl.reportevecinal.app.ui.emergencia

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cl.reportevecinal.app.data.model.Emergencia
import cl.reportevecinal.app.ui.common.RojoEmergencia

/** Banner rojo con el aviso vigente del Modo Emergencia, sobre todas las pantallas. */
@Composable
fun BannerEmergencia(
    emergencia: Emergencia,
    onReportar: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = modifier
            .fillMaxWidth()
            .background(RojoEmergencia)
            .statusBarsPadding()
            .padding(start = 16.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
    ) {
        Icon(Icons.Filled.Warning, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
        Column(Modifier.weight(1f)) {
            Text(
                text = if (emergencia.comunaNombre.isBlank()) "Modo Emergencia"
                else "Modo Emergencia · ${emergencia.comunaNombre}",
                color = Color.White,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
            )
            if (emergencia.aviso.isNotBlank()) {
                Text(emergencia.aviso, color = Color.White, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (onReportar != null) {
            TextButton(onClick = onReportar) {
                Text("Reportar", color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
    }
}
