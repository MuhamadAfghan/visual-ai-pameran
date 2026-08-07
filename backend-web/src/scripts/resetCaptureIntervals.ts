/**
 * resetCaptureIntervals.ts
 *
 * One-time migration for the move to always-on realtime capture. Resets the
 * renamed `captureInterval` → `minCaptureGapSeconds` field to 0 (no
 * artificial floor) for every camera — RTSP (monitoring hub) and
 * device-sourced (browser push loop) alike — plus the create-form default in
 * SystemSettings. Both source types now share the same semantics: 0 = push/
 * capture as fast as the source and AI service allow, no fixed interval.
 *
 * Usage: npx tsx src/scripts/resetCaptureIntervals.ts
 */

import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { CameraModel } from "../models/camera.model";
import { SystemSettingsModel } from "../models/systemSettings.model";

function log(msg: string) {
  console.log(`[resetCaptureIntervals] ${msg}`);
}

async function main(): Promise<void> {
  await connectMongo();
  log("Connected.");

  try {
    // The Mongoose schema no longer declares `captureInterval`, so `$rename`
    // followed by a `$set` to 0 both migrates old documents that still carry
    // the legacy field name/value AND normalizes documents already written
    // under the new name — a raw collection update reaches fields the current
    // schema doesn't know about, which `CameraModel.updateMany` would not.
    const renameResult = await CameraModel.collection.updateMany(
      { captureInterval: { $exists: true } },
      { $rename: { captureInterval: "minCaptureGapSeconds" } }
    );
    log(`Renamed captureInterval → minCaptureGapSeconds on ${renameResult.modifiedCount} camera(s)`);

    const resetResult = await CameraModel.collection.updateMany(
      {},
      { $set: { minCaptureGapSeconds: 0 } }
    );
    log(`Reset minCaptureGapSeconds to 0 on ${resetResult.modifiedCount} camera(s)`);

    const settingsRenameResult = await SystemSettingsModel.collection.updateMany(
      { "capture.defaultInterval": { $exists: true } },
      { $rename: { "capture.defaultInterval": "capture.defaultMinGapSeconds" } }
    );
    log(`Renamed capture.defaultInterval → capture.defaultMinGapSeconds on ${settingsRenameResult.modifiedCount} settings doc(s)`);

    const settingsResetResult = await SystemSettingsModel.collection.updateMany(
      {},
      { $set: { "capture.defaultMinGapSeconds": 0 } }
    );
    log(`Reset capture.defaultMinGapSeconds to 0 on ${settingsResetResult.modifiedCount} settings doc(s)`);

    log("Done.");
  } finally {
    await mongoose.disconnect();
    log("Disconnected.");
  }
}

main().catch((err) => {
  console.error("[resetCaptureIntervals] Fatal error:", err);
  process.exit(1);
});
