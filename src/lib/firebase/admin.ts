import { initializeApp, getApps, applicationDefault, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";

/**
 * サーバー側のFirebase Admin初期化(Google Cloud Identity Platform)。
 * Cloud Run上ではサービスアカウントのApplication Default Credentials(ADC)で
 * 認証するため、鍵ファイルの管理は不要。
 */
function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
