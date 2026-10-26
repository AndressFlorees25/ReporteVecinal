# Reglas de R8 para la versión release.
# Firebase, CameraX, Coil y osmdroid traen sus propias reglas; la app no usa reflexión
# (los documentos de Firestore se convierten a mano en ReporteRepository).

# Mantiene números de línea legibles en los informes de errores de Play Console.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# osmdroid referencia clases opcionales que la app no incluye.
-dontwarn org.osmdroid.**
