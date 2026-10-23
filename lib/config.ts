/**
 * 環境フラグのみ。業務パラメータは lib/settings.ts（設定画面）を参照。
 */
export const APP_CONFIG = {
  companyName: "荒井硝子",
  /** true のあいだはモックデータで間検索 */
  useMockProviders: process.env.CHOSEIKUN_USE_MOCK !== "false",
  /**
   * 既存 nittei_chosei_system と同じ認証を使う想定:
   * - Firebase: GOOGLE_APPLICATION_CREDENTIALS
   * - Calendar: GOOGLE_OAUTH_CLIENT_ID / SECRET / REDIRECT_URI
   * - Maps: 別途 GOOGLE_MAPS_API_KEY（Distance Matrix / Geocoding）
   */
} as const;
