import { loadSettings } from "../settings";
import { loadWorkers } from "../store";
import { jstParts } from "../time/jst";
import type { Booking } from "../types";
import { sendMail, smtpConfigured } from "./smtp";

function formatVisit(iso: string): string {
  const d = new Date(iso);
  const p = jstParts(d);
  const week = ["日", "月", "火", "水", "木", "金", "土"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}/${p.month}/${p.day}(${week[p.weekday]}) ${pad(p.hour)}:${pad(p.minute)}`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 予約成立時: 担当職人へ通知 + 顧客へ案内（メールがある場合） */
export async function sendBookingNotifications(booking: Booking): Promise<void> {
  if (!smtpConfigured()) {
    console.warn("[mail] SMTP未設定のため予約通知をスキップ");
    return;
  }

  const settings = await loadSettings();
  const workers = await loadWorkers();
  const assigned = workers.filter(
    (w) => booking.workerIds.includes(w.id) && w.notifyOnBooking !== false && w.googleEmail,
  );

  const summary = [
    `日時: ${formatVisit(booking.start)}`,
    `お客様: ${booking.name}`,
    `住所: ${booking.address}`,
    `電話: ${booking.phone}`,
    booking.email ? `メール: ${booking.email}` : null,
    booking.note ? `備考: ${booking.note}` : null,
    `予約ID: ${booking.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  await Promise.all(
    assigned.map(async (w) => {
      try {
        await sendMail({
          to: w.googleEmail,
          subject: `【調整君】新規予約 ${booking.name}様 / ${formatVisit(booking.start)}`,
          text: `${w.name} さん\n\n新しい訪問調査予約が入りました。\n\n${summary}\n`,
        });
      } catch (e) {
        console.error(`[mail] staff notify failed ${w.id}`, e);
      }
    }),
  );

  if (!booking.email?.trim()) return;

  const body = (settings.customerMailBody || "").trim();
  const text = [
    `${booking.name} 様`,
    "",
    "ご予約ありがとうございます。内容は以下のとおりです。",
    "",
    summary,
    "",
    body,
  ].join("\n");

  const image = settings.guideImageDataUrl?.trim();
  const mode = settings.guideImageSendMode ?? "inline";
  const fileName = settings.guideImageFileName || "guide.jpg";
  const subject = `【荒井硝子】訪問調査のご予約確認（${formatVisit(booking.start)}）`;

  try {
    if (image && mode === "attachment") {
      const match = /^data:([^;]+);base64,(.+)$/.exec(image);
      await sendMail({
        to: booking.email.trim(),
        subject,
        text,
        attachments: match
          ? [
              {
                filename: fileName,
                content: Buffer.from(match[2], "base64"),
                contentType: match[1],
              },
            ]
          : undefined,
      });
      return;
    }

    if (image && mode === "inline") {
      await sendMail({
        to: booking.email.trim(),
        subject,
        text,
        html: `<pre style="font-family:sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre><p><img src="${image}" alt="ご案内" style="max-width:100%;height:auto" /></p>`,
      });
      return;
    }

    await sendMail({ to: booking.email.trim(), subject, text });
  } catch (e) {
    console.error("[mail] customer notify failed", e);
  }
}
