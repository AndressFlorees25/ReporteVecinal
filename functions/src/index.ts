// Webhook del bot de WhatsApp. Meta llama a esta URL con cada mensaje que recibe el número del bot.
//
// Configuración (ver functions/README.md):
//   secretos: WHATSAPP_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, WHATSAPP_SAL
//   parámetros: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_GRAPH_VERSION

import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { mensajeAviso, type Aviso } from './avisos';
import { procesarMensaje, type Dependencias, type Sesion } from './bot';
import { contiene, geohash, poligonosDesdeGeoJson } from './geo';
import { clienteWhatsApp, firmaValida, mensajesDelWebhook } from './whatsapp';

initializeApp();
const db = getFirestore();

const TOKEN = defineSecret('WHATSAPP_TOKEN');
const SECRETO_APP = defineSecret('WHATSAPP_APP_SECRET');
const TOKEN_VERIFICACION = defineSecret('WHATSAPP_VERIFY_TOKEN');
const SAL = defineSecret('WHATSAPP_SAL');
const PHONE_NUMBER_ID = defineString('WHATSAPP_PHONE_NUMBER_ID');
const VERSION_GRAPH = defineString('WHATSAPP_GRAPH_VERSION', { default: 'v23.0' });

// ---------- Comunas (límites cacheados 30 minutos por instancia) ----------

let cacheComunas: { cargadoEn: number; lista: { id: string; nombre: string; poligonos: ReturnType<typeof poligonosDesdeGeoJson> }[] } | null = null;

async function comunaEn(lat: number, lng: number) {
  if (!cacheComunas || Date.now() - cacheComunas.cargadoEn > 30 * 60 * 1000) {
    const snap = await db.collection('comunas').where('activa', '==', true).get();
    const lista = snap.docs.flatMap((d) => {
      try {
        return [{ id: d.id, nombre: String(d.get('nombre') ?? d.id), poligonos: poligonosDesdeGeoJson(d.get('geojson')) }];
      } catch {
        return [];
      }
    });
    cacheComunas = { cargadoEn: Date.now(), lista };
  }
  const c = cacheComunas.lista.find((x) => contiene(x.poligonos, lat, lng));
  return c ? { id: c.id, nombre: c.nombre } : null;
}

// ---------- Dependencias reales del bot ----------

function dependencias(): Dependencias {
  const whatsapp = clienteWhatsApp({
    token: TOKEN.value(),
    phoneNumberId: PHONE_NUMBER_ID.value(),
    versionGraph: VERSION_GRAPH.value(),
  });
  // Solo las funciones las leen o escriben: las reglas no tienen `match` para esta colección.
  const sesiones = db.collection('whatsappSesiones');
  const reportes = db.collection('reportes');

  return {
    sesiones: {
      leer: async (clave) => ((await sesiones.doc(clave).get()).data() as Sesion | undefined) ?? null,
      guardar: async (clave, sesion) => {
        // Firestore no acepta `undefined`.
        await sesiones.doc(clave).set(JSON.parse(JSON.stringify(sesion)));
      },
      borrar: async (clave) => {
        await sesiones.doc(clave).delete();
      },
    },
    comunas: { comunaEn },
    reportes: {
      nuevoId: () => reportes.doc().id,
      crear: async (id, r) => {
        await reportes.doc(id).set({
          ...r,
          miniaturaUrl: '',
          geohash: geohash(r.lat, r.lng),
          estado: 'RECIBIDO',
          origen: 'WHATSAPP',
          creadoEn: FieldValue.serverTimestamp(),
        });
      },
      delUsuario: async (uid, maximo) => {
        const snap = await reportes.where('uid', '==', uid).orderBy('creadoEn', 'desc').limit(maximo).get();
        return snap.docs.map((d) => ({
          id: d.id,
          categoria: String(d.get('categoria')),
          estado: String(d.get('estado')),
          creadoEn: d.get('creadoEn')?.toDate?.(),
        }));
      },
    },
    fotos: {
      // Misma carpeta que las fotos de la app; la URL con token la puede abrir el panel sin sesión de Storage.
      guardar: async (mediaId, reporteId) => {
        const { datos, tipo } = await whatsapp.descargarMedia(mediaId);
        const bucket = getStorage().bucket();
        const ruta = `reportes/whatsapp/${reporteId}.jpg`;
        const token = randomUUID();
        await bucket.file(ruta).save(datos, {
          contentType: tipo || 'image/jpeg',
          metadata: { metadata: { firebaseStorageDownloadTokens: token } },
        });
        return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(ruta)}?alt=media&token=${token}`;
      },
    },
    whatsapp,
    ahora: () => Date.now(),
  };
}

// ---------- Webhook ----------

export const whatsappWebhook = onRequest(
  {
    region: 'southamerica-west1',
    secrets: [TOKEN, SECRETO_APP, TOKEN_VERIFICACION, SAL],
    maxInstances: 5,
  },
  async (req, res) => {
    // Paso de verificación al configurar el webhook en Meta.
    if (req.method === 'GET') {
      const ok = req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === TOKEN_VERIFICACION.value();
      res.status(ok ? 200 : 403).send(ok ? String(req.query['hub.challenge'] ?? '') : 'Token de verificación incorrecto');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).send('Método no permitido');
      return;
    }
    if (!firmaValida(req.rawBody, req.get('X-Hub-Signature-256'), SECRETO_APP.value())) {
      logger.warn('Webhook con firma inválida');
      res.status(401).send('Firma inválida');
      return;
    }

    const deps = dependencias();
    for (const mensaje of mensajesDelWebhook(req.body)) {
      try {
        await procesarMensaje(mensaje, deps, SAL.value());
      } catch (e) {
        // Se registra y se sigue: si respondemos error, Meta reintenta el aviso completo.
        logger.error('No se pudo procesar el mensaje', { id: mensaje.id, error: String(e) });
      }
    }
    res.status(200).send('ok');
  },
);

// ---------- Avisos push de la municipalidad ----------
// Se despliega solo, sin los secretos del bot:  firebase deploy --only functions:enviarAviso

export const enviarAviso = onDocumentCreated(
  { document: 'avisos/{avisoId}', region: 'southamerica-west1', maxInstances: 5 },
  async (evento) => {
    const aviso = evento.data?.data() as Aviso | undefined;
    if (!aviso) return;
    const id = await getMessaging().send(mensajeAviso(evento.params.avisoId, aviso));
    // Queda registro en el propio aviso, para que el panel muestre que salió por push.
    await evento.data!.ref.update({ enviadoEn: FieldValue.serverTimestamp(), mensajeFcm: id });
    logger.info('Aviso enviado', { avisoId: evento.params.avisoId, comunaId: aviso.comunaId });
  },
);
