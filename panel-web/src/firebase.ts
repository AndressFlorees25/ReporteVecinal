import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// La configuración web se copia desde Firebase Console > Configuración del proyecto > Tus apps > App web.
// Va en panel-web/.env.local (no se versiona); ver .env.example.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const configuracionCompleta = Boolean(config.apiKey && config.projectId);

export const app = initializeApp(config);
export const auth = getAuth(app);
auth.languageCode = 'es';
export const db = getFirestore(app);
