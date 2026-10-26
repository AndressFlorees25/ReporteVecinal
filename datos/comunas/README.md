# Límites de las comunas de Chile

Un archivo GeoJSON por comuna (345 comunas, 16 regiones), listo para cargar desde el panel de
superadmin (**Comunas → Agregar comuna**):

```
datos/comunas/<código región>-<región>/<código CUT>-<comuna>.geojson
```

Ejemplos: `13-metropolitana-de-santiago/13131-san-ramon.geojson`,
`13-metropolitana-de-santiago/13111-la-granja.geojson`.

Cada archivo es un `Feature` (Polygon o MultiPolygon, grados WGS84) con estas propiedades, que el
panel completa solo en el formulario:

| Propiedad | Ejemplo                       |
|-----------|-------------------------------|
| `id`      | `13131` (código CUT)          |
| `nombre`  | `San Ramon`                   |
| `region`  | `Metropolitana de Santiago`   |

Los nombres vienen sin tildes desde la fuente; se pueden corregir en el formulario antes de crear
la comuna (por ejemplo «San Ramón»).

## Fuente y procesamiento

- Límites y códigos: INE / SUBDERE, publicados en el paquete
  [chilemapas](https://github.com/pachadotdev/chilemapas) (licencia Apache-2.0).
- Coordenadas redondeadas a 5 decimales (~1 m).
- Natales, Punta Arenas y Cabo de Hornos (miles de islas y fiordos) se simplificaron a 2 decimales
  (~1 km) para caber en un documento de Firestore (límite 1 MiB).
- No incluye la Antártica Chilena (12202), que no tiene límite en la fuente.
