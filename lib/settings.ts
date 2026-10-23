import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_SETTINGS, type AppSettings } from "./settings-shared";

export type { AppSettings, WorkdayKey } from "./settings-shared";
export {
  DEFAULT_SETTINGS,
  WORKDAY_LABELS,
  officeFullAddress,
  workdayKeyFromDate,
} from "./settings-shared";

const SETTINGS_PATH = path.join(process.cwd(), "data", "settings.json");

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const next = { ...current, ...partial };
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true });
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), "utf-8");
  return next;
}
