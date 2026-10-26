package cl.reportevecinal.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ElectricBolt
import androidx.compose.material.icons.filled.Flood
import androidx.compose.material.icons.filled.Forest
import androidx.compose.material.icons.filled.FormatColorReset
import androidx.compose.material.icons.filled.PowerOff
import androidx.compose.material.icons.filled.PriorityHigh
import androidx.compose.material.icons.filled.Roofing
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.Lightbulb
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cl.reportevecinal.app.data.model.Categoria
import cl.reportevecinal.app.data.model.Estado

/** Color asociado a cada categoría (se usa en la lista y en los marcadores del mapa). */
val Categoria.color: Color
    get() = when (this) {
        Categoria.BACHE -> Color(0xFF8D6E63)
        Categoria.LUMINARIA -> Color(0xFFF9A825)
        Categoria.MICROBASURAL -> Color(0xFF2E7D32)
        Categoria.OTRO -> Color(0xFF546E7A)
        Categoria.ANEGAMIENTO -> Color(0xFF0277BD)
        Categoria.ARBOL_CAIDO -> Color(0xFF33691E)
        Categoria.CABLE_CORTADO -> Color(0xFFFF6F00)
        Categoria.ESTRUCTURA_DANADA -> Color(0xFF6D4C41)
        Categoria.CALLE_CORTADA -> Color(0xFFAD1457)
        Categoria.CORTE_AGUA -> Color(0xFF00838F)
        Categoria.CORTE_LUZ -> Color(0xFF4527A0)
    }

val Categoria.icono: ImageVector
    get() = when (this) {
        Categoria.BACHE -> Icons.Filled.Warning
        Categoria.LUMINARIA -> Icons.Filled.Lightbulb
        Categoria.MICROBASURAL -> Icons.Filled.Delete
        Categoria.OTRO -> Icons.AutoMirrored.Filled.HelpOutline
        Categoria.ANEGAMIENTO -> Icons.Filled.Flood
        Categoria.ARBOL_CAIDO -> Icons.Filled.Forest
        Categoria.CABLE_CORTADO -> Icons.Filled.ElectricBolt
        Categoria.ESTRUCTURA_DANADA -> Icons.Filled.Roofing
        Categoria.CALLE_CORTADA -> Icons.Filled.Block
        Categoria.CORTE_AGUA -> Icons.Filled.FormatColorReset
        Categoria.CORTE_LUZ -> Icons.Filled.PowerOff
    }

/** Rojo de emergencia: banner del Modo Emergencia y reportes prioritarios. */
val RojoEmergencia = Color(0xFFC62828)

val Estado.color: Color
    get() = when (this) {
        Estado.RECIBIDO -> Color(0xFF1565C0)
        Estado.ASIGNADO -> Color(0xFFEF6C00)
        Estado.RESUELTO -> Color(0xFF2E7D32)
    }

@Composable
fun EstadoChip(estado: Estado, modifier: Modifier = Modifier) {
    Text(
        text = estado.etiqueta,
        color = Color.White,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = modifier
            .background(estado.color, RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

/** Chip rojo para reportes que el vecino marcó como urgentes. */
@Composable
fun PrioritarioChip(modifier: Modifier = Modifier) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = modifier
            .background(RojoEmergencia, RoundedCornerShape(50))
            .padding(start = 6.dp, end = 10.dp, top = 4.dp, bottom = 4.dp),
    ) {
        Icon(Icons.Filled.PriorityHigh, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
        Text(
            text = "Prioritario",
            color = Color.White,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
        )
    }
}
