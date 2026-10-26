package cl.reportevecinal.app.data.comunas

import org.json.JSONArray
import org.json.JSONObject

/** Anillo de coordenadas como pares (lng, lat), igual que en GeoJSON. */
typealias Anillo = List<DoubleArray>

/** Polígono GeoJSON: el primer anillo es el borde exterior y los siguientes son agujeros. */
class Poligono(private val anillos: List<Anillo>) {

    fun contiene(lat: Double, lng: Double): Boolean {
        if (anillos.isEmpty() || !Geometria.dentroDeAnillo(lng, lat, anillos[0])) return false
        return anillos.drop(1).none { Geometria.dentroDeAnillo(lng, lat, it) }
    }
}

object Geometria {

    /** Convierte una geometría GeoJSON (Polygon o MultiPolygon, o un Feature que la contenga). */
    fun desdeGeoJson(texto: String): List<Poligono> {
        var json = JSONObject(texto)
        if (json.optString("type") == "Feature") json = json.getJSONObject("geometry")
        val coordenadas = json.getJSONArray("coordinates")
        return when (json.getString("type")) {
            "Polygon" -> listOf(poligono(coordenadas))
            "MultiPolygon" -> List(coordenadas.length()) { poligono(coordenadas.getJSONArray(it)) }
            else -> error("Geometría no soportada: ${json.getString("type")}")
        }
    }

    /** Algoritmo de ray casting: cuenta cuántos bordes cruza un rayo horizontal desde el punto. */
    fun dentroDeAnillo(x: Double, y: Double, anillo: Anillo): Boolean {
        var dentro = false
        var j = anillo.lastIndex
        for (i in anillo.indices) {
            val (xi, yi) = anillo[i].let { it[0] to it[1] }
            val (xj, yj) = anillo[j].let { it[0] to it[1] }
            if ((yi > y) != (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro
            j = i
        }
        return dentro
    }

    private fun poligono(anillos: JSONArray): Poligono = Poligono(
        List(anillos.length()) { a ->
            val anillo = anillos.getJSONArray(a)
            List(anillo.length()) { p ->
                val punto = anillo.getJSONArray(p)
                doubleArrayOf(punto.getDouble(0), punto.getDouble(1))
            }
        }
    )
}
