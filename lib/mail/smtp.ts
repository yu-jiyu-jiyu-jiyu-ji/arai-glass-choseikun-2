import nodemailer, { type Transporter } from "nodemailer";

export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASSWORD?.trim(),
  );
}

/** Resend など HTTPS API（Render Free は SMTP ポートが塞がるため） */
export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function mailConfigured(): boolean {
  return resendConfigured() || smtpConfigured();
}

function fromAddress(): string {
  return (
    process.env.SMTP_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
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
    family: 4,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
    auth: baseAuth(),
  });
}

type SendOpts = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

async function sendViaResend(opts: SendOpts): Promise<void> {
  const key = process.env.RESEND_API_KEY!.trim();
  const from = fromAddress();
  const attachments = opts.attachments?.map((a) => ({
    filename: a.filename,
    content: a.content.toString("base64"),
    content_type: a.contentType,
  }));

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };
  if (!res.ok) {
    throw new Error(body.message || body.name || `Resend API ${res.status}`);
  }
  console.info(`[mail] resend ok to=${opts.to} id=${body.id || "(none)"}`);
}

async function sendViaSmtp(opts: SendOpts): Promise<void> {
  const configuredPort = Number(process.env.SMTP_PORT || "587");
  const attempts: { port: number; secure: boolean }[] = [
    { port: configuredPort, secure: configuredPort === 465 },
  ];
  if (configuredPort === 587) attempts.push({ port: 465, secure: true });
  else if (configuredPort === 465) attempts.push({ port: 587, secure: false });

  let lastError: unknown;
  for (const attempt of attempts) {
    const transporter = createTransport(attempt.port, attempt.secure);
    try {
      const info = await withTimeout(
        transporter.sendMail({
          from: fromAddress(),
          to: opts.to,
          subject: opts.subject,
          text: opts.text,
          html: opts.html,
          attachments: opts.attachments,
        }),
        15_000,
        `SMTP送信タイムアウト (${opts.to} port=${attempt.port})`,
      );
      console.info(
        `[mail] smtp ok to=${opts.to} messageId=${info.messageId || "(none)"} port=${attempt.port}`,
      );
      return;
    } catch (e) {
      lastError = e;
      console.warn(
        `[mail] smtp failed port=${attempt.port}:`,
        e instanceof Error ? e.message : e,
      );
    } finally {
      transporter.close();
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function sendMail(opts: SendOpts): Promise<void> {
  if (!mailConfigured()) {
    throw new Error(
      "メール送信が未設定です（RESEND_API_KEY または SMTP_HOST / SMTP_USER / SMTP_PASSWORD）",
    );
  }

  // Render Free は SMTP ポート遮断のため、Resend があれば優先
  if (resendConfigured()) {
    await sendViaResend(opts);
    return;
  }
  await sendViaSmtp(opts);
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
