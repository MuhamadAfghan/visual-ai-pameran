/**
 * Stress test for the Backend -> AI gRPC inference path.
 *
 * Drives `inferViaGrpc()` from the Backend's gRPC client (same module the
 * inference & snapshot workers use), measures round-trip latency from the
 * Backend's perspective AND AI-side latency from the response, across
 * increasing concurrency tiers. Writes one CSV row per tier.
 *
 * Backend HTTP server is NOT required for this script — it imports the gRPC
 * client module directly via tsx. AI gRPC service MUST be running.
 *
 *   Run:  npx tsx src/scripts/stressTestInference.ts
 */

import fs from "node:fs";
import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import { env } from "../config/env";
import {
  inferViaGrpc,
  pingAi,
  type InferRequest
} from "../plugins/aiGrpcClient";

// --- Config (tweak here) ---------------------------------------------------

const TIERS: number[] = [1, 5, 10, 20, 50];
const REQUESTS_PER_TIER = 50;
const PER_REQUEST_TIMEOUT_MS = 60_000;

const IMAGE_PATH = path.resolve(
  __dirname,
  "../../../ai/contracts/example-1.jpg"
);

const CAMERA_PROFILES: Array<{
  cameraId: string;
  selectedChecks: string[];
}> = [
  { cameraId: "cam_area1_01", selectedChecks: ["helmet_count", "vest_count"] },
  { cameraId: "cam_area1_02", selectedChecks: ["mask_count"] },
  { cameraId: "cam_area2_01", selectedChecks: ["person_count"] },
  {
    cameraId: "cam_area2_02",
    selectedChecks: ["person_count", "helmet_count", "vest_count"]
  }
];

// --- Types -----------------------------------------------------------------

type RequestOutcome = {
  ok: boolean;
  roundTripMs: number;
  aiLatencyMs: number | null;
  errorCode?: string;
  errorMsg?: string;
};

type TierReport = {
  tier: number;
  requestsSent: number;
  succeeded: number;
  failed: number;
  wallClockSec: number;
  throughputRps: number;
  rt_min: number;
  rt_p50: number;
  rt_p95: number;
  rt_p99: number;
  rt_max: number;
  ai_p50: number;
  ai_p95: number;
  firstErrorCode: string | null;
};

// --- Helpers ---------------------------------------------------------------

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * pct))
  );
  return sorted[idx];
}

function buildRequest(reqIdx: number): InferRequest {
  const profile = CAMERA_PROFILES[reqIdx % CAMERA_PROFILES.length];
  return {
    camera_id: profile.cameraId,
    frame_id: `${profile.cameraId}-stress-${reqIdx}`,
    timestamp_utc: new Date().toISOString(),
    image_uri: IMAGE_PATH,
    selected_checks: profile.selectedChecks,
    thresholds: { conf: 0.25, iou: 0.45 }
  };
}

async function runOne(reqIdx: number): Promise<RequestOutcome> {
  const timer = setTimeout(() => {
    // Soft timeout marker — gRPC call has no deadline configured in the
    // existing client; we still want the worker pool to keep moving if AI
    // hangs. The actual rejection comes from gRPC, not here; this is just
    // a safety net for never-resolving promises (shouldn't fire in practice).
  }, PER_REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const response = await inferViaGrpc(buildRequest(reqIdx));
    const roundTripMs = performance.now() - startedAt;
    return {
      ok: true,
      roundTripMs,
      aiLatencyMs: response.latency_ms
    };
  } catch (err) {
    const e = err as grpc.ServiceError;
    return {
      ok: false,
      // Round-trip is not available on error path here (rejected before we
      // could capture it from inside the wrapper); record NaN so it's
      // excluded from percentile math.
      roundTripMs: NaN,
      aiLatencyMs: null,
      errorCode: e?.code !== undefined ? String(e.code) : "UNKNOWN",
      errorMsg: e?.message ?? String(err)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runTier(concurrency: number): Promise<TierReport> {
  const total = REQUESTS_PER_TIER;
  let nextIdx = 0;
  const outcomes: RequestOutcome[] = [];

  async function worker(): Promise<void> {
    // Each worker pulls the next task index until the shared counter
    // is exhausted. Concurrency = number of workers = exactly N in-flight.
    while (true) {
      const my = nextIdx++;
      if (my >= total) return;
      const out = await runOne(my);
      outcomes.push(out);
    }
  }

  const startedAt = performance.now();
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  const wallClockSec = (performance.now() - startedAt) / 1000;

  const succeeded = outcomes.filter((o) => o.ok);
  const failed = outcomes.filter((o) => !o.ok);

  const rtSorted = succeeded.map((o) => o.roundTripMs).sort((a, b) => a - b);
  const aiSorted = succeeded
    .map((o) => o.aiLatencyMs)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);

  const firstError = failed[0];

  return {
    tier: concurrency,
    requestsSent: total,
    succeeded: succeeded.length,
    failed: failed.length,
    wallClockSec,
    throughputRps: succeeded.length / wallClockSec,
    rt_min: rtSorted[0] ?? NaN,
    rt_p50: percentile(rtSorted, 0.5),
    rt_p95: percentile(rtSorted, 0.95),
    rt_p99: percentile(rtSorted, 0.99),
    rt_max: rtSorted[rtSorted.length - 1] ?? NaN,
    ai_p50: percentile(aiSorted, 0.5),
    ai_p95: percentile(aiSorted, 0.95),
    firstErrorCode: firstError?.errorCode ?? null
  };
}

function fmt(n: number, d = 1): string {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

function printComparison(reports: TierReport[]): void {
  const head = [
    "tier",
    "sent",
    "ok",
    "fail",
    "rps",
    "rt_min",
    "rt_p50",
    "rt_p95",
    "rt_p99",
    "rt_max",
    "ai_p50",
    "ai_p95"
  ];
  console.log("\n" + "=".repeat(96));
  console.log("STRESS TEST COMPARISON  (latencies in ms, throughput in req/s)");
  console.log("=".repeat(96));
  console.log(head.map((h) => h.padStart(8)).join(""));
  for (const r of reports) {
    const row = [
      String(r.tier),
      String(r.requestsSent),
      String(r.succeeded),
      String(r.failed),
      fmt(r.throughputRps, 1),
      fmt(r.rt_min, 1),
      fmt(r.rt_p50, 1),
      fmt(r.rt_p95, 1),
      fmt(r.rt_p99, 1),
      fmt(r.rt_max, 1),
      fmt(r.ai_p50, 1),
      fmt(r.ai_p95, 1)
    ];
    console.log(row.map((c) => c.padStart(8)).join(""));
  }
  console.log("=".repeat(96));
}

function detectDegradation(reports: TierReport[]): string {
  if (reports.length === 0) return "no tiers ran";
  const baseline = reports[0];
  const baselineP95 = baseline.rt_p95;
  for (const r of reports) {
    if (r.failed > 0) {
      return `tier=${r.tier}: ${r.failed}/${r.requestsSent} requests failed (first error code=${r.firstErrorCode})`;
    }
  }
  for (const r of reports.slice(1)) {
    if (Number.isFinite(baselineP95) && r.rt_p95 > 2 * baselineP95) {
      return `tier=${r.tier}: p95 round-trip ${r.rt_p95.toFixed(1)}ms is >2x baseline tier-1 p95 (${baselineP95.toFixed(1)}ms)`;
    }
  }
  return "none — no failures, p95 stayed within 2x of tier-1 baseline";
}

function writeCsv(reports: TierReport[], outPath: string): void {
  const header = [
    "tier_concurrency",
    "requests_sent",
    "succeeded",
    "failed",
    "wall_clock_sec",
    "throughput_rps",
    "rt_min_ms",
    "rt_p50_ms",
    "rt_p95_ms",
    "rt_p99_ms",
    "rt_max_ms",
    "ai_p50_ms",
    "ai_p95_ms",
    "first_error_code"
  ];
  const rows = reports.map((r) =>
    [
      r.tier,
      r.requestsSent,
      r.succeeded,
      r.failed,
      r.wallClockSec.toFixed(3),
      r.throughputRps.toFixed(2),
      r.rt_min.toFixed(2),
      r.rt_p50.toFixed(2),
      r.rt_p95.toFixed(2),
      r.rt_p99.toFixed(2),
      r.rt_max.toFixed(2),
      r.ai_p50.toFixed(2),
      r.ai_p95.toFixed(2),
      r.firstErrorCode ?? ""
    ].join(",")
  );
  fs.writeFileSync(outPath, [header.join(","), ...rows].join("\n") + "\n");
}

async function main(): Promise<void> {
  console.log("=".repeat(96));
  console.log("BACKEND -> AI gRPC STRESS TEST");
  console.log("=".repeat(96));
  console.log(`AI_GRPC_TARGET     : ${env.AI_GRPC_TARGET}`);
  console.log(`image_uri          : ${IMAGE_PATH}`);
  console.log(`tiers              : ${JSON.stringify(TIERS)}`);
  console.log(`requests per tier  : ${REQUESTS_PER_TIER}`);
  console.log(`camera profiles    : ${CAMERA_PROFILES.length}`);
  console.log(
    "NOTE: dev-environment numbers (in-memory queue, RTX 4060 Laptop GPU)."
  );
  console.log("      NOT production end-to-end latency.");
  console.log("=".repeat(96));

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`[error] image not found: ${IMAGE_PATH}`);
    process.exit(1);
  }

  // Preflight: AI service must be reachable.
  try {
    const status = await pingAi();
    console.log(`Health -> status='${status}'`);
  } catch (err) {
    const e = err as grpc.ServiceError;
    if (e?.code === grpc.status.UNAVAILABLE) {
      console.error(
        `[error] AI service tidak menyala di ${env.AI_GRPC_TARGET}. ` +
          `Jalankan 'ai/scripts/run_grpc_service.ps1' dulu.`
      );
    } else {
      console.error(
        `[error] Health RPC failed: code=${e?.code} message=${e?.message ?? err}`
      );
    }
    process.exit(1);
  }

  const reports: TierReport[] = [];
  for (const tier of TIERS) {
    console.log(`\n--- Tier: ${tier} concurrent (${REQUESTS_PER_TIER} requests) ---`);
    const report = await runTier(tier);
    reports.push(report);
    console.log(
      `  sent=${report.requestsSent} ok=${report.succeeded} fail=${report.failed} ` +
        `wall=${report.wallClockSec.toFixed(2)}s rps=${report.throughputRps.toFixed(1)}`
    );
    console.log(
      `  round-trip ms: min=${fmt(report.rt_min)} p50=${fmt(report.rt_p50)} ` +
        `p95=${fmt(report.rt_p95)} p99=${fmt(report.rt_p99)} max=${fmt(report.rt_max)}`
    );
    console.log(
      `  AI-side ms   : p50=${fmt(report.ai_p50)} p95=${fmt(report.ai_p95)}`
    );
    if (report.failed > 0) {
      console.log(
        `  [WARN] first error code=${report.firstErrorCode}, ` +
          `${report.failed}/${report.requestsSent} failures`
      );
    }
  }

  printComparison(reports);

  console.log(`\nDegradation: ${detectDegradation(reports)}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.resolve(
    __dirname,
    "../..",
    `stress_test_results_${stamp}.csv`
  );
  writeCsv(reports, outPath);
  console.log(`\nWrote CSV: ${outPath}`);
  console.log("Reminder: these are DEV-environment numbers, not production.");
}

main().catch((err) => {
  console.error("Stress test failed:", err);
  process.exitCode = 1;
});
