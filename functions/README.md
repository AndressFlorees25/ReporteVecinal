# Bot de WhatsApp (Cloud Functions)

Permite reportar sin instalar la app: el vecino escribe al número del bot, manda una **foto**, comparte la
**ubicación** y elige el **tipo** de problema. Queda un reporte igual a los de la app (`origen: "WHATSAPP"`),
en la comuna que corresponde según los límites de `comunas`, y el panel lo muestra con el canal «WhatsApp».

- Comandos: **ESTADO** (últimos 5 reportes del vecino) y **CANCELAR** (descarta la conversación).
- El teléfono no se guarda: el `uid` del reporte es `wa_` + un hash con sal del número.
- La conversación a medias vive en `whatsappSesiones/{uid}` (solo la función la lee: las reglas no la exponen)
  y se descarta tras 2 horas sin respuesta.
- La foto se guarda en Storage, `reportes/whatsapp/{reporteId}.jpg`.

## Código

| Archivo | Qué hace |
| --- | --- |
| `src/bot.ts` | La conversación (sin dependencias de red: se prueba en memoria) |
| `src/whatsapp.ts` | API de WhatsApp Cloud: enviar texto y listas, descargar imágenes, leer el webhook y validar su firma |
| `src/geo.ts` | Punto en polígono y geohash, iguales a los de la app |
| `src/index.ts` | La función `whatsappWebhook` (región `southamerica-west1`) |

```bash
npm install
npm test        # compila y corre las pruebas del bot
```

## Puesta en marcha

Requisitos: proyecto de Firebase en plan **Blaze** (Cloud Functions y Storage lo exigen; tiene capa gratuita)
y una cuenta de Meta.

1. **Meta:** en <https://developers.facebook.com> crea una app de tipo *Business* y agrega el producto
   **WhatsApp**. Meta entrega un **número de prueba** gratis (envía a hasta 5 teléfonos que registres): sirve
   para la demo. Para producción, agrega un número propio (un chip nuevo) y verifica el negocio.
2. Anota: **Phone number ID**, un **token de acceso permanente** (usuario del sistema con permiso
   `whatsapp_business_messaging`) y el **App Secret** (Configuración de la app → Básica).
3. **Secretos y parámetros en Firebase** (desde la raíz del repo):
   ```bash
   firebase functions:secrets:set WHATSAPP_TOKEN
   firebase functions:secrets:set WHATSAPP_APP_SECRET
   firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN   # una palabra que inventas tú
   firebase functions:secrets:set WHATSAPP_SAL            # texto largo al azar; no lo cambies después
   firebase deploy --only functions                       # pregunta WHATSAPP_PHONE_NUMBER_ID
   ```
4. **Webhook en Meta:** WhatsApp → Configuración → Webhook. URL = la que muestra el deploy
   (`https://southamerica-west1-<proyecto>.cloudfunctions.net/whatsappWebhook`), token de verificación = el
   `WHATSAPP_VERIFY_TOKEN`. Suscríbete al campo **messages**.
5. Escribe «hola» al número del bot.

## Costos

Según la página oficial de precios de Meta, las respuestas dentro de las 24 horas siguientes al mensaje del
vecino (todo este flujo) no se cobran. Se pagan por mensaje los que la municipalidad inicie fuera de esa
ventana (el bot no envía ninguno). Firebase cobra por uso sobre la capa gratuita.

## Probar en el emulador

`.secret.local` y `.env.local` (no se versionan) traen valores de prueba. `npm run emulador` levanta
Functions, Firestore y Storage; los envíos a WhatsApp fallan (no hay token real) y quedan en el log.
