import { env } from "../config/env";
import { SystemSettingsModel } from "../models/systemSettings.model";
import { decrypt, encrypt, isEncrypted } from "../utils/crypto";

const PASS_MASK = "••••••••";

export type SettingsInput = {
  smtp?: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    from?: string;
    tls?: boolean;
  };
  retention?: {
    dataDays?: number;
    snapshotDays?: number;
  };
  capture?: {
    defaultMinGapSeconds?: number;
    defaultCooldown?: number;
  };
  notification?: {
    maxEmailsPerHour?: number;
    cooldownMinutes?: number;
  };
  timezone?: string;
  violationAlert?: {
    audioStyle?: "beep" | "beep_speech";
    repeatMode?: "cooldown" | "continuous";
    repeatIntervalSeconds?: number;
  };
};

export async function getSettings() {
  let doc = await SystemSettingsModel.findOne();
  if (!doc) {
    doc = await SystemSettingsModel.create({});
  }
  return doc;
}

export async function updateSettings(input: SettingsInput) {
  const doc = await getSettings();

  if (input.smtp) {
    const { pass, ...rest } = input.smtp;
    // Non-null assertion safe — schema has defaults for all nested fields
    Object.assign(doc.smtp!, rest);
    if (pass !== undefined && pass !== PASS_MASK && pass !== "") {
      doc.smtp!.pass = env.SETTINGS_ENCRYPTION_KEY
        ? encrypt(pass, env.SETTINGS_ENCRYPTION_KEY)
        : pass;
    }
    doc.markModified("smtp");
  }
  if (input.retention) {
    Object.assign(doc.retention!, input.retention);
    doc.markModified("retention");
  }
  if (input.capture) {
    Object.assign(doc.capture!, input.capture);
    doc.markModified("capture");
  }
  if (input.notification) {
    Object.assign(doc.notification!, input.notification);
    doc.markModified("notification");
  }
  if (input.timezone !== undefined) {
    doc.set("timezone", input.timezone);
  }
  if (input.violationAlert) {
    Object.assign(doc.violationAlert!, input.violationAlert);
    doc.markModified("violationAlert");
  }

  return doc.save();
}

/**
 * Returns the SMTP password in plaintext for use in nodemailer.
 * Decrypts automatically if SETTINGS_ENCRYPTION_KEY is set and the value is encrypted.
 */
export function getDecryptedSmtpPass(doc: Awaited<ReturnType<typeof getSettings>>): string {
  const pass = doc.smtp?.pass ?? "";
  if (!pass || !env.SETTINGS_ENCRYPTION_KEY) return pass;
  try {
    return isEncrypted(pass) ? decrypt(pass, env.SETTINGS_ENCRYPTION_KEY) : pass;
  } catch {
    return pass;
  }
}

export function maskSettings(doc: Awaited<ReturnType<typeof getSettings>>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = doc.toObject() as any;
  if (obj.smtp?.pass) {
    obj.smtp.pass = PASS_MASK;
  } else if (obj.smtp) {
    obj.smtp.pass = "";
  }
  return obj;
}
