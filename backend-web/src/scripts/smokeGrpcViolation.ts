/**
 * Smoke test gRPC backend ↔ AI tanpa MongoDB / Redis / Workers.
 * Tujuan: verifikasi Clash #1 fix — backend benar-benar match violation ke
 * check yang tepat via VIOLATION_TO_CHECK map (bukan startsWith).
 *
 * Prasyarat: AI gRPC server hidup di port 50051.
 *
 *   npx ts-node src/scripts/smokeGrpcViolation.ts [--crowd-threshold N] [--image PATH]
 *
 * Default image: ../ai/contracts/example-1.jpg
 * Default threshold: 1 (kecil supaya pasti trigger di gambar dengan beberapa orang)
 */

import fs from "node:fs";
import path from "node:path";
import {
  inferViaGrpc,
  checkForViolation,
  VIOLATION_TO_CHECK,
  type InferRequest,
} from "../plugins/aiGrpcClient";

function parseArgs(): { crowdThreshold: number; imagePath: string } {
  const argv = process.argv.slice(2);
  let crowdThreshold = 1;
  let imagePath = path.resolve(__dirname, "../../../ai/contracts/example-1.jpg");

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--crowd-threshold") {
      crowdThreshold = parseInt(argv[++i], 10);
    } else if (argv[i] === "--image") {
      imagePath = path.resolve(argv[++i]);
    }
  }
  return { crowdThreshold, imagePath };
}

async function main(): Promise<void> {
  const { crowdThreshold, imagePath } = parseArgs();

  if (!fs.existsSync(imagePath)) {
    console.error(`[error] image not found: ${imagePath}`);
    process.exit(1);
  }

  const imageBase64 = fs.readFileSync(imagePath).toString("base64");

  const req: InferRequest = {
    camera_id: "65f8e2a1c4d2b3e4a5f60718", // dummy ObjectId hex
    frame_id: `smoke-${Date.now()}`,
    timestamp_utc: new Date().toISOString(),
    image_base64: imageBase64,
    selected_checks: ["person_count", "helmet_count"],
    thresholds: { conf: 0.25, iou: 0.45 },
    rules: { crowd_threshold: crowdThreshold },
  };

  console.log(`→ image      : ${path.basename(imagePath)}`);
  console.log(`→ checks     : ${req.selected_checks.join(", ")}`);
  console.log(`→ rules      : { crowd_threshold: ${crowdThreshold} }`);
  console.log(`→ map        : ${JSON.stringify(VIOLATION_TO_CHECK)}\n`);

  const start = Date.now();
  const resp = await inferViaGrpc(req);
  const elapsed = Date.now() - start;

  console.log(`← latency_ms : ${resp.latency_ms.toFixed(1)} (wall: ${elapsed}ms)`);
  console.log(`← models     : ${resp.model_tasks_executed.join(", ")}`);
  console.log(`← detections : ${resp.detections.length}`);
  console.log("← check_results:");
  for (const cr of resp.check_results) {
    const breakdown = JSON.stringify(cr.details.breakdown);
    console.log(`    - ${cr.check.padEnd(22)} value=${cr.value}  breakdown=${breakdown}`);
  }
  console.log(`← violations : ${resp.violations.length}`);
  for (const v of resp.violations) {
    console.log(
      `    - type=${v.type} severity=${v.severity} score=${v.score} details=${v.details_json}`,
    );
  }

  console.log("\n--- Verifikasi mapping violation → check ---");
  let anyMismatched = false;
  for (const cr of resp.check_results) {
    const matched = resp.violations.find((v) => checkForViolation(v.type) === cr.check);
    const flag = matched ? "🔴 VIOLATION" : "✅ OK";
    console.log(`  ${cr.check.padEnd(22)} → ${flag}` + (matched ? ` (${matched.type})` : ""));
    if (matched && checkForViolation(matched.type) === undefined) {
      anyMismatched = true;
    }
  }

  const personCount = resp.check_results.find((c) => c.check === "person_count")?.value ?? 0;
  const expectedViolation = personCount > crowdThreshold;
  const actualViolation = resp.violations.some((v) => v.type === "crowd_exceeded");

  console.log("\n--- Sanity check ---");
  console.log(`  person_count    : ${personCount}`);
  console.log(`  threshold       : ${crowdThreshold}`);
  console.log(`  expected fire   : ${expectedViolation}`);
  console.log(`  actually fired  : ${actualViolation}`);

  if (expectedViolation !== actualViolation || anyMismatched) {
    console.error("\n❌ FAIL — violation logic inconsistent.");
    process.exit(1);
  }
  console.log("\n✅ PASS — backend match logic & rules flow OK.");
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
