/** 駐車場区分 */
export type Parking = "onsite" | "coin" | "front" | "none";

/** カレンダー予定の分類（仕様方針B） */
export type CalendarEventKind = "site" | "busy";

export type LatLng = { lat: number; lng: number };

export type Worker = {
  id: string;
  name: string;
  /** Google アカウント（Calendar 連携用） */
  googleEmail: string;
  /** OAuth 連携済みか（モックでは手入力で true にできる） */
  oauthLinked: boolean;
  /** 調査メインで動いている人 */
  surveyMain: boolean;
  calendarId: string;
  active: boolean;
};

export type CalendarEvent = {
  id: string;
  workerId: string;
  kind: CalendarEventKind;
  title: string;
  start: Date;
  end: Date;
  /** kind=site のとき必須。busy（移動等）は null */
  location: string | null;
  latLng: LatLng | null;
};

export type SlotCandidate = {
  start: Date;
  end: Date;
  workerIds: string[];
  deltaTMinutes: number;
  travelInMinutes: number;
  travelOutMinutes: number;
};

export type PublicSlot = {
  start: string; // ISO
  end: string; // ISO
  /** 内部用。顧客UIには出さない */
  workerIds?: string[];
};

export type SearchSlotsRequest = {
  address: string;
  /** 発行リンクの候補職人。未指定なら全社 */
  workerIds?: string[];
  linkToken?: string;
};

export type SearchSlotsResponse = {
  recommended: PublicSlot[];
  days: { date: string; slots: PublicSlot[] }[];
  meta: {
    mode: "mock" | "live";
    searchedDays: number;
    workersConsidered: number;
  };
};

export type BookingStatus = "confirmed" | "cancelled";

export type Booking = {
  id: string;
  linkToken: string | null;
  status: BookingStatus;
  address: string;
  parking: Parking;
  phone: string;
  name: string;
  email: string;
  start: string;
  end: string;
  /** 確定時に選出した担当（基本2人） */
  workerIds: string[];
  createdAt: string;
  cancelledAt: string | null;
};

export type BookingLink = {
  id: string;
  token: string;
  /** 間検索の候補プール（複数・全員可） */
  workerIds: string[];
  note: string;
  createdAt: string;
  active: boolean;
};

export type BookingRequest = {
  address: string;
  parking: Parking;
  phone: string;
  name: string;
  email: string;
  start: string;
  end: string;
  workerIds?: string[];
  linkToken?: string;
};

export type BookingResponse = {
  id: string;
  status: BookingStatus;
  mode: "mock" | "live";
  linkToken?: string | null;
};
