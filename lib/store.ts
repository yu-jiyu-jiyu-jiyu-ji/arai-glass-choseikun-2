import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { APP_CONFIG } from "./config";
import { MOCK_WORKERS } from "./providers/mock";
import * as fsStore from "./providers/firestore-store";
import type { Booking, BookingLink, BookingRequest, Worker } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const WORKERS_PATH = path.join(DATA_DIR, "workers.json");
const LINKS_PATH = path.join(DATA_DIR, "booking-links.json");
const BOOKINGS_PATH = path.join(DATA_DIR, "bookings.json");

const useFirestore = () => APP_CONFIG.dataBackend === "firestore";

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function newToken() {
  return randomBytes(12).toString("base64url");
}

/** 職人マスタ */
export async function loadWorkers(): Promise<Worker[]> {
  if (useFirestore()) return fsStore.fsLoadWorkers();

  const existing = await readJson<Worker[] | null>(WORKERS_PATH, null);
  if (existing && Array.isArray(existing) && existing.length > 0) {
    return existing;
  }
  await writeJson(WORKERS_PATH, MOCK_WORKERS);
  return [...MOCK_WORKERS];
}

export async function saveWorkers(workers: Worker[]): Promise<Worker[]> {
  if (useFirestore()) {
    throw new Error("Firestore モードでは一括 saveWorkers は未対応です。upsertWorker を使ってください。");
  }
  await writeJson(WORKERS_PATH, workers);
  return workers;
}

export async function upsertWorker(
  input: Partial<Worker> & { name: string; googleEmail: string },
): Promise<Worker> {
  if (useFirestore()) return fsStore.fsUpsertWorker(input);

  const workers = await loadWorkers();
  if (input.id) {
    const idx = workers.findIndex((w) => w.id === input.id);
    if (idx < 0) throw new Error("職人が見つかりません");
    const next: Worker = {
      ...workers[idx],
      ...input,
      id: workers[idx].id,
      calendarId: input.calendarId ?? workers[idx].calendarId,
    };
    workers[idx] = next;
    await writeJson(WORKERS_PATH, workers);
    return next;
  }
  const worker: Worker = {
    id: newId("w"),
    name: input.name,
    googleEmail: input.googleEmail,
    oauthLinked: input.oauthLinked ?? false,
    surveyMain: input.surveyMain ?? false,
    calendarId: input.calendarId ?? `cal-${Date.now()}`,
    active: input.active ?? true,
  };
  workers.push(worker);
  await writeJson(WORKERS_PATH, workers);
  return worker;
}

export async function loadBookingLinks(): Promise<BookingLink[]> {
  if (useFirestore()) return fsStore.fsLoadBookingLinks();
  return readJson<BookingLink[]>(LINKS_PATH, []);
}

export async function createBookingLink(input: {
  workerIds: string[];
  note?: string;
}): Promise<BookingLink> {
  if (useFirestore()) return fsStore.fsCreateBookingLink(input);

  const workers = await loadWorkers();
  const activeIds = new Set(workers.filter((w) => w.active).map((w) => w.id));
  const workerIds =
    input.workerIds.length > 0 ? input.workerIds.filter((id) => activeIds.has(id)) : [...activeIds];

  if (workerIds.length === 0) {
    throw new Error("候補職人が1人もいません");
  }

  const link: BookingLink = {
    id: newId("lnk"),
    token: newToken(),
    workerIds,
    note: input.note?.trim() ?? "",
    createdAt: new Date().toISOString(),
    active: true,
  };
  const links = await loadBookingLinks();
  links.unshift(link);
  await writeJson(LINKS_PATH, links);
  return link;
}

export async function getBookingLinkByToken(token: string): Promise<BookingLink | null> {
  if (useFirestore()) return fsStore.fsGetBookingLinkByToken(token);
  const links = await loadBookingLinks();
  return links.find((l) => l.token === token && l.active) ?? null;
}

export async function loadBookings(): Promise<Booking[]> {
  if (useFirestore()) return fsStore.fsLoadBookings();
  return readJson<Booking[]>(BOOKINGS_PATH, []);
}

export async function getConfirmedBookingForLink(token: string): Promise<Booking | null> {
  if (useFirestore()) return fsStore.fsGetConfirmedBookingForLink(token);
  const bookings = await loadBookings();
  return bookings.find((b) => b.linkToken === token && b.status === "confirmed") ?? null;
}

export async function createBooking(req: BookingRequest): Promise<Booking> {
  if (useFirestore()) return fsStore.fsCreateBooking(req);

  if (req.linkToken) {
    const link = await getBookingLinkByToken(req.linkToken);
    if (!link) throw new Error("ご案内URLが無効です");
    const existing = await getConfirmedBookingForLink(req.linkToken);
    if (existing) throw new Error("このURLではすでに予約が確定しています");
  }

  let workerIds = req.workerIds?.filter(Boolean) ?? [];
  if (workerIds.length === 0 && req.linkToken) {
    const link = await getBookingLinkByToken(req.linkToken);
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

  const bookings = await loadBookings();
  bookings.unshift(booking);
  await writeJson(BOOKINGS_PATH, bookings);
  return booking;
}

export async function cancelBooking(id: string): Promise<Booking> {
  if (useFirestore()) return fsStore.fsCancelBooking(id);

  const bookings = await loadBookings();
  const idx = bookings.findIndex((b) => b.id === id);
  if (idx < 0) throw new Error("予約が見つかりません");
  if (bookings[idx].status === "cancelled") return bookings[idx];
  bookings[idx] = {
    ...bookings[idx],
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
  };
  await writeJson(BOOKINGS_PATH, bookings);
  return bookings[idx];
}
