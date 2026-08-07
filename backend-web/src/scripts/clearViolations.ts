/**
 * clearViolations.ts
 *
 * Hapus SEMUA detection event (log violation) dari MongoDB beserta
 * file snapshot bukti di disk. Data lain (kamera, user, mapping, dll) TIDAK disentuh.
 *
 * Usage:
 *   npx tsx src/scripts/clearViolations.ts            # hapus semua detection event
 *   npx tsx src/scripts/clearViolations.ts --violations-only   # hanya yang isViolation:true
 *   npx tsx src/scripts/clearViolations.ts --keep-snapshots    # jangan hapus file snapshot
 */

import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { env } from "../config/env";
import { DetectionEventModel } from "../models/detectionEvent.model";

function log(msg: string) {
  console.log(`[clearViolations] ${msg}`);
}

async function clearEvidenceFolder(): Promise<void> {
  const storageBase = path.resolve(env.STORAGE_BASE_PATH);
  const target = path.join(storageBase, "evidence");
  try {
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true }); // recreate empty
    log(`  ✓ Cleared snapshot folder: ${target}`);
  } catch {
    log(`  ⚠ Could not clear: ${target}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const violationsOnly = args.includes("--violations-only");
  const keepSnapshots = args.includes("--keep-snapshots");

  const filter = violationsOnly ? { isViolation: true } : {};

  log("Connecting to MongoDB...");
  await connectMongo();
  log("Connected.");

  try {
    const count = await DetectionEventModel.countDocuments(filter);
    log(`Found ${count} detection event(s) to delete${violationsOnly ? " (isViolation only)" : ""}.`);

    const result = await DetectionEventModel.deleteMany(filter);
    log(`  ✓ Deleted ${result.deletedCount} document(s) from MongoDB.`);

    // Hapus file snapshot hanya kalau kita menghapus SEMUA event
    // (kalau --violations-only, file non-violation masih dipakai event lain)
    if (!keepSnapshots && !violationsOnly) {
      await clearEvidenceFolder();
    } else if (!keepSnapshots && violationsOnly) {
      log("  ⚠ Snapshot files dibiarkan (mode --violations-only). Hapus manual bila perlu.");
    }

    log("Done.");
  } finally {
    await mongoose.disconnect();
    log("Disconnected.");
  }
}

main().catch((err) => {
  console.error("[clearViolations] Fatal error:", err);
  process.exit(1);
});
