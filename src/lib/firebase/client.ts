import { initializeApp, getApps, getApp } from "firebase/app";

/**
 * ブラウザ側のFirebase初期化(Google Cloud Identity Platform)。
 * NEXT_PUBLIC_*はクライアントバンドルに埋め込まれる値(秘匿情報ではない)。
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
