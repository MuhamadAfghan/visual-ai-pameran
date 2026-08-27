import type { NextFunction, Request, Response } from "express";
import nodemailer from "nodemailer";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { runCleanup } from "../services/cleanup.service";
import { getDecryptedSmtpPass, getSettings, maskSettings, updateSettings } from "../services/systemSettings.service";
import { calcStorageBytes } from "../plugins/storage";
import { env } from "../config/env";
import { sendSuccess } from "../utils/apiResponse";

const settingsUpdateSchema = z.object({
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.number().int().positive().optional(),
      user: z.string().optional(),
      pass: z.string().optional(),
      from: z.string().optional(),
      tls: z.boolean().optional()
    })
    .optional(),
  retention: z
    .object({
      dataDays: z.number().int().min(1).optional(),
      snapshotDays: z.number().int().min(1).optional()
    })
    .optional(),
  capture: z
    .object({
      defaultMinGapSeconds: z.number().int().min(0).optional(),
      defaultCooldown: z.number().int().min(0).optional()
    })
    .optional(),
  notification: z
    .object({
      maxEmailsPerHour: z.number().int().min(1).optional(),
      cooldownMinutes: z.number().int().min(0).optional()
    })
    .optional(),
  storage: z
    .object({
      maxSizeGB: z.number().min(0.1).optional()
    })
    .optional(),
  violationAlert: z
    .object({
      audioStyle: z.enum(["beep", "beep_speech"]).optional(),
      repeatMode: z.enum(["cooldown", "continuous"]).optional(),
      repeatIntervalSeconds: z.number().int().min(5).max(300).optional()
    })
    .optional()
});

const smtpTestSchema = z.object({
  to: z.string().email()
});

export async function getSettingsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await getSettings();
    sendSuccess(res, maskSettings(doc));
  } catch (error) {
    next(error);
  }
}

export async function getViolationAlertConfigController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await getSettings();
    sendSuccess(res, {
      audioStyle: doc.violationAlert?.audioStyle ?? "beep_speech",
      repeatMode: doc.violationAlert?.repeatMode ?? "cooldown",
      repeatIntervalSeconds: doc.violationAlert?.repeatIntervalSeconds ?? 15
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSettingsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const payload = settingsUpdateSchema.parse(req.body);
    const doc = await updateSettings(payload);
    sendSuccess(res, maskSettings(doc));
  } catch (error) {
    next(error);
  }
}

export async function testSmtpController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { to } = smtpTestSchema.parse(req.body);
    const doc = await getSettings();
    const { host, port, user, from, tls } = doc.smtp!;
    const pass = getDecryptedSmtpPass(doc);

    if (!host || !user || !pass || !from) {
      throw new HttpError(400, "SMTP configuration is incomplete — fill host, user, pass, from first");
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: tls || port === 465,
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to,
      subject: "CCTV AI Detector — SMTP Test",
      text: "This is a test email from CCTV AI Detector. If you received this, SMTP is configured correctly.",
      html: "<p>This is a test email from <strong>CCTV AI Detector</strong>.</p><p>If you received this, your SMTP configuration is working correctly.</p>"
    });

    sendSuccess(res, { message: `Test email sent to ${to}` });
  } catch (error) {
    next(error);
  }
}

export async function runCleanupNowController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await runCleanup();
    sendSuccess(res, {
      message: "Cleanup completed",
      ...result
    });
  } catch (error) {
    next(error);
  }
}

export async function getStorageStatsController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const settings = await getSettings();
    const maxSizeGB = settings.storage?.maxSizeGB ?? 10;
    const usedBytes = await calcStorageBytes(env.STORAGE_BASE_PATH);
    const usedGB = usedBytes / (1024 ** 3);
    const percentUsed = maxSizeGB > 0 ? Math.min(100, (usedGB / maxSizeGB) * 100) : 0;
    sendSuccess(res, { usedBytes, usedGB: parseFloat(usedGB.toFixed(3)), maxSizeGB, percentUsed: parseFloat(percentUsed.toFixed(1)) });
  } catch (error) {
    next(error);
  }
}
