import { promises as fs } from "fs";
import path from "path";
import { APP_CONFIG } from "./config";
import { assertDb, getDb } from "./firebase";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type AppSettings,
} from "./settings-shared";

export type { AppSettings, WorkdayKey, InviteFreeStatus, ImageSendMode } from "./settings-shared";
export {
  DEFAULT_SETTINGS,
  WORKDAY_LABELS,
  INVITE_STATUS_OPTIONS,
  officeFullAddress,
  workdayKeyFromDate,
  mergeSettings,
} from "./settings-shared";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");
const FS_DOC = "settings/app";

async function loadFromJsonFile(): Promise<Partial<AppSettings> | null> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return JSON.parse(raw) as Partial<AppSettings>;
  } catch {
    return null;
  }
}

async function loadFromFirestore(): Promise<Partial<AppSettings> | null> {
  const db = getDb();
  if (!db) return null;
  const doc = await db.doc(FS_DOC).get();
  if (!doc.exists) return null;
  return (doc.data() ?? {}) as Partial<AppSettings>;
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    if (APP_CONFIG.dataBackend === "firestore") {
      const fromFs = await loadFromFirestore();
      if (fromFs) return mergeSettings(fromFs);
      // 初回: ローカル JSON があれば移行シード
      const fromFile = await loadFromJsonFile();
      const seeded = mergeSettings(fromFile ?? {});
      try {
        await assertDb().doc(FS_DOC).set(seeded, { merge: true });
      } catch (e) {
        console.warn("[settings] firestore seed failed, using merged defaults", e);
      }
      return seeded;
    }
    const fromFile = await loadFromJsonFile();
    return mergeSettings(fromFile ?? {});
  } catch (e) {
    console.error("[settings] load failed", e);
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = mergeSettings({ ...current, ...partial });

  if (APP_CONFIG.dataBackend === "firestore") {
    await assertDb().doc(FS_DOC).set(next, { merge: true });
    return next;
  }

  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
