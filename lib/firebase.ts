import { existsSync } from "fs";
import path from "path";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function resolveCredentialsPath(): string | null {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!raw) return null;
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

/** Firebase Admin 初期化（未設定時は null） */
export function getFirebaseApp(): App | null {
  if (getApps().length > 0) return getApps()[0]!;

  try {
    const credPath = resolveCredentialsPath();
    if (credPath) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    }
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
      "Firestore に接続できません。GOOGLE_APPLICATION_CREDENTIALS を確認してください。",
    );
  }
  return db;
}
