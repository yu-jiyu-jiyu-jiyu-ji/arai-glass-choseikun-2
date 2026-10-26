/**
 * 環境フラグのみ。業務パラメータは lib/settings.ts（設定画面）を参照。
 */
export type DataBackend = "json" | "firestore";

function resolveDataBackend(): DataBackend {
  const explicit = process.env.CHOSEIKUN_DATA_BACKEND?.trim().toLowerCase();
  if (explicit === "firestore" || explicit === "json") return explicit;
  // 鍵がありモックOFFなら Firestore
  if (
    process.env.CHOSEIKUN_USE_MOCK === "false" &&
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()
  ) {
    return "firestore";
  }
  return "json";
}

export const APP_CONFIG = {
  companyName: "荒井硝子",
  /**
   * true: カレンダー予定・移動時間はモック（当面）。
   * Firestore 台帳とは独立。間検索の本番接続は次フェーズ。
   */
  useMockProviders: process.env.CHOSEIKUN_USE_MOCK !== "false",
  /** workers / bookings / bookingLinks の保存先 */
  dataBackend: resolveDataBackend() as DataBackend,
} as const;
