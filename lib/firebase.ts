import { existsSync } from "fs";
import path from "path";
import { cert, getApps, initializeApp, type App, type ServiceAccount } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function resolveCredentialsPath(): string | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!raw) return null;
  // JSON 本文が誤ってこの変数に入っている場合
  if (raw.startsWith("{")) return null;
  if (path.isAbsolute(raw) && existsSync(raw)) return raw;
  const fromCwd = path.resolve(/*turbopackIgnore: true*/ process.cwd(), raw);
  if (existsSync(fromCwd)) return fromCwd;
  const fromNittei = path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    "..",
    "nittei_chosei_system",
    path.basename(raw),
  );
  if (existsSync(fromNittei)) return fromNittei;
  return null;
}

/** Render 等: JSON 本文を環境変数で渡す（推奨キー名） */
function serviceAccountFromEnv(): ServiceAccount | null {
  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()?.startsWith("{")
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS.trim()
      : "");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch (e) {
    console.error("[firebase] GOOGLE_SERVICE_ACCOUNT_JSON の JSON 解析に失敗", e);
    return null;
  }
}

/** Firebase Admin 初期化（未設定時は null） */
export function getFirebaseApp(): App | null {
  if (getApps().length > 0) return getApps()[0]!;

  try {
    const fromJson = serviceAccountFromEnv();
    if (fromJson) {
      return initializeApp({
        credential: cert(fromJson),
        projectId: (fromJson as { project_id?: string }).project_id,
      });
    }

    const credPath = resolveCredentialsPath();
    if (credPath) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
      return initializeApp();
    }

    // 最後の手段: ADC
    return initializeApp();
  } catch (e) {
    console.error("[firebase] init failed", e);
    return null;
  }
}

export function getDb(): Firestore | null {
  const a = getFirebaseApp();
  if (!a) return null;
  return getFirestore(a);
}

export function assertDb(): Firestore {
  const db = getDb();
  if (!db) {
    throw new Error(
      "Firestore に接続できません。GOOGLE_SERVICE_ACCOUNT_JSON または GOOGLE_APPLICATION_CREDENTIALS を確認してください。",
    );
  }
  return db;
}
