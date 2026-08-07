/**
 * Test Opsi 2 — full monitoring-hub flow with fake RTSP.
 *
 * Exercises THE actual production code path (post always-on rewrite):
 *   startMonitoringHub → persistent ffmpeg decode → per-frame capture cycle
 *   runMappingInference → inferViaGrpc → AI service (gRPC :50051)
 *   DetectionEvent (only on violation) → MongoDB
 *
 * No BullMQ/Redis involved anymore — the monitoring hub drives capture and
 * inference directly, so this test only needs Mongo + the AI service + the
 * fake RTSP source.
 *
 * Prasyarat:
 *   1. MongoDB hidup (cctv_detector @ :27017)
 *   2. AI gRPC server hidup (:50051)
 *   3. MediaMTX hidup dengan stream rtsp://localhost:8554/fake-cam aktif
 *      (run: mediamtx.exe + ffmpeg loop push)
 *   4. ffmpeg tersedia di PATH (dipakai oleh monitoring hub untuk decode)
 *
 * Run:
 *   npx tsx src/scripts/smokeRtspIntegration.ts [--crowd-threshold N]
 *
 * Default threshold: 0 (zero-tolerance, fire violation untuk siapapun) — ini
 * penting karena evidence + DetectionEvent sekarang HANYA dipersist saat ada
 * violation; threshold non-zero tanpa cukup orang di frame tidak akan
 * menghasilkan event sama sekali (itu perilaku yang benar, bukan bug).
 */

import mongoose from "mongoose";
import { connectMongo } from "../config/mongo";
import { CameraModel } from "../models/camera.model";
import { CameraMappingModel } from "../models/cameraMapping.model";
import { AiModelModel } from "../models/aiModel.model";
import { SectionModel } from "../models/section.model";
import { AreaModel } from "../models/area.model";
import { PicModel } from "../models/pic.model";
import { DetectionEventModel } from "../models/detectionEvent.model";
import { startMonitoringHub, stopMonitoringHub } from "../plugins/cameraStreamHub";

const TEST_TAG = "smoke-rtsp";
const RTSP_URL = "rtsp://localhost:8554/fake-cam";
// 1080p video can take a few seconds for the decoder to warm up + YOLO cold
// start. Generous timeout to accommodate that, polled every 500ms.
const EVENT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 500;

function parseArgs(): { crowdThreshold: number } {
  const argv = process.argv.slice(2);
  let crowdThreshold = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--crowd-threshold") crowdThreshold = parseInt(argv[++i], 10);
  }
  return { crowdThreshold };
}

async function setupTestData(crowdThreshold: number) {
  const suffix = Date.now();
  const area = await AreaModel.create({ code: `${TEST_TAG}-area-${suffix}`, name: "RTSP Test Area" });
  const section = await SectionModel.create({
    code: `${TEST_TAG}-section-${suffix}`,
    name: "RTSP Test Section",
    areaId: area._id,
  });
  const pic = await PicModel.create({
    name: "RTSP Test PIC",
    email: `${TEST_TAG}-${suffix}@example.test`,
  });
  const camera = await CameraModel.create({
    code: `${TEST_TAG}-cam-${suffix}`,
    name: "Fake RTSP Camera",
    rtspUrl: RTSP_URL,
    sectionId: section._id,
    crowdThreshold,
    defaultPicIds: [pic._id],
    isActive: true,
  });
  const aiModel = await AiModelModel.create({
    code: `${TEST_TAG}-model-${suffix}`,
    name: "RTSP Smoke People Counting",
    defaultChecks: ["person_count"],
    version: "test",
  });
  const mapping = await CameraMappingModel.create({
    cameraId: camera._id,
    modelId: aiModel._id,
    selectedChecks: ["person_count"],
    confidenceThreshold: 0.25,
    isActive: true,
    schedule: { type: "always" },
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEvent(cameraId: string): Promise<void> {
  const deadline = Date.now() + EVENT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const count = await DetectionEventModel.countDocuments({ cameraId });
    if (count > 0) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`No DetectionEvent persisted within ${EVENT_TIMEOUT_MS}ms`);
}

async function main(): Promise<void> {
  const { crowdThreshold } = parseArgs();

  console.log("→ connecting to MongoDB...");
  await connectMongo();
  console.log(`  ✓ connected: ${mongoose.connection.name}\n`);

  const ids = await setupTestData(crowdThreshold);
  console.log("→ seeded test data:");
  console.log(`  camera   : ${ids.camera._id}`);
  console.log(`  rtspUrl  : ${ids.camera.rtspUrl}`);
  console.log(`  threshold: ${crowdThreshold}\n`);

  const cameraId = ids.camera._id.toString();

  try {
    console.log("→ starting monitoring hub (persistent ffmpeg decode + capture cycle)...");
    startMonitoringHub(cameraId, RTSP_URL);

    console.log("→ waiting for a DetectionEvent to be persisted (RTSP capture → AI gRPC → MongoDB)...");
    await waitForEvent(cameraId);
    console.log("  ✓ event persisted\n");

    const events = await DetectionEventModel.find({ cameraId: ids.camera._id }).lean();
    console.log(`--- DetectionEvents persisted: ${events.length} ---`);
    for (const e of events) {
      for (const cr of e.checkResults) {
        console.log(`  ${cr.check.padEnd(20)} confidence=${cr.confidence.toFixed(2)}  isViolation=${cr.isViolation}`);
      }
    }

    const personEvent = events.find((e) => e.checkResults.some((cr) => cr.check === "person_count"));
    if (!personEvent) {
      throw new Error("No person_count DetectionEvent persisted");
    }

    console.log("\n--- Sanity check ---");
    console.log(`  rtspUrl                  : ${RTSP_URL}`);
    console.log(`  crowdThreshold           : ${crowdThreshold}`);
    console.log(`  person_count event ada   : ${personEvent !== undefined}`);
    console.log(`  Mongo isViolation        : ${personEvent.isViolation}`);
    console.log(`  detections count         : ${personEvent.detections?.length ?? 0}`);
    console.log(`  snapshot evidence stored : ${!!personEvent.snapshotPath}`);

    // Every persisted event is now, by construction, a violation (evidence-
    // gated persistence) — the interesting assertion is just that the fixture
    // actually produced one, not that isViolation matches a computed flag.
    if (!personEvent.isViolation) {
      throw new Error("Persisted event has isViolation=false — evidence gating regressed");
    }

    console.log("\n✅ PASS — full RTSP→AI→Mongo pipeline via the always-on monitoring hub bekerja.");
  } finally {
    console.log("\n→ stopping monitoring hub...");
    stopMonitoringHub(cameraId);
    console.log("→ cleaning up test data...");
    await cleanup(ids);
    await mongoose.disconnect();
    console.log("  ✓ done");
  }
}

main().catch(async (err) => {
  console.error("[fatal]", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
