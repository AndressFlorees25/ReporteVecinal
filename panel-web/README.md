# Panel municipal — Reporte Vecinal

Panel web para que cada municipalidad gestione los reportes de su comuna.
React + TypeScript + Vite + Firebase (Auth y Firestore).

## Ejecutar en desarrollo

1. Copia `.env.example` como `.env.local` y completa la configuración de la **app web** de Firebase
   (Firebase Console → Configuración del proyecto → Tus apps → App web).
2. `npm install`
3. `npm run dev` y abre la URL que aparece.

## Roles

| Rol | Puede |
|-----|-------|
| Superadmin | Todo, en todas las comunas. Crea comunas. Se crea a mano en Firestore (`funcionarios/{uid}` con `rol: "SUPERADMIN"`, `comunaId: null`, `activo: true`). |
| Admin | Todo en su comuna, incluidos usuarios e invitaciones. |
| Operador | Cambia estados, asigna reportes y comenta. |
| Cuadrilla | Ve sus reportes asignados y los marca como resueltos. |
| Visor | Solo lectura. |

La separación entre comunas la imponen las reglas de Firestore (`../firebase/firestore.rules`),
no solo la interfaz.

## Publicar

`npm run build` y `firebase deploy --only hosting` desde la raíz del repositorio.
