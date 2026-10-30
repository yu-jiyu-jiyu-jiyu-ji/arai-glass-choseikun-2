import { promises as fs } from "fs";
import path from "path";
import { APP_CONFIG } from "../config";
import { assertDb } from "../firebase";
import { CACHE_KEYS, cacheDelete } from "../cache";

const TOKEN_PATH = path.join(process.cwd(), "data", "oauth-tokens.json");

type TokenMap = Record<string, { refreshToken: string; updatedAt: string }>;

async function readLocal(): Promise<TokenMap> {
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf-8");
    return JSON.parse(raw) as TokenMap;
  } catch {
    return {};
  }
}

async function writeLocal(map: TokenMap) {
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  await fs.writeFile(TOKEN_PATH, JSON.stringify(map, null, 2), "utf-8");
}

export async function getWorkerRefreshToken(workerId: string): Promise<string | null> {
  if (APP_CONFIG.dataBackend === "firestore") {
    const db = assertDb();
    const doc = await db.collection("workers").doc(workerId).get();
    if (!doc.exists) return null;
    const data = doc.data() ?? {};
    const token = String(data.google_refresh_token ?? "").trim();
    return token || null;
  }
  const map = await readLocal();
  return map[workerId]?.refreshToken ?? null;
}

export async function saveWorkerRefreshToken(workerId: string, refreshToken: string): Promise<void> {
  if (APP_CONFIG.dataBackend === "firestore") {
    const db = assertDb();
    const ref = db.collection("workers").doc(workerId);
    const doc = await ref.get();
    if (!doc.exists) {
      throw new Error(`職人が見つかりません: ${workerId}`);
    }
    await ref.set(
      {
        google_refresh_token: refreshToken,
        oauthLinked: true,
        oauth_linked_at: new Date().toISOString(),
      },
      { merge: true },
    );
    cacheDelete(CACHE_KEYS.workers);
    return;
  }

  const map = await readLocal();
  map[workerId] = { refreshToken, updatedAt: new Date().toISOString() };
  await writeLocal(map);
}
