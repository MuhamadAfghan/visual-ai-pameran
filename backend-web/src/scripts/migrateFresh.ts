/**
 * migrateFresh.ts
 *
 * Usage:
 *   npx tsx src/scripts/migrateFresh.ts --fresh    # full wipe: MongoDB + Redis + storage (default)
 *   npx tsx src/scripts/migrateFresh.ts --migrate  # transform old schema → new schema
 *
 * --fresh   : Drops every MongoDB collection, obliterates all BullMQ queues,
 *             flushes app-level Redis keys, and wipes the local storage folder.
 *             Clean slate for dev/staging.
 * --migrate : Splits legacy areas (parentArea != null) into the new sections collection,
 *             strips parentArea from top-level areas, renames camera.areaId → sectionId.
 */

import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { connectMongo } from "../config/mongo";
import { env } from "../config/env";
import { AreaModel } from "../models/area.model";
import { SectionModel } from "../models/section.model";
import { CameraModel } from "../models/camera.model";
import { CameraMappingModel } from "../models/cameraMapping.model";
import { DetectionEventModel } from "../models/detectionEvent.model";
import { DetectionJobModel } from "../models/job.model";
import { PicModel } from "../models/pic.model";
import { UserModel } from "../models/user.model";
import { AuditLogModel } from "../models/auditLog.model";
import { NotificationLogModel } from "../models/notificationLog.model";
import { SystemSettingsModel } from "../models/systemSettings.model";
import { AiModelModel } from "../models/aiModel.model";
import { RoleModel } from "../models/role.model";

const ALL_MODELS = [
  AreaModel,
  SectionModel,
  CameraModel,
  CameraMappingModel,
  DetectionEventModel,
  DetectionJobModel,
  PicModel,
  UserModel,
  AuditLogModel,
  NotificationLogModel,
  SystemSettingsModel,
  AiModelModel,
  RoleModel,
];

// Queue names must match what the app uses — hardcoded names + env-driven names.
// "snapshot-jobs" is hardcoded (not env-driven) because the scheduler/snapshot
// worker that used to own SNAPSHOT_QUEUE_NAME has been retired in favor of the
// always-on monitoring hub — this only cleans up any orphaned queue left over
// from before that change on an existing deployment.
const QUEUE_NAMES = [
  "snapshot-jobs",
  env.INFER_QUEUE_NAME,
  "notification-jobs",
  "cleanup-jobs"
];

// ─── helpers ────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[migrateFresh] ${msg}`);
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg: string) {
  console.warn(`  ⚠ ${msg}`);
}

// ─── fresh: MongoDB ──────────────────────────────────────────────────────────

async function dropCollections(): Promise<void> {
  log("Step 1/3 — Dropping MongoDB collections");

  const db = mongoose.connection.db;
  if (!db) throw new Error("DB connection not ready");

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  let dropped = 0;
  for (const m of ALL_MODELS) {
    const name = m.collection.name;
    if (existing.has(name)) {
      await m.collection.drop();
      ok(`Dropped: ${name}`);
      dropped++;
    } else {
      warn(`Skip (not found): ${name}`);
    }
  }

  log(`MongoDB done — dropped ${dropped} collection(s).`);
}

// ─── fresh: Redis / BullMQ ───────────────────────────────────────────────────

async function clearRedis(): Promise<void> {
  log("Step 2/3 — Clearing Redis (BullMQ queues + app keys)");

  // Use a dedicated connection for this script so we don't share state
  const redisClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

  try {
    // Obliterate each BullMQ queue (removes all jobs + repeatable schedules)
    for (const name of QUEUE_NAMES) {
      const queue = new Queue(name, { connection: redisClient });
      try {
        await queue.obliterate({ force: true });
        ok(`Obliterated queue: ${name}`);
      } catch {
        // Queue may not exist yet — not an error
        warn(`Queue not found (skip): ${name}`);
      } finally {
        await queue.close();
      }
    }

    // Flush any remaining app-level keys (notification cooldowns, event-bus, etc.)
    // Uses SCAN to avoid blocking Redis with a full FLUSHDB
    let cursor = "0";
    let appKeysDeleted = 0;
    const APP_KEY_PATTERNS = ["notif:cooldown:*", "lumicore:*", "bull:*"];

    for (const pattern of APP_KEY_PATTERNS) {
      do {
        const [nextCursor, keys] = await redisClient.scan(cursor, "MATCH", pattern, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redisClient.del(...keys);
          appKeysDeleted += keys.length;
        }
      } while (cursor !== "0");
      cursor = "0";
    }

    if (appKeysDeleted > 0) {
      ok(`Deleted ${appKeysDeleted} residual Redis key(s)`);
    }

    log("Redis done.");
  } finally {
    redisClient.disconnect();
  }
}

// ─── fresh: local storage ────────────────────────────────────────────────────

async function clearStorage(): Promise<void> {
  log("Step 3/3 — Clearing local storage");

  const storageBase = path.resolve(env.STORAGE_BASE_PATH);

  // Only wipe the sub-directories we own; leave the root folder itself intact
  const WIPE_DIRS = ["latest", "evidence"];
  let wiped = 0;

  for (const dir of WIPE_DIRS) {
    const target = path.join(storageBase, dir);
    try {
      await fs.rm(target, { recursive: true, force: true });
      await fs.mkdir(target, { recursive: true }); // recreate empty
      ok(`Cleared: ${target}`);
      wiped++;
    } catch {
      warn(`Could not clear storage dir: ${target}`);
    }
  }

  log(`Storage done — cleared ${wiped} director(ies).`);
}

// ─── fresh: orchestrator ────────────────────────────────────────────────────

async function runFresh(): Promise<void> {
  log("Mode: FRESH — full wipe (MongoDB + Redis + storage)");
  log("─".repeat(55));

  await dropCollections();
  log("");
  await clearRedis();
  log("");
  await clearStorage();

  log("─".repeat(55));
  log("Done. Everything is clean. Restart all services.");
}

// ─── migrate mode ────────────────────────────────────────────────────────────

async function runMigrate() {
  log("Mode: MIGRATE — transforming legacy schema to new Area/Section layout");

  const db = mongoose.connection.db;
  if (!db) throw new Error("DB connection not ready");

  // Raw access to the areas collection so we can read `parentArea` which is
  // no longer in the Mongoose schema.
  const rawAreas = db.collection("areas");
  const rawCameras = db.collection("cameras");

  // ── 1. Count legacy areas ──────────────────────────────────────────────
  const totalAreas = await rawAreas.countDocuments();
  const legacySections = await rawAreas.countDocuments({ parentArea: { $ne: null } });
  const topLevelAreas = await rawAreas.countDocuments({
    $or: [{ parentArea: null }, { parentArea: { $exists: false } }]
  });
  log(`Found ${totalAreas} area document(s): ${topLevelAreas} top-level, ${legacySections} legacy section(s)`);

  if (legacySections === 0 && topLevelAreas === totalAreas) {
    log("No legacy sections found — schema may already be migrated. Checking cameras...");
  }

  // ── 2. Move legacy sections (parentArea != null) → sections collection ──
  const legacyAreaDocs = await rawAreas.find({ parentArea: { $ne: null, $exists: true } }).toArray();
  let sectionsMoved = 0;

  for (const doc of legacyAreaDocs) {
    const exists = await SectionModel.exists({ _id: doc._id });
    if (exists) {
      warn(`Section ${doc._id} (${doc.code}) already exists — skipping`);
      continue;
    }

    await SectionModel.collection.insertOne({
      _id: doc._id,
      areaId: doc.parentArea,
      code: doc.code,
      name: doc.name,
      description: doc.description ?? "",
      isActive: doc.isActive ?? true,
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date()
    });

    await rawAreas.deleteOne({ _id: doc._id });
    ok(`Moved legacy section: ${doc.code} (areaId → ${doc.parentArea})`);
    sectionsMoved++;
  }

  // ── 3. Strip parentArea from remaining top-level areas ──────────────────
  const stripResult = await rawAreas.updateMany(
    { parentArea: { $exists: true } },
    { $unset: { parentArea: "" } }
  );
  ok(`Stripped parentArea from ${stripResult.modifiedCount} top-level area(s)`);

  // ── 4. Rename camera.areaId → camera.sectionId ──────────────────────────
  const camerasBefore = await rawCameras.countDocuments({ areaId: { $exists: true } });
  if (camerasBefore > 0) {
    const renameResult = await rawCameras.updateMany(
      { areaId: { $exists: true } },
      { $rename: { areaId: "sectionId" } }
    );
    ok(`Renamed areaId → sectionId on ${renameResult.modifiedCount} camera(s)`);
  } else {
    warn("No cameras with legacy areaId found — already migrated or no cameras exist");
  }

  // ── 5. Summary ───────────────────────────────────────────────────────────
  const finalAreas = await AreaModel.countDocuments();
  const finalSections = await SectionModel.countDocuments();
  const finalCameras = await CameraModel.countDocuments();

  log("Migration complete:");
  log(`  Areas    : ${finalAreas}`);
  log(`  Sections : ${finalSections}  (${sectionsMoved} moved from legacy areas)`);
  log(`  Cameras  : ${finalCameras}`);
}

// ─── entry point ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--migrate") ? "migrate" : "fresh";

  log(`Connecting to MongoDB...`);
  await connectMongo();
  log("Connected.");

  try {
    if (mode === "migrate") {
      await runMigrate();
    } else {
      await runFresh();
    }
  } finally {
    await mongoose.disconnect();
    log("Disconnected.");
  }
}

main().catch((err) => {
  console.error("[migrateFresh] Fatal error:", err);
  process.exit(1);
});
