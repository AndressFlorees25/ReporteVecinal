// Carga ~30 reportes de ejemplo en La Granja, con historial y fechas repartidas en 45 días,
// para que la lista, el mapa y el dashboard del panel se vean con datos en una demo.
// Todos quedan marcados con `demo: true`; se borran con `npm run borrar`.
import { Timestamp } from 'firebase-admin/firestore';
import { COMUNA_ID, conectar, dentro, geohash, poligonoComuna } from './comun.mjs';

const db = conectar();
const DIA = 24 * 60 * 60 * 1000;

// Aleatorio con semilla, para que cada carga sea igual.
let semilla = 13111;
const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

const DESCRIPCIONES = {
  BACHE: [
    'Bache grande en la calzada, los autos lo esquivan por la pista contraria.',
    'Socavón al lado del paradero, se llena de agua cuando llueve.',
    'Hoyo profundo frente al pasaje, ya se cayó un ciclista.',
    'Pavimento hundido en la esquina, peligroso para las micros.',
    'Varios baches seguidos en la cuadra, la calle está muy deteriorada.',
  ],
  LUMINARIA: [
    'Luminaria apagada hace dos semanas, la esquina queda muy oscura.',
    'Poste sin luz frente a la plaza, los vecinos tienen miedo de pasar de noche.',
    'Foco que prende y se apaga toda la noche.',
    'Tres luminarias seguidas apagadas en el pasaje.',
  ],
  MICROBASURAL: [
    'Microbasural en el sitio eriazo, botan escombros y colchones.',
    'Acumulación de basura en la esquina, hay ratones.',
    'Están botando escombros al lado de la cancha.',
    'Bolsas de basura acumuladas junto al bandejón central.',
  ],
  OTRO: [
    'Tapa de alcantarilla suelta en la vereda.',
    'Árbol con ramas caídas sobre el cableado.',
    'Señal de pare caída en la esquina.',
  ],
};
const COMENTARIOS_CIERRE = [
  'Reparado por la cuadrilla.', 'Se cambió la ampolleta.', 'Retirado con camión tolva.', 'Trabajo terminado, se dejó señalizado.',
];

function puntoAlAzar(anillo) {
  const lngs = anillo.map((p) => p[0]), lats = anillo.map((p) => p[1]);
  for (;;) {
    const p = [Math.min(...lngs) + azar() * (Math.max(...lngs) - Math.min(...lngs)),
      Math.min(...lats) + azar() * (Math.max(...lats) - Math.min(...lats))];
    if (dentro(p, anillo)) return p;
  }
}

async function main() {
  const comuna = await db.doc(`comunas/${COMUNA_ID}`).get();
  if (!comuna.exists || comuna.data().activa !== true) {
    console.error('La comuna La Granja (13111) no existe o no está activa. Cárgala y actívala desde el panel primero.');
    process.exit(1);
  }

  const funcionarios = (await db.collection('funcionarios').where('comunaId', '==', COMUNA_ID).get())
    .docs.map((d) => ({ uid: d.id, ...d.data() })).filter((f) => f.activo);
  const gestor = funcionarios.find((f) => f.rol === 'OPERADOR') ?? funcionarios.find((f) => f.rol === 'ADMIN');
  const cuadrilla = funcionarios.find((f) => f.rol === 'CUADRILLA') ?? gestor;
  const autor = gestor
    ? { autorUid: gestor.uid, autorNombre: gestor.nombre || gestor.email }
    : { autorUid: 'demo', autorNombre: 'Operador demo' };
  const nombreCuadrilla = cuadrilla ? cuadrilla.nombre || cuadrilla.email : 'Cuadrilla demo';

  const anillo = poligonoComuna();
  const ahora = Date.now();
  const categorias = ['BACHE', 'BACHE', 'BACHE', 'LUMINARIA', 'LUMINARIA', 'MICROBASURAL', 'MICROBASURAL', 'OTRO'];
  let total = 0;

  for (let i = 0; i < 30; i++) {
    // Los más antiguos tienden a estar resueltos; los recientes, recibidos.
    const edadDias = 45 * (1 - i / 30) * (0.7 + 0.3 * azar());
    const creado = ahora - edadDias * DIA;
    const estado = edadDias > 20 ? (azar() < 0.85 ? 'RESUELTO' : 'ASIGNADO')
      : edadDias > 6 ? elegir(['RESUELTO', 'ASIGNADO', 'ASIGNADO'])
        : elegir(['RECIBIDO', 'RECIBIDO', 'ASIGNADO']);
    const categoria = elegir(categorias);
    const [lng, lat] = puntoAlAzar(anillo);

    const asignado = creado + (0.2 + azar() * 1.5) * DIA;
    const resuelto = Math.min(asignado + (1 + azar() * 8) * DIA, ahora - DIA / 24);
    const actualizado = estado === 'RESUELTO' ? resuelto : estado === 'ASIGNADO' ? asignado : creado;

    const ref = db.collection('reportes').doc();
    const lote = db.batch();
    lote.set(ref, {
      uid: 'demo-vecino', comunaId: COMUNA_ID, categoria, descripcion: elegir(DESCRIPCIONES[categoria]),
      fotoUrl: '', miniaturaUrl: '', lat, lng, geohash: geohash(lat, lng), estado,
      asignadoA: estado === 'RECIBIDO' ? null : cuadrilla?.uid ?? null,
      creadoEn: Timestamp.fromMillis(creado), actualizadoEn: Timestamp.fromMillis(actualizado), demo: true,
    });
    const historial = (datos, fecha) => lote.set(ref.collection('historial').doc(),
      { de: null, a: null, texto: null, ...datos, ...autor, fecha: Timestamp.fromMillis(fecha) });
    if (estado !== 'RECIBIDO') {
      historial({ tipo: 'ASIGNACION', a: nombreCuadrilla }, asignado);
      historial({ tipo: 'ESTADO', de: 'RECIBIDO', a: 'ASIGNADO' }, asignado);
    }
    if (estado === 'RESUELTO') {
      historial({ tipo: 'ESTADO', de: 'ASIGNADO', a: 'RESUELTO', texto: elegir(COMENTARIOS_CIERRE) }, resuelto);
    }
    await lote.commit();
    total++;
  }
  console.log(`Listo: ${total} reportes de demo cargados en La Granja.`);
  if (!gestor) console.log('Aviso: la comuna no tiene operador ni admin; el historial quedó a nombre de "Operador demo".');
}

main().catch((e) => { console.error(e); process.exit(1); });
