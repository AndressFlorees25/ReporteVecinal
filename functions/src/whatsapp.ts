// Cliente mínimo de la API de WhatsApp Cloud (Meta Graph API) y lectura del webhook.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MensajeEntrante } from './bot';

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  versionGraph: string;
}

const graph = (c: ConfigWhatsApp, ruta: string) => `https://graph.facebook.com/${c.versionGraph}/${ruta}`;

async function enviar(c: ConfigWhatsApp, cuerpo: object): Promise<void> {
  const r = await fetch(graph(c, `${c.phoneNumberId}/messages`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...cuerpo }),
  });
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}: ${await r.text()}`);
}

export function clienteWhatsApp(c: ConfigWhatsApp) {
  return {
    texto: (a: string, cuerpo: string) => enviar(c, { to: a, type: 'text', text: { body: cuerpo } }),

    // Lista interactiva: títulos de fila de 24 caracteres como máximo, descripciones de 72.
    lista: (a: string, cuerpo: string, boton: string, opciones: { id: string; titulo: string; descripcion: string }[]) =>
      enviar(c, {
        to: a,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: cuerpo },
          action: {
            button: boton,
            sections: [{
              title: 'Tipo de problema',
              rows: opciones.map((o) => ({ id: o.id, title: o.titulo.slice(0, 24), description: o.descripcion.slice(0, 72) })),
            }],
          },
        },
      }),

    /** Descarga una imagen recibida: primero se pide su URL temporal y luego los bytes, ambos con el token. */
    async descargarMedia(mediaId: string): Promise<{ datos: Buffer; tipo: string }> {
      const info = await fetch(graph(c, mediaId), { headers: { Authorization: `Bearer ${c.token}` } });
      if (!info.ok) throw new Error(`No se pudo consultar la imagen ${mediaId}: ${info.status}`);
      const { url, mime_type: tipo } = (await info.json()) as { url: string; mime_type: string };
      const archivo = await fetch(url, { headers: { Authorization: `Bearer ${c.token}` } });
      if (!archivo.ok) throw new Error(`No se pudo descargar la imagen ${mediaId}: ${archivo.status}`);
      return { datos: Buffer.from(await archivo.arrayBuffer()), tipo };
    },
  };
}

/** Comprueba la firma `X-Hub-Signature-256` con el secreto de la app de Meta. */
export function firmaValida(cuerpoCrudo: Buffer, firma: string | undefined, secretoApp: string): boolean {
  if (!firma?.startsWith('sha256=')) return false;
  const esperada = Buffer.from('sha256=' + createHmac('sha256', secretoApp).update(cuerpoCrudo).digest('hex'));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Extrae los mensajes de un aviso del webhook (ignora confirmaciones de entrega y lectura). */
export function mensajesDelWebhook(cuerpo: unknown): MensajeEntrante[] {
  const salida: MensajeEntrante[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entradas = (cuerpo as any)?.entry ?? [];
  for (const entrada of entradas) {
    for (const cambio of entrada?.changes ?? []) {
      for (const m of cambio?.value?.messages ?? []) {
        const base = { id: String(m.id), de: String(m.from) };
        switch (m.type) {
          case 'text':
            salida.push({ ...base, tipo: 'texto', texto: m.text?.body ?? '' });
            break;
          case 'image':
            salida.push({ ...base, tipo: 'imagen', mediaId: m.image?.id });
            break;
          case 'location':
            salida.push({ ...base, tipo: 'ubicacion', lat: Number(m.location?.latitude), lng: Number(m.location?.longitude) });
            break;
          case 'interactive':
            salida.push({ ...base, tipo: 'opcion', opcionId: m.interactive?.list_reply?.id ?? m.interactive?.button_reply?.id });
            break;
          default:
            salida.push({ ...base, tipo: 'otro' });
        }
      }
    }
  }
  return salida;
}
