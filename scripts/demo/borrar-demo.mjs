// Borra todos los reportes de demo (demo == true), incluido su historial.
import { conectar } from './comun.mjs';

const db = conectar();

const snap = await db.collection('reportes').where('demo', '==', true).get();
for (const d of snap.docs) await db.recursiveDelete(d.ref);
console.log(`Listo: ${snap.size} reportes de demo borrados.`);
