import nodemailer from "nodemailer";

export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim(),
  );
}

function fromAddress(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "noreply@example.com"
  );
}

/** Gmailアプリパスワードはスペース入りで貼られることがあるので除去 */
function smtpPassword(): string {
  return (process.env.SMTP_PASSWORD || "").replace(/\s+/g, "");
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}): Promise<void> {
  if (!smtpConfigured()) {
    throw new Error("SMTP が未設定です（SMTP_HOST / SMTP_USER / SMTP_PASSWORD）");
  }
  const port = Number(process.env.SMTP_PORT || "587");
  const useSsl = port === 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: useSsl,
    requireTLS: !useSsl && port === 587,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: smtpPassword(),
    },
  });
  const info = await withTimeout(
    transporter.sendMail({
      from: fromAddress(),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: opts.attachments,
    }),
    12_000,
    `SMTP送信タイムアウト (${opts.to})`,
  );
  console.info(`[mail] sent to=${opts.to} messageId=${info.messageId || "(none)"}`);
}

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
