import nodemailer, { type Transporter } from "nodemailer";

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

function baseAuth() {
  return {
    user: process.env.SMTP_USER!.trim(),
    pass: smtpPassword(),
  };
}

function createTransport(port: number, secure: boolean): Transporter {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure,
    requireTLS: !secure && port === 587,
    // Render 等で IPv6 経由がハングすることがあるため IPv4 固定
    family: 4,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    auth: baseAuth(),
  });
}

async function sendWithTransport(
  transporter: Transporter,
  opts: {
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: { filename: string; content: Buffer; contentType?: string }[];
  },
) {
  const info = await transporter.sendMail({
    from: fromAddress(),
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });
  console.info(
    `[mail] sent to=${opts.to} messageId=${info.messageId || "(none)"} response=${info.response || ""}`,
  );
  return info;
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

  const configuredPort = Number(process.env.SMTP_PORT || "587");
  const attempts: { port: number; secure: boolean }[] = [
    { port: configuredPort, secure: configuredPort === 465 },
  ];
  // 587 でハング／失敗したら 465 を試す（逆も同様）
  if (configuredPort === 587) attempts.push({ port: 465, secure: true });
  else if (configuredPort === 465) attempts.push({ port: 587, secure: false });

  let lastError: unknown;
  for (const attempt of attempts) {
    const transporter = createTransport(attempt.port, attempt.secure);
    try {
      await withTimeout(
        sendWithTransport(transporter, opts),
        15_000,
        `SMTP送信タイムアウト (${opts.to} port=${attempt.port})`,
      );
      return;
    } catch (e) {
      lastError = e;
      console.warn(
        `[mail] send failed port=${attempt.port}:`,
        e instanceof Error ? e.message : e,
      );
    } finally {
      transporter.close();
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
