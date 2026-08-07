/**
 * Test 3 — integration test: MongoDB + gRPC + persistence.
 *
 * Bypass snapshotWorker (yang masih butuh BullMQ + Redis — belum di-install),
 * tapi tetap exercise alur asli yang penting: gRPC call ke AI dengan rules,
 * match violation pakai VIOLATION_TO_CHECK, persist DetectionEvent ke MongoDB
 * dengan isViolation flag yang benar.
 *
 * Prasyarat:
 *   1. MongoDB hidup di MONGODB_URI (lihat .env)
 *   2. AI gRPC server hidup di AI_GRPC_TARGET
 *   3. Example image ada di ../ai/contracts/
 *
 * Run:
 *   npx ts-node src/scripts/smokeIntegrationViolation.ts [--crowd-threshold N]
 *
 * Script ini self-cleanup: data test (camera, mapping, model, section, events)
 * di-delete sebelum exit, jadi aman dijalankan berulang.
 */

import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { CameraModel } from "../models/camera.model";
import { CameraMappingModel } from "../models/cameraMapping.model";
import { AiModelModel } from "../models/aiModel.model";
import { SectionModel } from "../models/section.model";
import { AreaModel } from "../models/area.model";
import { PicModel } from "../models/pic.model";
import { DetectionEventModel } from "../models/detectionEvent.model";
import {
  inferViaGrpc,
  checkForViolation,
  type InferRequest,
  type CameraRules,
} from "../plugins/aiGrpcClient";

const TEST_TAG = "smoke-integration";

function parseArgs(): { crowdThreshold: number } {
  const argv = process.argv.slice(2);
  let crowdThreshold = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--crowd-threshold") crowdThreshold = parseInt(argv[++i], 10);
  }
  return { crowdThreshold };
}

async function setupTestData() {
  // Suffix unik supaya re-run script tidak collide dengan data lama.
  const suffix = Date.now();
  // Hierarchy: Area → Section → Camera. PIC required by camera schema.
  const area = await AreaModel.create({ code: `${TEST_TAG}-area-${suffix}`, name: "Smoke Area" });
  const section = await SectionModel.create({
    code: `${TEST_TAG}-section-${suffix}`,
    name: "Smoke Section",
    areaId: area._id,
  });
  const pic = await PicModel.create({
    name: "Smoke PIC",
    email: `${TEST_TAG}-${suffix}@example.test`,
  });
  const camera = await CameraModel.create({
    code: `${TEST_TAG}-cam-${suffix}`,
    name: "Smoke Camera",
    rtspUrl: "rtsp://dummy/not-used",
    sectionId: section._id,
    crowdThreshold: 1,
    defaultPicIds: [pic._id],
  });
  const aiModel = await AiModelModel.create({
    code: `${TEST_TAG}-model-${suffix}`,
    name: "Smoke People Counting",
    defaultChecks: ["person_count"],
    version: "test",
  });
  const mapping = await CameraMappingModel.create({
    cameraId: camera._id,
    modelId: aiModel._id,
    selectedChecks: ["person_count"],
    confidenceThreshold: 0.25,
  });

  return { area, section, pic, camera, aiModel, mapping };
}

async function cleanup(ids: Awaited<ReturnType<typeof setupTestData>>) {
  await Promise.all([
    DetectionEventModel.deleteMany({ cameraId: ids.camera._id }),
    CameraMappingModel.deleteOne({ _id: ids.mapping._id }),
    CameraModel.deleteOne({ _id: ids.camera._id }),
    AiModelModel.deleteOne({ _id: ids.aiModel._id }),
    SectionModel.deleteOne({ _id: ids.section._id }),
    AreaModel.deleteOne({ _id: ids.area._id }),
    PicModel.deleteOne({ _id: ids.pic._id }),
  ]);
}

async function main(): Promise<void> {
  const { crowdThreshold } = parseArgs();
  const imagePath = path.resolve(__dirname, "../../../ai/contracts/example-1.jpg");
  if (!fs.existsSync(imagePath)) {
    console.error(`[error] image not found: ${imagePath}`);
    process.exit(1);
  }

  console.log("→ connecting to MongoDB...");
  await connectMongo();
  console.log(`  ✓ connected: ${mongoose.connection.name}\n`);

  const ids = await setupTestData();
  // Override crowdThreshold from arg
  await CameraModel.findByIdAndUpdate(ids.camera._id, { crowdThreshold });
  console.log("→ seeded test data:");
  console.log(`  camera   : ${ids.camera._id} (crowdThreshold=${crowdThreshold})`);
  console.log(`  mapping  : ${ids.mapping._id} (selectedChecks=person_count)`);
  console.log(`  aiModel  : ${ids.aiModel._id}\n`);

  try {
    // ── Mimic snapshotWorker behavior ────────────────────────────────────────
    const camera = await CameraModel.findById(ids.camera._id);
    const mapping = await CameraMappingModel.findById(ids.mapping._id);
    if (!camera || !mapping) throw new Error("test fixtures missing");

    const imageBase64 = fs.readFileSync(imagePath).toString("base64");
    const rules: CameraRules | undefined =
      camera.crowdThreshold != null ? { crowd_threshold: camera.crowdThreshold } : undefined;

    const req: InferRequest = {
      camera_id: camera._id.toString(),
      frame_id: `smoke-${Date.now()}`,
      timestamp_utc: new Date().toISOString(),
      image_base64: imageBase64,
      selected_checks: mapping.selectedChecks as string[],
      thresholds: { conf: mapping.confidenceThreshold ?? 0.25, iou: 0.45 },
      rules,
    };

    console.log("→ Infer() via gRPC...");
    const resp = await inferViaGrpc(req);
    console.log(`  latency_ms : ${resp.latency_ms}`);
    console.log(`  detections : ${resp.detections.length}`);
    console.log(`  violations : ${resp.violations.length}\n`);

    // Persist events (same logic as snapshotWorker)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const checkResults = resp.check_results.map((cr) => {
      const matched = resp.violations.find((v) => checkForViolation(v.type) === cr.check);
      return {
        check: cr.check,
        value: cr.value ?? 0,
        confidence: cr.confidence,
        isViolation: matched !== undefined,
        violation: matched
          ? {
              type: matched.type,
              severity: matched.severity,
              score: matched.score,
              detailsJson: matched.details_json,
            }
          : null,
      };
    });
    const hasViolation = checkResults.some((cr) => cr.isViolation);
    const persistedIds: mongoose.Types.ObjectId[] = [];
    const event = await DetectionEventModel.create({
      cameraId: camera._id,
      modelId: ids.aiModel._id,
      mappingId: mapping._id,
      detectedAt: new Date(),
      checkResults,
      isViolation: hasViolation,
      detections: resp.detections.map((d) => ({
        label: d.label,
        confidence: d.confidence,
        bbox: d.bbox,
      })),
      expiresAt,
    });
    persistedIds.push(event._id);
    console.log(`→ persisted DetectionEvent ${event._id}: ${checkResults.length} checks, isViolation=${hasViolation}`);

    // ── Verify ───────────────────────────────────────────────────────────────
    console.log("\n--- Verifikasi MongoDB ---");
    const events = await DetectionEventModel.find({ _id: { $in: persistedIds } }).lean();
    const allCheckResults = events.flatMap((e) => e.checkResults);
    for (const cr of allCheckResults) {
      console.log(`  ${cr.check.padEnd(22)} isViolation=${cr.isViolation}`);
    }

    const personCheck = resp.check_results.find((c) => c.check === "person_count");
    const personCount = personCheck?.value ?? 0;
    const personResult = allCheckResults.find((cr) => cr.check === "person_count");
    const expectedViolation = personCount > crowdThreshold;

    console.log("\n--- Sanity check ---");
    console.log(`  person_count   : ${personCount}`);
    console.log(`  threshold      : ${crowdThreshold}`);
    console.log(`  expected fire  : ${expectedViolation}`);
    console.log(`  Mongo isViolation: ${personResult?.isViolation}`);

    if (personResult?.isViolation !== expectedViolation) {
      console.error("\n❌ FAIL — MongoDB isViolation flag tidak sesuai ekspektasi.");
      process.exit(1);
    }
    console.log("\n✅ PASS — full integration flow MongoDB ↔ gRPC ↔ AI bekerja, isViolation flag benar.");
  } finally {
    console.log("\n→ cleaning up test data...");
    await cleanup(ids);
    await mongoose.disconnect();
    console.log("  ✓ done");
  }
}

main().catch(async (err) => {
  console.error("[fatal]", err);
  await mongoose.disconnect();
  process.exit(1);
});
