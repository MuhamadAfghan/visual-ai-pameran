import fs from "node:fs/promises";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env";
import { getSettings, getDecryptedSmtpPass } from "../services/systemSettings.service";
import { toLabel } from "../utils/violationLabels";

type ResolvedSmtp = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
  requireTLS: boolean;
  source: "db" | "env";
};

/**
 * Resolve SMTP credentials.
 * Priority: System Settings document in DB → process env vars.
 * The DB password is decrypted automatically if SETTINGS_ENCRYPTION_KEY is set.
 */
async function resolveSmtpConfig(): Promise<ResolvedSmtp | null> {
  // 1) Try DB
  try {
    const doc = await getSettings();
    const db = doc.smtp;
    const pass = getDecryptedSmtpPass(doc);
    // DB config is "complete" if host + user + password are present.
    // `from` may fall back to env if DB leaves it empty.
    if (db?.host && db.user && pass) {
      const port = db.port || env.SMTP_PORT;
      return {
        host: db.host,
        port,
        user: db.user,
        pass,
        from: db.from || env.SMTP_FROM || db.user,
        secure: port === 465,
        // tls flag in DB means: use STARTTLS on a non-465 port
        requireTLS: Boolean(db.tls) && port !== 465,
        source: "db"
      };
    }
  } catch (err) {
    console.warn("[mail] failed to read DB settings, falling back to env:", err);
  }

  // 2) Fallback to env
  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM,
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT === 587,
      source: "env"
    };
  }

  return null;
}

/** Cache transporter + signature so we don't rebuild on every send unless creds change. */
let cached: { signature: string; tx: Transporter; from: string } | null = null;

async function getTransporter(): Promise<{ tx: Transporter; from: string } | null> {
  const cfg = await resolveSmtpConfig();
  if (!cfg) return null;

  const signature = [cfg.source, cfg.host, cfg.port, cfg.user, cfg.pass, cfg.secure, cfg.requireTLS].join("|");
  if (cached && cached.signature === signature) {
    return { tx: cached.tx, from: cached.from };
  }

  const tx = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: cfg.requireTLS,
    auth: { user: cfg.user, pass: cfg.pass }
  });

  cached = { signature, tx, from: cfg.from };
  return { tx, from: cfg.from };
}

// ── Password reset ─────────────────────────────────────────────────────────────

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const t = await getTransporter();
  if (!t) {
    console.log(`[auth] SMTP not configured (DB & env both empty). Reset URL for ${to}: ${resetUrl}`);
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px;">
  <tr><td align="center">
    <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">

      <tr><td style="background:#ffffff;border-top:4px solid #1e293b;padding:40px 48px 36px;">

        <p style="margin:0 0 32px;font-size:16px;font-weight:700;color:#1e293b;letter-spacing:0.5px;">LUMICORE</p>

        <p style="margin:0 0 20px;font-size:15px;font-weight:600;color:#1e293b;">Permintaan Reset Password</p>

        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">
          Dengan hormat,
        </p>
        <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.7;">
          Kami menerima permintaan untuk mereset password akun Anda pada sistem Lumicore CCTV Monitoring.
          Klik tautan di bawah ini untuk melanjutkan proses reset password.
        </p>

        <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr><td style="background:#1e293b;">
            <a href="${resetUrl}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">
              Reset Password
            </a>
          </td></tr>
        </table>

        <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.7;">
          Tautan ini akan kedaluwarsa dalam <strong>1 jam</strong>.
          Apabila Anda tidak merasa melakukan permintaan ini, abaikan email ini dan password Anda tidak akan berubah.
        </p>

      </td></tr>

      <tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:16px 48px;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">
          Lumicore AI CCTV Monitoring System &mdash; Notifikasi Otomatis
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  await t.tx.sendMail({
    from: t.from,
    to,
    subject: "Permintaan Reset Password — Lumicore CCTV",
    text: `Silakan reset password Anda melalui tautan berikut:\n${resetUrl}\n\nTautan ini kedaluwarsa dalam 1 jam.`,
    html
  });
}

// ── Violation alert ───────────────────────────────────────────────────────────

export type ViolationItem = {
  check: string;
  confidence: number;
};

export type ViolationEmailData = {
  picName: string;
  cameraName: string;
  cameraCode: string;
  areaName: string;
  sectionName: string;
  violations: ViolationItem[];
  detectedAt: Date;
  snapshotUrl: string | null;
  snapshotPath: string | null;
  eventId: string;
};

export async function sendViolationEmail(to: string, data: ViolationEmailData): Promise<void> {
  const firstCheck = toLabel(data.violations[0]?.check ?? "Pelanggaran");
  const subjectLabel = data.violations.length === 1
    ? firstCheck
    : `${firstCheck} dan ${data.violations.length - 1} pelanggaran lainnya`;

  const t = await getTransporter();
  if (!t) {
    console.log(`[notify] SMTP not configured (DB & env both empty). Violation for ${to}: ${subjectLabel} @ ${data.cameraName}`);
    return;
  }

  const formattedDate = data.detectedAt.toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Jakarta"
  });
  const formattedTime = data.detectedAt.toLocaleTimeString("id-ID", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Jakarta"
  });

  const violationRows = data.violations.map((v, i) => `
    <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
      <td style="padding:10px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">
        ${toLabel(v.check)}
      </td>
      <td style="padding:10px 16px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;text-align:center;">
        ${(v.confidence * 100).toFixed(1)}%
      </td>
    </tr>`).join("");

  // Embed the snapshot as a CID attachment (raw bytes read from local disk) rather than
  // linking to STORAGE_BASE_URL — that URL is often unreachable by the recipient's mail
  // client (e.g. it points at localhost during local testing), so a remote <img src> would
  // silently fail to render. CID works the same in dev and prod since it carries the image
  // bytes inside the email itself.
  let snapshotAttachment: { filename: string; content: Buffer; cid: string; contentType: string } | null = null;
  if (data.snapshotPath) {
    try {
      const content = await fs.readFile(data.snapshotPath);
      snapshotAttachment = {
        filename: `snapshot-${data.eventId}.jpg`,
        content,
        cid: `snapshot-${data.eventId}@lumicore`,
        contentType: "image/jpeg"
      };
    } catch (err) {
      console.warn(`[notify] failed to read snapshot for embedding (eventId=${data.eventId}):`, err);
    }
  }
  const snapshotImgSrc = snapshotAttachment ? `cid:${snapshotAttachment.cid}` : data.snapshotUrl;

  const snapshotSection = snapshotImgSrc ? `
    <tr><td style="padding:0 0 24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#374151;">Bukti Rekaman (Snapshot)</p>
      <img src="${snapshotImgSrc}" alt="Snapshot kamera ${data.cameraName}"
        style="width:100%;max-width:100%;display:block;border:1px solid #d1d5db;" />
      <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">
        Diambil pada ${formattedDate}, pukul ${formattedTime} WIB &mdash; ${data.cameraName} (${data.cameraCode})
      </p>
    </td></tr>` : "";

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Notifikasi Pelanggaran — Lumicore</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 16px 48px;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#1e293b;padding:20px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <p style="margin:0;font-size:15px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">LUMICORE</p>
              <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;letter-spacing:0.3px;">AI CCTV Monitoring System</p>
            </td>
            <td align="right">
              <span style="display:inline-block;background:#dc2626;color:#ffffff;font-size:11px;font-weight:700;padding:4px 12px;letter-spacing:0.5px;">
                NOTIFIKASI PELANGGARAN
              </span>
            </td>
          </tr>
        </table>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:36px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0">

          <!-- Salutation -->
          <tr><td style="padding-bottom:20px;">
            <p style="margin:0 0 6px;font-size:14px;color:#111827;line-height:1.7;">
              Kepada Yth.<br>
              <strong>${data.picName}</strong>
            </p>
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
              Dengan hormat,
            </p>
          </td></tr>

          <!-- Opening paragraph -->
          <tr><td style="padding-bottom:24px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#374151;line-height:1.7;">
              Sistem pemantauan AI Lumicore telah mendeteksi
              <strong>${data.violations.length} pelanggaran keselamatan</strong> pada
              <strong>${formattedDate}</strong>, pukul <strong>${formattedTime} WIB</strong>.
              Berikut kami sampaikan informasi lengkap mengenai kejadian tersebut.
            </p>
          </td></tr>

          <!-- Camera info -->
          <tr><td style="padding:24px 0 20px;">
            <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.5px;">Informasi Kamera</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;">
              <tr style="background:#f9fafb;">
                <td style="padding:9px 16px;font-size:12px;font-weight:600;color:#6b7280;width:36%;border-bottom:1px solid #e5e7eb;">Nama Kamera</td>
                <td style="padding:9px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${data.cameraName}</td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Kode Kamera</td>
                <td style="padding:9px 16px;font-size:13px;color:#111827;font-family:'Courier New',monospace;border-bottom:1px solid #e5e7eb;">${data.cameraCode}</td>
              </tr>
              <tr style="background:#f9fafb;">
                <td style="padding:9px 16px;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Area</td>
                <td style="padding:9px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${data.areaName}</td>
              </tr>
              <tr>
                <td style="padding:9px 16px;font-size:12px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;">Seksi</td>
                <td style="padding:9px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">${data.sectionName}</td>
              </tr>
              <tr style="background:#f9fafb;">
                <td style="padding:9px 16px;font-size:12px;font-weight:600;color:#6b7280;">Waktu Deteksi</td>
                <td style="padding:9px 16px;font-size:13px;color:#111827;">${formattedDate}, pukul ${formattedTime} WIB</td>
              </tr>
            </table>
          </td></tr>

          <!-- Violations table -->
          <tr><td style="padding-bottom:28px;">
            <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.5px;">Pelanggaran Terdeteksi</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;">
              <tr style="background:#f3f4f6;">
                <th style="padding:9px 16px;font-size:12px;font-weight:600;color:#374151;text-align:left;border-bottom:1px solid #e5e7eb;">Jenis Pelanggaran</th>
                <th style="padding:9px 16px;font-size:12px;font-weight:600;color:#374151;text-align:center;border-bottom:1px solid #e5e7eb;width:120px;">Tingkat Keyakinan AI</th>
              </tr>
              ${violationRows}
            </table>
          </td></tr>

          <!-- Snapshot -->
          ${snapshotSection}

          <!-- Action notice -->
          <tr><td style="padding-bottom:28px;border-top:1px solid #e5e7eb;padding-top:24px;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#111827;">Tindak Lanjut yang Diperlukan</p>
            <p style="margin:0 0 8px;font-size:13px;color:#374151;line-height:1.7;">
              Mohon segera melakukan pengecekan langsung ke lokasi kamera yang bersangkutan dan mengambil
              tindakan yang diperlukan sesuai prosedur keselamatan yang berlaku.
            </p>
            <p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">
              Apabila kejadian ini telah ditangani, harap lakukan konfirmasi melalui dashboard sistem Lumicore
              dengan mengakui (acknowledge) event terkait. Jika deteksi ini tidak valid, tandai sebagai
              <em>False Positive</em> agar sistem dapat ditingkatkan.
            </p>
          </td></tr>

          <!-- Closing -->
          <tr><td style="padding-bottom:8px;">
            <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.7;">
              Demikian notifikasi ini kami sampaikan. Atas perhatian dan kerja sama Anda, kami ucapkan terima kasih.
            </p>
            <p style="margin:16px 0 4px;font-size:14px;color:#374151;">Hormat kami,</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">Lumicore AI CCTV Monitoring System</p>
          </td></tr>

        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 40px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size:11px;color:#9ca3af;line-height:1.6;">
              Email ini dikirim secara otomatis. Mohon tidak membalas email ini.<br>
              Nomor Referensi: <span style="font-family:'Courier New',monospace;">EVT-${data.eventId.slice(-10).toUpperCase()}</span>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  const textLines = data.violations.map(
    (v) => `  - ${toLabel(v.check)} (Keyakinan AI: ${(v.confidence * 100).toFixed(1)}%)`
  ).join("\n");

  const textBody = `LUMICORE — NOTIFIKASI PELANGGARAN
${"=".repeat(50)}

Kepada Yth. ${data.picName},

Dengan hormat,

Sistem pemantauan AI Lumicore telah mendeteksi ${data.violations.length} pelanggaran keselamatan pada ${formattedDate}, pukul ${formattedTime} WIB.

INFORMASI KAMERA
Nama    : ${data.cameraName} (${data.cameraCode})
Area    : ${data.areaName}
Seksi   : ${data.sectionName}
Waktu   : ${formattedDate}, pukul ${formattedTime} WIB

PELANGGARAN TERDETEKSI
${textLines}
${data.snapshotUrl ? `\nBukti Snapshot: ${data.snapshotUrl}` : ""}

Mohon segera melakukan pengecekan ke lokasi dan konfirmasi melalui dashboard Lumicore.

Hormat kami,
Lumicore AI CCTV Monitoring System

${"─".repeat(50)}
Email otomatis. Mohon tidak membalas.
Nomor Referensi: EVT-${data.eventId.slice(-10).toUpperCase()}`;

  await t.tx.sendMail({
    from: t.from,
    to,
    subject: `Notifikasi Pelanggaran: ${subjectLabel} — ${data.cameraName}`,
    text: textBody,
    html,
    attachments: snapshotAttachment ? [snapshotAttachment] : undefined
  });
}
