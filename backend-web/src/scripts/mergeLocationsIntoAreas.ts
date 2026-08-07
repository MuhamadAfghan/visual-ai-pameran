/**
 * mergeLocationsIntoAreas.ts
 *
 * Usage:
 *   npx tsx src/scripts/mergeLocationsIntoAreas.ts
 *   npm run migrate:drop-locations
 *
 * One-off, idempotent migration that retires the standalone "Location" entity.
 * Area is now the single source of master coordinates; cameras derive their
 * coordinate from their Area (default-filled in the form) or a manual override.
 *
 * Steps:
 *   1. Unset `locationRefId` on every camera. The `location` snapshot already
 *      stored on each camera is kept — referenced cameras keep their coordinate
 *      as a manual value, so no coordinate is lost.
 *   2. Drop the `locations` collection.
 *   3. Pull the now-defunct `locations` module from every Role's permissions.
 *
 * Safe to run multiple times. After running, re-run `npm run seed:roles` to
 * refresh the system-role definitions.
 */

import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";

function log(msg: string) {
  console.log(`[mergeLocationsIntoAreas] ${msg}`);
}

function ok(msg: string) {
  console.log(`  ✓ ${msg}`);
}

async function run() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("DB connection not ready");

  // ── 1. Unset locationRefId on all cameras (coordinate snapshot stays) ──────
  const cameras = db.collection("cameras");
  const refResult = await cameras.updateMany(
    { locationRefId: { $exists: true } },
    { $unset: { locationRefId: "" } }
  );
  ok(`Unset locationRefId on ${refResult.modifiedCount} camera(s)`);

  // ── 2. Drop the locations collection ───────────────────────────────────────
  const collections = await db.listCollections({ name: "locations" }).toArray();
  if (collections.length > 0) {
    const count = await db.collection("locations").countDocuments();
    await db.collection("locations").drop();
    ok(`Dropped 'locations' collection (${count} document(s))`);
  } else {
    ok("No 'locations' collection found — already removed");
  }

  // ── 3. Remove the 'locations' permission module from all roles ─────────────
  const roles = db.collection("roles");
  const permResult = await roles.updateMany(
    { "permissions.module": "locations" },
    // Raw collection: cast the $pull operator (bson's PullOperator typing is too
    // strict for an untyped collection).
    { $pull: { permissions: { module: "locations" } } } as Record<string, unknown>
  );
  ok(`Removed 'locations' permission from ${permResult.modifiedCount} role(s)`);

  log("Done. Run `npm run seed:roles` to refresh system-role definitions.");
}

async function main() {
  log("Connecting to MongoDB...");
  await connectMongo();
  log("Connected.");

  try {
    await run();
  } finally {
    await mongoose.disconnect();
    log("Disconnected.");
  }
}

main().catch((err) => {
  console.error("[mergeLocationsIntoAreas] Fatal error:", err);
  process.exit(1);
});
