import { randomBytes } from "crypto";
import { assertDb } from "../firebase";
import type { Booking, BookingLink, BookingRequest, Worker } from "../types";

const WORKERS = "workers";
const BOOKINGS = "bookings";
const LINKS = "bookingLinks";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function newToken() {
  return randomBytes(12).toString("base64url");
}

function nextWorkerId(existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = /^W(\d+)$/i.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `W${String(max + 1).padStart(3, "0")}`;
}

function isSurveyMain(data: Record<string, unknown>): boolean {
  if (typeof data.survey_main === "boolean") return data.survey_main;
  if (typeof data.surveyMain === "boolean") return data.surveyMain;
  const role = String(data.role ?? "");
  return /調査メイン|survey/i.test(role);
}

/** nittei workers → choseikun Worker */
export function mapWorkerDoc(id: string, data: Record<string, unknown>): Worker {
  const workerId = String(data.worker_id ?? id);
  const email = String(data.email ?? data.googleEmail ?? "").trim();
  const calendarId = String(data.calendar_id ?? data.calendarId ?? (email || "primary")).trim();
  return {
    id: workerId,
    name: String(data.name ?? "").trim() || workerId,
    googleEmail: email,
    oauthLinked: Boolean(data.google_refresh_token || data.oauthLinked),
    surveyMain: isSurveyMain(data),
    rank: String(data.rank ?? "").trim(),
    calendarId: calendarId || "primary",
    active: data.is_active !== false && data.active !== false,
  };
}

export async function fsLoadWorkers(): Promise<Worker[]> {
  const db = assertDb();
  const snap = await db.collection(WORKERS).get();
  const workers = snap.docs.map((d) => mapWorkerDoc(d.id, d.data() as Record<string, unknown>));
  workers.sort((a, b) => a.id.localeCompare(b.id));
  return workers;
}

export async function fsUpsertWorker(
  input: Partial<Worker> & { name: string; googleEmail: string },
): Promise<Worker> {
  const db = assertDb();
  const coll = db.collection(WORKERS);

  if (input.id) {
    const ref = coll.doc(input.id);
    const existing = await ref.get();
    if (!existing.exists) throw new Error("職人が見つかりません");
    const prev = existing.data() ?? {};
    const patch = {
      ...prev,
      worker_id: input.id,
      name: input.name,
      email: input.googleEmail,
      calendar_id: input.calendarId ?? prev.calendar_id ?? input.googleEmail,
      is_active: input.active ?? prev.is_active ?? true,
      survey_main: input.surveyMain ?? prev.survey_main ?? false,
      rank: input.rank ?? prev.rank ?? "",
      role: input.surveyMain ? "調査メイン" : (prev.role ?? ""),
    };
    // oauthLinked はトークン有無で見る。手入力 true だけではトークンは作らない
    await ref.set(patch, { merge: true });
    return mapWorkerDoc(input.id, patch as Record<string, unknown>);
  }

  const listed = await fsLoadWorkers();
  const workerId = nextWorkerId(listed.map((w) => w.id));
  const worker = {
    worker_id: workerId,
    name: input.name,
    email: input.googleEmail,
    calendar_id: input.calendarId ?? input.googleEmail,
    is_active: input.active ?? true,
    survey_main: input.surveyMain ?? false,
    role: input.surveyMain ? "調査メイン" : "",
    rank: input.rank ?? "",
    note: "choseikun",
    display_order: listed.length + 1,
    fixed_days_off: [] as number[],
  };
  await coll.doc(workerId).set(worker);
  return mapWorkerDoc(workerId, worker as unknown as Record<string, unknown>);
}

export async function fsLoadBookingLinks(): Promise<BookingLink[]> {
  const db = assertDb();
  const snap = await db.collection(LINKS).get();
  const links = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: String(x.id ?? d.id),
      token: String(x.token),
      workerIds: (x.workerIds as string[]) ?? [],
      note: String(x.note ?? ""),
      createdAt: String(x.createdAt ?? ""),
      active: x.active !== false,
    } satisfies BookingLink;
  });
  links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return links;
}

export async function fsCreateBookingLink(input: {
  workerIds: string[];
  note?: string;
}): Promise<BookingLink> {
  const workers = await fsLoadWorkers();
  const activeIds = new Set(workers.filter((w) => w.active).map((w) => w.id));
  const workerIds =
    input.workerIds.length > 0 ? input.workerIds.filter((id) => activeIds.has(id)) : [...activeIds];
  if (workerIds.length === 0) throw new Error("候補職人が1人もいません");

  const link: BookingLink = {
    id: newId("lnk"),
    token: newToken(),
    workerIds,
    note: input.note?.trim() ?? "",
    createdAt: new Date().toISOString(),
    active: true,
  };
  const db = assertDb();
  await db.collection(LINKS).doc(link.id).set(link);
  return link;
}

export async function fsGetBookingLinkByToken(token: string): Promise<BookingLink | null> {
  const db = assertDb();
  const snap = await db.collection(LINKS).where("token", "==", token).limit(5).get();
  const hit = snap.docs.map((d) => d.data()).find((x) => x.active !== false);
  if (!hit) return null;
  return {
    id: String(hit.id),
    token: String(hit.token),
    workerIds: (hit.workerIds as string[]) ?? [],
    note: String(hit.note ?? ""),
    createdAt: String(hit.createdAt),
    active: true,
  };
}

export async function fsLoadBookings(): Promise<Booking[]> {
  const db = assertDb();
  const snap = await db.collection(BOOKINGS).get();
  const bookings = snap.docs.map((d) => {
    const x = d.data();
    return {
      id: String(x.id ?? d.id),
      linkToken: (x.linkToken as string | null) ?? null,
      status: x.status === "cancelled" ? "cancelled" : "confirmed",
      address: String(x.address ?? ""),
      parking: x.parking,
      phone: String(x.phone ?? ""),
      name: String(x.name ?? ""),
      email: String(x.email ?? ""),
      start: String(x.start),
      end: String(x.end),
      workerIds: (x.workerIds as string[]) ?? [],
      createdAt: String(x.createdAt ?? ""),
      cancelledAt: (x.cancelledAt as string | null) ?? null,
    } as Booking;
  });
  bookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return bookings;
}

export async function fsGetConfirmedBookingForLink(token: string): Promise<Booking | null> {
  const db = assertDb();
  // 単一フィールド where（複合インデックス不要）。confirmed はアプリ側で絞る
  const snap = await db.collection(BOOKINGS).where("linkToken", "==", token).get();
  const doc = snap.docs.find((d) => d.data().status === "confirmed");
  if (!doc) return null;
  const x = doc.data();
  return {
    id: String(x.id ?? doc.id),
    linkToken: token,
    status: "confirmed",
    address: String(x.address ?? ""),
    parking: x.parking,
    phone: String(x.phone ?? ""),
    name: String(x.name ?? ""),
    email: String(x.email ?? ""),
    start: String(x.start),
    end: String(x.end),
    workerIds: (x.workerIds as string[]) ?? [],
    createdAt: String(x.createdAt),
    cancelledAt: null,
  } as Booking;
}

export async function fsCreateBooking(req: BookingRequest): Promise<Booking> {
  if (req.linkToken) {
    const link = await fsGetBookingLinkByToken(req.linkToken);
    if (!link) throw new Error("ご案内URLが無効です");
    const existing = await fsGetConfirmedBookingForLink(req.linkToken);
    if (existing) throw new Error("このURLではすでに予約が確定しています");
  }

  let workerIds = req.workerIds?.filter(Boolean) ?? [];
  if (workerIds.length === 0 && req.linkToken) {
    const link = await fsGetBookingLinkByToken(req.linkToken);
    workerIds = link?.workerIds.slice(0, 2) ?? [];
  }

  const booking: Booking = {
    id: newId("bk"),
    linkToken: req.linkToken ?? null,
    status: "confirmed",
    address: req.address.trim(),
    parking: req.parking,
    phone: req.phone.trim(),
    name: req.name.trim(),
    email: req.email.trim(),
    start: req.start,
    end: req.end,
    workerIds,
    createdAt: new Date().toISOString(),
    cancelledAt: null,
  };

  const db = assertDb();
  await db.collection(BOOKINGS).doc(booking.id).set(booking);
  return booking;
}

export async function fsCancelBooking(id: string): Promise<Booking> {
  const db = assertDb();
  const ref = db.collection(BOOKINGS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("予約が見つかりません");
  const prev = doc.data()!;
  if (prev.status === "cancelled") {
    return { ...(prev as Booking), id };
  }
  const next = {
    ...prev,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  };
  await ref.set(next, { merge: true });
  return { ...(next as Booking), id };
}
