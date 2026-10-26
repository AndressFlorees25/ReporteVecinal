// Pruebas de la conversación del bot con dependencias en memoria (sin WhatsApp ni Firebase).
// Ejecutar: npm test

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, test } from 'node:test';
import {
  procesarMensaje, TEXTOS, uidDeTelefono, VIGENCIA_SESION_MS,
  type Dependencias, type MensajeEntrante, type ReporteNuevo, type Sesion,
} from '../bot';
import { mensajeAviso } from '../avisos';
import { contiene, geohash, poligonosDesdeGeoJson } from '../geo';
import { firmaValida, mensajesDelWebhook } from '../whatsapp';

const SAL = 'sal-de-prueba';
const TEL = '56912345678';
// Un cuadrado alrededor de La Granja basta para probar la conversación.
const LA_GRANJA = { id: '13111', nombre: 'La Granja' };
const DENTRO = { lat: -33.54, lng: -70.62 };
const FUERA = { lat: -33.0, lng: -71.6 };

let enviados: { tipo: 'texto' | 'lista'; cuerpo: string; opciones?: string[] }[];
let reportes: Map<string, ReporteNuevo>;
let sesiones: Map<string, Sesion>;
let reloj: number;
let falloFoto: boolean;
let n: number;

const deps: Dependencias = {
  sesiones: {
    leer: async (k) => structuredClone(sesiones.get(k) ?? null),
    guardar: async (k, s) => void sesiones.set(k, structuredClone(s)),
    borrar: async (k) => void sesiones.delete(k),
  },
  comunas: {
    comunaEn: async (lat, lng) => (lat < -33.4 && lat > -33.6 && lng < -70.5 && lng > -70.7 ? LA_GRANJA : null),
  },
  reportes: {
    nuevoId: () => `rep${++n}xyz`,
    crear: async (id, r) => void reportes.set(id, r),
    delUsuario: async (uid) =>
      [...reportes].filter(([, r]) => r.uid === uid).map(([id, r]) => ({ id, categoria: r.categoria, estado: 'RECIBIDO' })),
  },
  fotos: {
    guardar: async (mediaId, reporteId) => {
      if (falloFoto) throw new Error('sin red');
      return `https://fotos/${reporteId}/${mediaId}.jpg`;
    },
  },
  whatsapp: {
    texto: async (_a, cuerpo) => void enviados.push({ tipo: 'texto', cuerpo }),
    lista: async (_a, cuerpo, _b, opciones) => void enviados.push({ tipo: 'lista', cuerpo, opciones: opciones.map((o) => o.id) }),
  },
  ahora: () => reloj,
};

let id = 0;
const enviar = (m: Omit<MensajeEntrante, 'id' | 'de'>) => procesarMensaje({ id: `m${++id}`, de: TEL, ...m }, deps, SAL);
const ultimo = () => enviados.at(-1)!;

beforeEach(() => {
  enviados = [];
  reportes = new Map();
  sesiones = new Map();
  reloj = 1_000_000;
  falloFoto = false;
  n = 0;
});

describe('Conversación del bot', () => {
  test('flujo completo: saludo, foto, ubicación, categoría y descripción crean el reporte', async () => {
    await enviar({ tipo: 'texto', texto: 'Hola' });
    assert.equal(ultimo().cuerpo, TEXTOS.bienvenida);

    await enviar({ tipo: 'imagen', mediaId: 'img1' });
    assert.equal(ultimo().cuerpo, TEXTOS.pedirUbicacion);

    await enviar({ tipo: 'ubicacion', ...DENTRO });
    assert.equal(ultimo().tipo, 'lista');
    assert.deepEqual(ultimo().opciones, ['BACHE', 'LUMINARIA', 'MICROBASURAL', 'OTRO']);

    await enviar({ tipo: 'opcion', opcionId: 'LUMINARIA' });
    assert.equal(ultimo().cuerpo, TEXTOS.pedirDescripcion);

    await enviar({ tipo: 'texto', texto: 'Poste apagado en la esquina' });
    assert.match(ultimo().cuerpo, /Reporte enviado/);
    assert.match(ultimo().cuerpo, /N\.º REP1XY/);

    assert.deepEqual(reportes.get('rep1xyz'), {
      uid: uidDeTelefono(TEL, SAL), comunaId: '13111', categoria: 'LUMINARIA',
      descripcion: 'Poste apagado en la esquina', fotoUrl: 'https://fotos/rep1xyz/img1.jpg', ...DENTRO,
    });
    assert.equal(sesiones.size, 0, 'la sesión se borra al terminar');
  });

  test('se puede partir con la ubicación y responder la categoría con un número; «no» deja la descripción vacía', async () => {
    await enviar({ tipo: 'ubicacion', ...DENTRO });
    assert.equal(ultimo().cuerpo, TEXTOS.pedirFoto);
    await enviar({ tipo: 'imagen', mediaId: 'img2' });
    assert.equal(ultimo().tipo, 'lista');
    await enviar({ tipo: 'texto', texto: '3' });
    assert.equal(ultimo().cuerpo, TEXTOS.pedirDescripcion);
    await enviar({ tipo: 'texto', texto: 'No' });
    const [r] = [...reportes.values()];
    assert.equal(r.categoria, 'MICROBASURAL');
    assert.equal(r.descripcion, '');
  });

  test('una ubicación fuera de cobertura no avanza', async () => {
    await enviar({ tipo: 'imagen', mediaId: 'img' });
    await enviar({ tipo: 'ubicacion', ...FUERA });
    assert.equal(ultimo().cuerpo, TEXTOS.fueraDeCobertura);
    await enviar({ tipo: 'texto', texto: 'hola?' });
    assert.equal(ultimo().cuerpo, TEXTOS.pedirUbicacion);
  });

  test('CANCELAR descarta la conversación y ESTADO lista los reportes', async () => {
    await enviar({ tipo: 'imagen', mediaId: 'img' });
    await enviar({ tipo: 'texto', texto: 'cancelar' });
    assert.equal(ultimo().cuerpo, TEXTOS.cancelado);
    assert.equal(sesiones.size, 0);

    await enviar({ tipo: 'texto', texto: 'Estado' });
    assert.equal(ultimo().cuerpo, TEXTOS.sinReportes);

    reportes.set('abcdef123', { uid: uidDeTelefono(TEL, SAL), comunaId: '13111', categoria: 'BACHE', descripcion: '', fotoUrl: '', ...DENTRO });
    await enviar({ tipo: 'texto', texto: 'ESTADO' });
    assert.match(ultimo().cuerpo, /N\.º ABCDEF\* Socavón \/ bache: \*Recibido\*/);
  });

  test('un mensaje repetido por WhatsApp se ignora', async () => {
    await procesarMensaje({ id: 'dup', de: TEL, tipo: 'imagen', mediaId: 'x' }, deps, SAL);
    const antes = enviados.length;
    await procesarMensaje({ id: 'dup', de: TEL, tipo: 'imagen', mediaId: 'x' }, deps, SAL);
    assert.equal(enviados.length, antes);
  });

  test('una conversación vieja se descarta y se vuelve a saludar', async () => {
    await enviar({ tipo: 'imagen', mediaId: 'img' });
    reloj += VIGENCIA_SESION_MS + 1;
    await enviar({ tipo: 'texto', texto: 'hola' });
    assert.equal(ultimo().cuerpo, TEXTOS.bienvenida);
  });

  test('si la foto no se puede descargar, se pide de nuevo', async () => {
    falloFoto = true;
    await enviar({ tipo: 'imagen', mediaId: 'img' });
    assert.equal(ultimo().cuerpo, TEXTOS.errorFoto);
  });

  test('un audio u otro tipo avisa y vuelve a pedir lo que falta', async () => {
    await enviar({ tipo: 'imagen', mediaId: 'img' });
    await enviar({ tipo: 'otro' });
    assert.equal(enviados.at(-2)!.cuerpo, TEXTOS.noEntiendo);
    assert.equal(ultimo().cuerpo, TEXTOS.pedirUbicacion);
  });

  test('el uid no revela el teléfono y depende de la sal', () => {
    const uid = uidDeTelefono(TEL, SAL);
    assert.match(uid, /^wa_[0-9a-f]{28}$/);
    assert.ok(!uid.includes(TEL));
    assert.notEqual(uid, uidDeTelefono(TEL, 'otra-sal'));
  });
});

describe('Webhook', () => {
  test('lee texto, imagen, ubicación y opción de lista; ignora avisos de estado', () => {
    const cuerpo = {
      entry: [{
        changes: [{
          value: {
            statuses: [{ id: 's1', status: 'read' }],
            messages: [
              { id: 'a', from: TEL, type: 'text', text: { body: 'hola' } },
              { id: 'b', from: TEL, type: 'image', image: { id: 'media1' } },
              { id: 'c', from: TEL, type: 'location', location: { latitude: -33.5, longitude: -70.6 } },
              { id: 'd', from: TEL, type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'BACHE' } } },
              { id: 'e', from: TEL, type: 'audio', audio: { id: 'x' } },
            ],
          },
        }],
      }],
    };
    assert.deepEqual(mensajesDelWebhook(cuerpo).map((m) => [m.tipo, m.texto ?? m.mediaId ?? m.opcionId ?? m.lat ?? null]), [
      ['texto', 'hola'], ['imagen', 'media1'], ['ubicacion', -33.5], ['opcion', 'BACHE'], ['otro', null],
    ]);
    assert.deepEqual(mensajesDelWebhook({ entry: [{ changes: [{ value: { statuses: [{}] } }] }] }), []);
  });

  test('la firma de Meta se valida con el secreto de la app', () => {
    const cuerpo = Buffer.from('{"entry":[]}');
    const firma = 'sha256=' + createHmac('sha256', 'secreto').update(cuerpo).digest('hex');
    assert.ok(firmaValida(cuerpo, firma, 'secreto'));
    assert.ok(!firmaValida(cuerpo, firma, 'otro'));
    assert.ok(!firmaValida(cuerpo, undefined, 'secreto'));
    assert.ok(!firmaValida(cuerpo, 'sha256=abc', 'secreto'));
  });
});

describe('Geometría', () => {
  test('punto en polígono con agujero y geohash como la app', () => {
    const geo = JSON.stringify({
      type: 'Polygon',
      coordinates: [
        [[-71, -34], [-70, -34], [-70, -33], [-71, -33], [-71, -34]],
        [[-70.6, -33.6], [-70.4, -33.6], [-70.4, -33.4], [-70.6, -33.4], [-70.6, -33.6]],
      ],
    });
    const p = poligonosDesdeGeoJson(geo);
    assert.ok(contiene(p, -33.2, -70.8));
    assert.ok(!contiene(p, -33.5, -70.5), 'dentro del agujero');
    assert.ok(!contiene(p, -35, -70.5));
    // Ejemplo clásico de la definición de geohash (Wikipedia): 57.64911, 10.40744 → u4pruydqqv.
    assert.equal(geohash(57.64911, 10.40744), 'u4pruydqqv');
  });
});

describe('Avisos push', () => {
  test('aviso para toda la comuna: al tema de la comuna, sin sector', () => {
    const m = mensajeAviso('a1', { comunaId: '13111', titulo: 'Albergue', mensaje: 'Sede Y habilitada' });
    assert.equal((m as { topic: string }).topic, 'comuna_13111');
    assert.deepEqual(m.data, { avisoId: 'a1', comunaId: '13111', titulo: 'Albergue', mensaje: 'Sede Y habilitada' });
    assert.equal(m.android?.priority, 'high');
  });

  test('aviso por sector: lleva el círculo como texto', () => {
    const m = mensajeAviso('a2', {
      comunaId: '13111', titulo: 'Evite calle X', mensaje: 'Anegada', sectorNombre: 'Villa Sur', lat: -33.54, lng: -70.62, radioMetros: 500,
    });
    assert.equal(m.data?.lat, '-33.54');
    assert.equal(m.data?.radioMetros, '500');
    assert.equal(m.data?.sectorNombre, 'Villa Sur');
  });
});
