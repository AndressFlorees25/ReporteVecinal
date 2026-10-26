package cl.reportevecinal.app.data.model

import java.util.Date

/** [emergencia]: categorías para tormentas, lluvias fuertes o cortes de servicios (Modo Emergencia). */
enum class Categoria(val etiqueta: String, val emergencia: Boolean = false) {
    BACHE("Socavón / bache"),
    LUMINARIA("Luminaria apagada"),
    MICROBASURAL("Microbasural"),
    OTRO("Otro"),
    ANEGAMIENTO("Anegamiento", emergencia = true),
    ARBOL_CAIDO("Árbol caído", emergencia = true),
    CABLE_CORTADO("Cable eléctrico cortado", emergencia = true),
    ESTRUCTURA_DANADA("Techo / estructura dañada", emergencia = true),
    CALLE_CORTADA("Calle cortada", emergencia = true),
    CORTE_AGUA("Corte de agua", emergencia = true),
    CORTE_LUZ("Corte de luz", emergencia = true),
}

enum class Estado(val etiqueta: String) {
    RECIBIDO("Recibido"),
    ASIGNADO("Asignado"),
    RESUELTO("Resuelto"),
}

enum class MotivoDenuncia(val etiqueta: String) {
    FALSO("Es falso o no existe"),
    OFENSIVO("Es ofensivo o spam"),
    DATOS_PERSONALES("Muestra personas, patentes u otros datos personales"),
    OTRO("Otro motivo"),
}

data class Reporte(
    val id: String = "",
    val uid: String = "",
    val comunaId: String = "",
    val categoria: Categoria = Categoria.OTRO,
    val descripcion: String = "",
    val fotoUrl: String = "",
    val miniaturaUrl: String = "",
    val lat: Double = 0.0,
    val lng: Double = 0.0,
    val geohash: String = "",
    val estado: Estado = Estado.RECIBIDO,
    val creadoEn: Date? = null,
    /** Vecinos que marcaron «A mí también me afecta». */
    val apoyos: Int = 0,
    val personasEnRiesgo: Boolean = false,
    val afectaVivienda: Boolean = false,
) {
    /** Marcado como urgente por el vecino: la municipalidad lo atiende primero. */
    val prioritario: Boolean get() = personasEnRiesgo || afectaVivienda
}

/** Modo Emergencia activado por la municipalidad en una comuna, con el aviso vigente para los vecinos. */
data class Emergencia(
    val comunaId: String,
    val comunaNombre: String,
    val aviso: String,
    val actualizadoEn: Date? = null,
)
