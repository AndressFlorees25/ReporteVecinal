// Pruebas de las reglas de Firestore (multi-comuna y roles) contra el emulador.
// Ejecutar: npm install && npm test

import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const SAN_RAMON = '13131';
const LA_GRANJA = '13111';

let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-reportevecinal',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

// Datos base: dos comunas, funcionarios con distintos roles y un reporte en cada comuna.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'comunas', SAN_RAMON), { nombre: 'San Ramón', activa: true });
    await setDoc(doc(db, 'comunas', LA_GRANJA), { nombre: 'La Granja', activa: true });
    await setDoc(doc(db, 'comunas', 'inactiva'), { nombre: 'Inactiva', activa: false });

    const funcionarios = {
      super: { rol: 'SUPERADMIN', comunaId: null },
      adminSR: { rol: 'ADMIN', comunaId: SAN_RAMON },
      operSR: { rol: 'OPERADOR', comunaId: SAN_RAMON },
      cuadSR: { rol: 'CUADRILLA', comunaId: SAN_RAMON },
      visorSR: { rol: 'VISOR', comunaId: SAN_RAMON },
      operLG: { rol: 'OPERADOR', comunaId: LA_GRANJA },
      exOperSR: { rol: 'OPERADOR', comunaId: SAN_RAMON, activo: false },
    };
    for (const [uid, f] of Object.entries(funcionarios)) {
      await setDoc(doc(db, 'funcionarios', uid), {
        email: `${uid.toLowerCase()}@muni.cl`, nombre: uid, activo: true, ...f,
      });
    }

    const base = {
      uid: 'vecino1', categoria: 'BACHE', descripcion: 'x', fotoUrl: '', lat: -33.54, lng: -70.64,
      geohash: '66jc', estado: 'RECIBIDO', creadoEn: new Date(),
    };
    await setDoc(doc(db, 'reportes', 'rSR'), { ...base, comunaId: SAN_RAMON, asignadoA: 'cuadSR' });
    await setDoc(doc(db, 'reportes', 'rLG'), { ...base, comunaId: LA_GRANJA });
    await setDoc(doc(db, 'invitaciones', 'nuevo@muni.cl'), {
      email: 'nuevo@muni.cl', comunaId: SAN_RAMON, rol: 'OPERADOR', invitadoPor: 'adminSR', creadoEn: new Date(),
    });
  });
});

const db = (uid, token = {}) => env.authenticatedContext(uid, token).firestore();
const reporteNuevo = (comunaId, extra = {}) => ({
  uid: 'vecino1', comunaId, categoria: 'BACHE', descripcion: 'Bache', fotoUrl: '',
  lat: -33.54, lng: -70.64, geohash: '66jc', estado: 'RECIBIDO', creadoEn: serverTimestamp(), ...extra,
});
const cambioEstado = (estado) => ({ estado, actualizadoEn: serverTimestamp() });

describe('Reportes de vecinos', () => {
  test('un vecino crea un reporte en una comuna activa', async () => {
    await assertSucceeds(setDoc(doc(db('vecino1'), 'reportes', 'n1'), reporteNuevo(SAN_RAMON)));
  });

  test('un reporte puede incluir la URL de la miniatura', async () => {
    await assertSucceeds(setDoc(doc(db('vecino1'), 'reportes', 'n6'),
      reporteNuevo(SAN_RAMON, { miniaturaUrl: 'https://x/min.jpg' })));
    await assertFails(setDoc(doc(db('vecino1'), 'reportes', 'n7'), reporteNuevo(SAN_RAMON, { miniaturaUrl: 5 })));
  });

  test('no se puede reportar en una comuna inactiva o inexistente', async () => {
    await assertFails(setDoc(doc(db('vecino1'), 'reportes', 'n2'), reporteNuevo('inactiva')));
    await assertFails(setDoc(doc(db('vecino1'), 'reportes', 'n3'), reporteNuevo('99999')));
  });

  test('no se puede crear un reporte a nombre de otro ni con estado distinto de RECIBIDO', async () => {
    await assertFails(setDoc(doc(db('vecino2'), 'reportes', 'n4'), reporteNuevo(SAN_RAMON)));
    await assertFails(setDoc(doc(db('vecino1'), 'reportes', 'n5'), reporteNuevo(SAN_RAMON, { estado: 'RESUELTO' })));
  });

  test('reportes de emergencia con urgencia', async () => {
    await assertSucceeds(setDoc(doc(db('vecino1'), 'reportes', 'e1'),
      reporteNuevo(SAN_RAMON, { categoria: 'ANEGAMIENTO', personasEnRiesgo: true, afectaVivienda: false })));
    await assertSucceeds(setDoc(doc(db('vecino1'), 'reportes', 'e2'), reporteNuevo(SAN_RAMON, { categoria: 'CORTE_LUZ' })));
    await assertFails(setDoc(doc(db('vecino1'), 'reportes', 'e3'), reporteNuevo(SAN_RAMON, { categoria: 'TERREMOTO' })));
    await assertFails(setDoc(doc(db('vecino1'), 'reportes', 'e4'),
      reporteNuevo(SAN_RAMON, { categoria: 'ARBOL_CAIDO', personasEnRiesgo: 'si' })));
  });

  test('un vecino no puede cambiar el estado', async () => {
    await assertFails(updateDoc(doc(db('vecino1'), 'reportes', 'rSR'), cambioEstado('RESUELTO')));
  });

  test('sin sesión no se lee nada', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'reportes', 'rSR')));
  });

  test('al eliminar su cuenta, el vecino deja anónimos sus reportes (y nada más)', async () => {
    await assertFails(updateDoc(doc(db('vecino2'), 'reportes', 'rSR'), { uid: 'cuenta-eliminada' }));
    await assertFails(updateDoc(doc(db('vecino1'), 'reportes', 'rSR'), { uid: 'vecino2' }));
    await assertFails(updateDoc(doc(db('vecino1'), 'reportes', 'rSR'), { uid: 'cuenta-eliminada', descripcion: 'y' }));
    await assertSucceeds(updateDoc(doc(db('vecino1'), 'reportes', 'rSR'), { uid: 'cuenta-eliminada' }));
  });
});

describe('Apoyos («a mí también me afecta»)', () => {
  const apoyar = (uid, reporte = 'rSR') => {
    const d = db(uid);
    const lote = writeBatch(d);
    lote.set(doc(d, 'reportes', reporte, 'apoyos', uid), { creadoEn: serverTimestamp() });
    lote.update(doc(d, 'reportes', reporte), { apoyos: increment(1) });
    return lote.commit();
  };
  const quitar = (uid, reporte = 'rSR') => {
    const d = db(uid);
    const lote = writeBatch(d);
    lote.delete(doc(d, 'reportes', reporte, 'apoyos', uid));
    lote.update(doc(d, 'reportes', reporte), { apoyos: increment(-1) });
    return lote.commit();
  };

  test('otro vecino apoya una vez, puede quitar su apoyo y volver a apoyar', async () => {
    await assertSucceeds(apoyar('vecino2'));
    await assertFails(apoyar('vecino2'));
    await assertSucceeds(quitar('vecino2'));
    await assertSucceeds(apoyar('vecino2'));
  });

  test('el autor no apoya su propio reporte', async () => {
    await assertFails(apoyar('vecino1'));
  });

  test('no se puede tocar el contador sin la marca, ni sumar de a más de uno', async () => {
    await assertFails(updateDoc(doc(db('vecino2'), 'reportes', 'rSR'), { apoyos: 1 }));
    const d = db('vecino3');
    const lote = writeBatch(d);
    lote.set(doc(d, 'reportes', 'rSR', 'apoyos', 'vecino3'), { creadoEn: serverTimestamp() });
    lote.update(doc(d, 'reportes', 'rSR'), { apoyos: increment(5) });
    await assertFails(lote.commit());
  });

  test('no se apoya a nombre de otro ni un reporte resuelto', async () => {
    const d = db('vecino2');
    const lote = writeBatch(d);
    lote.set(doc(d, 'reportes', 'rSR', 'apoyos', 'vecino3'), { creadoEn: serverTimestamp() });
    lote.update(doc(d, 'reportes', 'rSR'), { apoyos: increment(1) });
    await assertFails(lote.commit());
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), 'reportes', 'rLG'), { estado: 'RESUELTO' }));
    await assertFails(apoyar('vecino2', 'rLG'));
  });

  test('cada vecino ve solo su propia marca', async () => {
    await apoyar('vecino2');
    await assertSucceeds(getDoc(doc(db('vecino2'), 'reportes', 'rSR', 'apoyos', 'vecino2')));
    await assertFails(getDoc(doc(db('vecino3'), 'reportes', 'rSR', 'apoyos', 'vecino2')));
  });
});

describe('Denuncias', () => {
  const denuncia = (uid, extra = {}) => ({
    reporteId: 'rSR', comunaId: SAN_RAMON, uid, motivo: 'FALSO', creadoEn: serverTimestamp(), ...extra,
  });

  test('un vecino denuncia un reporte una sola vez', async () => {
    await assertSucceeds(setDoc(doc(db('vecino2'), 'denuncias', 'rSR_vecino2'), denuncia('vecino2')));
    await assertFails(setDoc(doc(db('vecino2'), 'denuncias', 'rSR_vecino2'), denuncia('vecino2')));
  });

  test('no se puede denunciar a nombre de otro, con otro id, otra comuna o motivo inválido', async () => {
    await assertFails(setDoc(doc(db('vecino2'), 'denuncias', 'rSR_vecino3'), denuncia('vecino3')));
    await assertFails(setDoc(doc(db('vecino2'), 'denuncias', 'otro'), denuncia('vecino2')));
    await assertFails(setDoc(doc(db('vecino2'), 'denuncias', 'rSR_vecino2'), denuncia('vecino2', { comunaId: LA_GRANJA })));
    await assertFails(setDoc(doc(db('vecino2'), 'denuncias', 'rSR_vecino2'), denuncia('vecino2', { motivo: 'X' })));
    await assertFails(setDoc(doc(db('vecino2'), 'denuncias', 'nada_vecino2'), denuncia('vecino2', { reporteId: 'nada' })));
  });

  test('las ve el operador de la comuna, no un vecino ni otra comuna', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'denuncias', 'rSR_vecino2'), { ...denuncia('vecino2'), creadoEn: new Date() }));
    await assertSucceeds(getDoc(doc(db('operSR'), 'denuncias', 'rSR_vecino2')));
    await assertFails(getDoc(doc(db('operLG'), 'denuncias', 'rSR_vecino2')));
    await assertFails(getDoc(doc(db('vecino2'), 'denuncias', 'rSR_vecino2')));
  });

  test('el operador de la comuna la marca como revisada; otros no', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'denuncias', 'rSR_vecino2'), { ...denuncia('vecino2'), creadoEn: new Date() }));
    const revision = (uid, extra = {}) => ({
      decision: 'DESCARTADA', revisadaPor: uid, revisadaEn: serverTimestamp(), ...extra,
    });
    await assertFails(updateDoc(doc(db('vecino2'), 'denuncias', 'rSR_vecino2'), revision('vecino2')));
    await assertFails(updateDoc(doc(db('operLG'), 'denuncias', 'rSR_vecino2'), revision('operLG')));
    await assertFails(updateDoc(doc(db('visorSR'), 'denuncias', 'rSR_vecino2'), revision('visorSR')));
    await assertFails(updateDoc(doc(db('operSR'), 'denuncias', 'rSR_vecino2'), revision('operSR', { decision: 'X' })));
    await assertFails(updateDoc(doc(db('operSR'), 'denuncias', 'rSR_vecino2'), revision('operSR', { motivo: 'OTRO' })));
    await assertSucceeds(updateDoc(doc(db('operSR'), 'denuncias', 'rSR_vecino2'), revision('operSR')));
  });

  test('cerrar el reporte denunciado: estado RESUELTO + historial + denuncia revisada en un lote', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'denuncias', 'rSR_vecino2'), { ...denuncia('vecino2'), creadoEn: new Date() }));
    const d = db('operSR');
    const lote = writeBatch(d);
    lote.update(doc(d, 'reportes', 'rSR'), { estado: 'RESUELTO', actualizadoEn: serverTimestamp() });
    lote.set(doc(d, 'reportes', 'rSR', 'historial', 'c1'), {
      tipo: 'ESTADO', de: 'RECIBIDO', a: 'RESUELTO', texto: 'Cerrado por denuncia', autorUid: 'operSR', autorNombre: 'operSR',
      fecha: serverTimestamp(),
    });
    lote.update(doc(d, 'denuncias', 'rSR_vecino2'), {
      decision: 'REPORTE_CERRADO', revisadaPor: 'operSR', revisadaEn: serverTimestamp(),
    });
    await assertSucceeds(lote.commit());
  });
});

describe('Separación por comuna y roles', () => {
  test('el operador cambia el estado de un reporte de su comuna', async () => {
    await assertSucceeds(updateDoc(doc(db('operSR'), 'reportes', 'rSR'), cambioEstado('ASIGNADO')));
  });

  test('el operador NO puede tocar reportes de otra comuna', async () => {
    await assertFails(updateDoc(doc(db('operSR'), 'reportes', 'rLG'), cambioEstado('ASIGNADO')));
    await assertFails(updateDoc(doc(db('operLG'), 'reportes', 'rSR'), cambioEstado('ASIGNADO')));
  });

  test('el operador no puede mover un reporte de comuna ni editar la descripción', async () => {
    await assertFails(updateDoc(doc(db('operSR'), 'reportes', 'rSR'), { comunaId: LA_GRANJA, actualizadoEn: serverTimestamp() }));
    await assertFails(updateDoc(doc(db('operSR'), 'reportes', 'rSR'), { descripcion: 'otra', actualizadoEn: serverTimestamp() }));
  });

  test('un funcionario desactivado ya no puede editar', async () => {
    await assertFails(updateDoc(doc(db('exOperSR'), 'reportes', 'rSR'), cambioEstado('ASIGNADO')));
  });

  test('el visor no puede cambiar estados', async () => {
    await assertFails(updateDoc(doc(db('visorSR'), 'reportes', 'rSR'), cambioEstado('ASIGNADO')));
  });

  test('la cuadrilla solo marca RESUELTO lo que tiene asignado', async () => {
    await assertFails(updateDoc(doc(db('cuadSR'), 'reportes', 'rSR'), cambioEstado('ASIGNADO')));
    await assertSucceeds(updateDoc(doc(db('cuadSR'), 'reportes', 'rSR'), cambioEstado('RESUELTO')));
  });

  test('el superadmin puede editar en cualquier comuna', async () => {
    await assertSucceeds(updateDoc(doc(db('super'), 'reportes', 'rLG'), cambioEstado('RESUELTO')));
  });

  test('historial: el operador comenta en su comuna, no en otra', async () => {
    const entrada = (uid) => ({
      tipo: 'COMENTARIO', texto: 'En revisión', autorUid: uid, autorNombre: uid, fecha: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(db('operSR'), 'reportes', 'rSR', 'historial', 'h1'), entrada('operSR')));
    await assertFails(setDoc(doc(db('operSR'), 'reportes', 'rLG', 'historial', 'h2'), entrada('operSR')));
    await assertFails(setDoc(doc(db('vecino1'), 'reportes', 'rSR', 'historial', 'h3'), entrada('vecino1')));
  });
});

describe('Acciones del panel (lotes como los envía panel-web)', () => {
  test('asignar a cuadrilla: actualiza el reporte y agrega dos entradas al historial', async () => {
    const d = db('operSR');
    const lote2 = writeBatch(d);
    lote2.update(doc(d, 'reportes', 'rSR'), { asignadoA: 'cuadSR', estado: 'ASIGNADO', actualizadoEn: serverTimestamp() });
    lote2.set(doc(d, 'reportes', 'rSR', 'historial', 'a1'), {
      tipo: 'ASIGNACION', de: null, a: 'Cuadrilla 1', texto: null, autorUid: 'operSR', autorNombre: 'operSR', fecha: serverTimestamp(),
    });
    lote2.set(doc(d, 'reportes', 'rSR', 'historial', 'a2'), {
      tipo: 'ESTADO', de: 'RECIBIDO', a: 'ASIGNADO', texto: null, autorUid: 'operSR', autorNombre: 'operSR', fecha: serverTimestamp(),
    });
    await assertSucceeds(lote2.commit());
  });

  test('quitar la asignación (asignadoA: null)', async () => {
    await assertSucceeds(updateDoc(doc(db('adminSR'), 'reportes', 'rSR'), { asignadoA: null, actualizadoEn: serverTimestamp() }));
  });

  test('el historial no admite firmar a nombre de otro', async () => {
    await assertFails(setDoc(doc(db('operSR'), 'reportes', 'rSR', 'historial', 'x'), {
      tipo: 'COMENTARIO', texto: 'hola', autorUid: 'adminSR', autorNombre: 'admin', fecha: serverTimestamp(),
    }));
  });
});

describe('Comunas', () => {
  test('solo el superadmin crea o edita comunas', async () => {
    const nueva = { nombre: 'La Pintana', activa: true };
    await assertSucceeds(setDoc(doc(db('super'), 'comunas', '13112'), nueva));
    await assertFails(setDoc(doc(db('adminSR'), 'comunas', '13113'), nueva));
    await assertFails(setDoc(doc(db('vecino1'), 'comunas', '13114'), nueva));
  });
});

describe('Modo Emergencia', () => {
  const emergencia = (uid, extra = {}) => ({
    activa: true, aviso: 'Evite calle X', comunaNombre: 'San Ramón',
    actualizadoPor: uid, actualizadoEn: serverTimestamp(), ...extra,
  });

  test('admin y operador de la comuna lo activan; el resto no', async () => {
    await assertSucceeds(setDoc(doc(db('operSR'), 'emergencias', SAN_RAMON), emergencia('operSR')));
    await assertSucceeds(setDoc(doc(db('adminSR'), 'emergencias', SAN_RAMON), emergencia('adminSR', { activa: false })));
    await assertFails(setDoc(doc(db('operLG'), 'emergencias', SAN_RAMON), emergencia('operLG')));
    await assertFails(setDoc(doc(db('visorSR'), 'emergencias', SAN_RAMON), emergencia('visorSR')));
    await assertFails(setDoc(doc(db('cuadSR'), 'emergencias', SAN_RAMON), emergencia('cuadSR')));
    await assertFails(setDoc(doc(db('vecino1'), 'emergencias', SAN_RAMON), emergencia('vecino1')));
  });

  test('valida el aviso y quién lo firma', async () => {
    await assertFails(setDoc(doc(db('operSR'), 'emergencias', SAN_RAMON), emergencia('adminSR')));
    await assertFails(setDoc(doc(db('operSR'), 'emergencias', SAN_RAMON), emergencia('operSR', { aviso: 'x'.repeat(301) })));
    await assertFails(setDoc(doc(db('operSR'), 'emergencias', SAN_RAMON), emergencia('operSR', { extra: 1 })));
  });

  test('cualquier vecino con sesión lo lee', async () => {
    await env.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), 'emergencias', SAN_RAMON), { activa: true, aviso: 'x' }));
    await assertSucceeds(getDoc(doc(db('vecino1'), 'emergencias', SAN_RAMON)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'emergencias', SAN_RAMON)));
  });
});

describe('Avisos a los vecinos', () => {
  const aviso = (uid, extra = {}) => ({
    comunaId: SAN_RAMON, titulo: 'Evite calle X', mensaje: 'Anegada', creadoPor: uid, creadoEn: serverTimestamp(), ...extra,
  });
  const sector = { sectorNombre: 'Villa Sur', lat: -33.54, lng: -70.64, radioMetros: 500 };

  test('admin y operador envían avisos a su comuna, para toda la comuna o un sector', async () => {
    await assertSucceeds(setDoc(doc(db('operSR'), 'avisos', 'a1'), aviso('operSR')));
    await assertSucceeds(setDoc(doc(db('adminSR'), 'avisos', 'a2'), aviso('adminSR', sector)));
    await assertFails(setDoc(doc(db('operLG'), 'avisos', 'a3'), aviso('operLG')));
    await assertFails(setDoc(doc(db('visorSR'), 'avisos', 'a4'), aviso('visorSR')));
    await assertFails(setDoc(doc(db('vecino1'), 'avisos', 'a5'), aviso('vecino1')));
  });

  test('valida textos y sector completo', async () => {
    await assertFails(setDoc(doc(db('operSR'), 'avisos', 'b1'), aviso('operSR', { mensaje: '' })));
    await assertFails(setDoc(doc(db('operSR'), 'avisos', 'b2'), aviso('operSR', { lat: -33.5, lng: -70.6 })));
    await assertFails(setDoc(doc(db('operSR'), 'avisos', 'b3'), aviso('operSR', { ...sector, radioMetros: 50 })));
    await assertFails(setDoc(doc(db('operSR'), 'avisos', 'b4'), aviso('adminSR')));
  });

  test('nadie edita ni borra un aviso enviado', async () => {
    await assertSucceeds(setDoc(doc(db('operSR'), 'avisos', 'c1'), aviso('operSR')));
    await assertFails(updateDoc(doc(db('operSR'), 'avisos', 'c1'), { titulo: 'otro' }));
    await assertFails(deleteDoc(doc(db('adminSR'), 'avisos', 'c1')));
  });
});

describe('Invitaciones y funcionarios', () => {
  const tokenNuevo = { email: 'nuevo@muni.cl', email_verified: true };
  const altaNuevo = (extra = {}) => ({
    email: 'nuevo@muni.cl', nombre: 'Nuevo', comunaId: SAN_RAMON, rol: 'OPERADOR', activo: true,
    creadoEn: serverTimestamp(), ...extra,
  });

  test('el invitado con correo verificado acepta su invitación', async () => {
    await assertSucceeds(setDoc(doc(db('uNuevo', tokenNuevo), 'funcionarios', 'uNuevo'), altaNuevo()));
  });

  test('sin correo verificado no puede aceptar', async () => {
    await assertFails(setDoc(
      doc(db('uNuevo', { email: 'nuevo@muni.cl', email_verified: false }), 'funcionarios', 'uNuevo'), altaNuevo()));
  });

  test('el invitado no puede subirse el rol ni cambiarse de comuna', async () => {
    await assertFails(setDoc(doc(db('uNuevo', tokenNuevo), 'funcionarios', 'uNuevo'), altaNuevo({ rol: 'ADMIN' })));
    await assertFails(setDoc(doc(db('uNuevo', tokenNuevo), 'funcionarios', 'uNuevo'), altaNuevo({ comunaId: LA_GRANJA })));
    await assertFails(setDoc(doc(db('uNuevo', tokenNuevo), 'funcionarios', 'uNuevo'), altaNuevo({ rol: 'SUPERADMIN' })));
  });

  test('nadie puede darse de alta sin invitación', async () => {
    const token = { email: 'colado@x.cl', email_verified: true };
    await assertFails(setDoc(doc(db('uColado', token), 'funcionarios', 'uColado'),
      altaNuevo({ email: 'colado@x.cl' })));
  });

  test('el admin invita en su comuna, no en otra; el operador no invita', async () => {
    const inv = (comunaId, uid) => ({
      email: 'otro@muni.cl', comunaId, rol: 'OPERADOR', invitadoPor: uid, creadoEn: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(db('adminSR'), 'invitaciones', 'otro@muni.cl'), inv(SAN_RAMON, 'adminSR')));
    await assertFails(setDoc(doc(db('adminSR'), 'invitaciones', 'otro2@muni.cl'),
      { ...inv(LA_GRANJA, 'adminSR'), email: 'otro2@muni.cl' }));
    await assertFails(setDoc(doc(db('operSR'), 'invitaciones', 'otro3@muni.cl'),
      { ...inv(SAN_RAMON, 'operSR'), email: 'otro3@muni.cl' }));
  });

  test('nadie puede invitar a un SUPERADMIN', async () => {
    await assertFails(setDoc(doc(db('super'), 'invitaciones', 'jefe@x.cl'), {
      email: 'jefe@x.cl', comunaId: SAN_RAMON, rol: 'SUPERADMIN', invitadoPor: 'super', creadoEn: serverTimestamp(),
    }));
  });

  test('el admin cambia roles y desactiva funcionarios de su comuna, no de otra', async () => {
    await assertSucceeds(updateDoc(doc(db('adminSR'), 'funcionarios', 'operSR'), { rol: 'VISOR' }));
    await assertSucceeds(updateDoc(doc(db('adminSR'), 'funcionarios', 'visorSR'), { activo: false }));
    await assertFails(updateDoc(doc(db('adminSR'), 'funcionarios', 'operLG'), { activo: false }));
    await assertFails(updateDoc(doc(db('adminSR'), 'funcionarios', 'operSR'), { rol: 'SUPERADMIN' }));
  });

  test('nadie se modifica a sí mismo', async () => {
    await assertFails(updateDoc(doc(db('operSR'), 'funcionarios', 'operSR'), { rol: 'ADMIN' }));
  });

  test('los funcionarios ven a sus colegas de comuna, no a los de otra', async () => {
    await assertSucceeds(getDoc(doc(db('adminSR'), 'funcionarios', 'operSR')));
    await assertSucceeds(getDoc(doc(db('operSR'), 'funcionarios', 'cuadSR')));
    await assertFails(getDoc(doc(db('adminSR'), 'funcionarios', 'operLG')));
    await assertFails(getDoc(doc(db('vecino1'), 'funcionarios', 'operSR')));
  });

  test('el invitado borra su invitación al aceptarla', async () => {
    await assertSucceeds(deleteDoc(doc(db('uNuevo', tokenNuevo), 'invitaciones', 'nuevo@muni.cl')));
  });
});
