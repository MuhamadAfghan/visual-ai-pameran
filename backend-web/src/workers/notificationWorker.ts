import { Worker } from "bullmq";
import pino from "pino";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { DetectionEventModel } from "../models/detectionEvent.model";
import { CameraModel } from "../models/camera.model";
import { CameraMappingModel } from "../models/cameraMapping.model";
import { PicModel } from "../models/pic.model";
import { NotificationLogModel } from "../models/notificationLog.model";
import "../models/section.model";
import "../models/area.model";
import { sendViolationEmail } from "../plugins/mail";
import type { NotificationJobPayload } from "../queues/notification.queue";
import { publishLog } from "../plugins/logStream";

const logger = pino({ name: "notification-worker" });

// In-memory cooldown: key -> expiry epoch ms. Workers run in-process (single
// process), so a Map is sufficient — was a Redis SET with EX previously.
// Scoped per camera+PIC (one consolidated email per inference run, not per check).
const cooldowns = new Map<string, number>();
const cooldownKey = (cameraId: string, picId: string) => `${cameraId}:${picId}`;

const gc = setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of cooldowns) {
    if (exp <= now) cooldowns.delete(k);
  }
}, 60_000);
gc.unref();

async function processNotification(payload: NotificationJobPayload): Promise<void> {
  const { eventId, cameraId } = payload;

  const event = await DetectionEventModel.findById(eventId);
  if (!event) {
    logger.warn({ eventId }, "DetectionEvent not found — skipping");
    publishLog({ level: "warn", source: "system", msg: `Notification skipped — event not found eventId=${eventId}` });
    return;
  }

  // Skip events that were already resolved before the worker ran
  if (event.status === "false_positive") {
    logger.info({ eventId }, "Event marked as false positive — skipping notification");
    publishLog({ level: "info", source: "system", msg: `Notification skipped — false positive eventId=${eventId}` });
    return;
  }

  // Collect violated checks from this event
  const violatedChecks = event.checkResults
    .filter((cr) => cr.isViolation)
    .map((cr) => ({ check: cr.check, confidence: cr.confidence }));

  if (violatedChecks.length === 0) {
    logger.info({ eventId }, "No violations in event — skipping");
    return;
  }

  // Load camera with section→area populated
  const camera = await CameraModel.findById(cameraId).populate<{
    sectionId: { name: string; areaId: { name: string } | null } | null;
  }>({
    path: "sectionId",
    select: "name areaId",
    populate: { path: "areaId", select: "name" }
  });
  if (!camera) {
    logger.warn({ cameraId }, "Camera not found — skipping");
    publishLog({ level: "warn", source: "system", msg: `Notification skipped — camera not found cameraId=${cameraId}` });
    return;
  }

  // Collect PIC IDs: mapping picIds + camera defaultPicIds
  const mapping = await CameraMappingModel.findById(event.mappingId);
  const mappingPicIds = mapping?.picIds?.map((id) => id.toString()) ?? [];
  const defaultPicIds = camera.defaultPicIds?.map((id) => id.toString()) ?? [];

  const uniquePicIds = [...new Set([...mappingPicIds, ...defaultPicIds])];
  if (uniquePicIds.length === 0) {
    logger.info({ cameraId }, "No PICs configured — skipping notification");
    publishLog({
      level: "warn", source: "system",
      msg: `Notification skipped — no PICs configured for camera "${camera.name}"`,
      meta: { cameraId }
    });
    return;
  }

  // Load active PICs
  const pics = await PicModel.find({ _id: { $in: uniquePicIds }, isActive: true });
  if (pics.length === 0) {
    logger.info({ cameraId }, "No active PICs found — skipping notification");
    publishLog({
      level: "warn", source: "system",
      msg: `Notification skipped — no active PICs for camera "${camera.name}"`,
      meta: { cameraId }
    });
    return;
  }

  const section = camera.sectionId as { name: string; areaId: { name: string } | null } | null;
  const areaName = section?.areaId?.name ?? "Unknown Area";
  const sectionName = section?.name ?? "Unknown Section";
  const now = new Date();
  const nowMs = now.getTime();
  const checksLabel = violatedChecks.map((v) => v.check).join(", ");

  let anySucceeded = false;
  let anyFailed = false;

  // Send one consolidated email per PIC, filtered by subscribedChecks
  for (const pic of pics) {
    const picId = pic._id.toString();

    // Determine which violations this PIC cares about:
    // empty subscribedChecks = receives all; non-empty = only listed checks
    const subscribedChecks = (pic.subscribedChecks as string[] | undefined) ?? [];
    const relevantViolations = subscribedChecks.length === 0
      ? violatedChecks
      : violatedChecks.filter((v) => subscribedChecks.includes(v.check));

    if (relevantViolations.length === 0) {
      logger.info({ picId, email: pic.email }, "No relevant violations for PIC — skipping");
      continue;
    }

    // Per-PIC cooldown (scoped to camera, not per-check — email is already consolidated)
    const key = cooldownKey(cameraId, picId);
    const expiresAt = cooldowns.get(key);
    if (expiresAt && expiresAt > nowMs) {
      const ttl = Math.ceil((expiresAt - nowMs) / 1000);
      logger.info({ picId, email: pic.email, cameraId, ttl }, "Cooldown active — throttled");
      publishLog({
        level: "info", source: "system",
        msg: `Email throttled → ${pic.email} (cooldown ${ttl}s remaining)`,
        meta: { cameraId, picId, email: pic.email, cooldownTtl: ttl }
      });
      await NotificationLogModel.create({
        eventId,
        picId,
        email: pic.email,
        status: "throttled",
        attemptCount: 1,
        lastAttemptAt: now
      });
      continue;
    }

    publishLog({
      level: "info", source: "system",
      msg: `Sending email → ${pic.email} [${checksLabel}] "${camera.name}" ${sectionName}`,
      meta: { cameraId, picId, email: pic.email, checks: checksLabel }
    });

    try {
      await sendViolationEmail(pic.email, {
        picName: pic.name,
        cameraName: camera.name,
        cameraCode: camera.code,
        areaName,
        sectionName,
        violations: relevantViolations,
        detectedAt: event.detectedAt,
        snapshotUrl: event.snapshotUrl ?? null,
        eventId
      });

      cooldowns.set(key, nowMs + env.NOTIFICATION_COOLDOWN_SECONDS * 1000);

      await NotificationLogModel.create({
        eventId,
        picId,
        email: pic.email,
        status: "sent",
        attemptCount: 1,
        lastAttemptAt: now
      });

      anySucceeded = true;
      logger.info(
        { picId, email: pic.email, cameraId, violations: relevantViolations.map((v) => v.check) },
        "Violation email sent"
      );
      publishLog({
        level: "info", source: "system",
        msg: `✉ Email sent → ${pic.email} [${checksLabel}]`,
        meta: { cameraId, picId, email: pic.email, checks: checksLabel, camera: camera.name }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ picId, email: pic.email, err: msg }, "Failed to send violation email");
      anyFailed = true;

      await NotificationLogModel.create({
        eventId,
        picId,
        email: pic.email,
        status: "failed",
        attemptCount: 1,
        lastAttemptAt: now,
        error: msg
      });
      publishLog({
        level: "error", source: "system",
        msg: `✉ Email failed → ${pic.email} — ${msg}`,
        meta: { cameraId, picId, email: pic.email, reason: msg }
      });
    }
  }

  // Update DetectionEvent notification status
  let notificationStatus: "sent" | "failed" | "throttled" = "throttled";
  if (anyFailed && !anySucceeded) notificationStatus = "failed";
  else if (anySucceeded) notificationStatus = "sent";

  await DetectionEventModel.findByIdAndUpdate(eventId, {
    notificationSentAt: now,
    notificationStatus
  });

  if (anyFailed && !anySucceeded) {
    throw new Error("All notification emails failed — triggering retry");
  }
}

export function registerNotificationWorker(): Worker<NotificationJobPayload> {
  const worker = new Worker<NotificationJobPayload>(
    "notification-jobs",
    async (job) => {
      await processNotification(job.data);
    },
    { connection: redis, concurrency: 10 }
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "Notification job failed");
  });

  worker.on("error", (err) => {
    logger.error({ err: err.message }, "Worker error");
  });

  logger.info("Notification worker registered");
  return worker;
}
