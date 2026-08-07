import pino from "pino";
import { CameraModel } from "../models/camera.model";
import { DetectionEventModel } from "../models/detectionEvent.model";
import "../models/aiModel.model";
import "../models/area.model";
import "../models/cameraMapping.model";
import "../models/pic.model";
import { getActiveMappingsForCamera } from "./cameraMapping.service";
import { inferViaGrpc, checkForViolation, type CameraRules } from "../plugins/aiGrpcClient";
import { saveEvidenceSnapshot } from "../plugins/storage";
import { annotateFrame } from "../utils/annotateFrame";
import { notificationQueue } from "../queues/notification.queue";
import { publishViolation } from "../plugins/eventBus";
import { getSettings } from "./systemSettings.service";
import { publishLog } from "../plugins/logStream";
import { isScheduleActive } from "../utils/schedule";

const logger = pino({ name: "frame-pipeline" });

// ─── Inference helpers ────────────────────────────────────────────────────────

type InferResult = Awaited<ReturnType<typeof inferViaGrpc>>;

export function buildCheckResults(inferResult: InferResult) {
  return inferResult.check_results.map((cr) => {
    const matchedViolation = inferResult.violations.find(
      (v) => checkForViolation(v.type) === cr.check
    );
    return {
      check: cr.check,
      value: cr.value ?? 0,
      confidence: cr.confidence,
      isViolation: matchedViolation !== undefined,
      violation: matchedViolation
        ? {
            type: matchedViolation.type,
            severity: matchedViolation.severity,
            score: matchedViolation.score,
            detailsJson: matchedViolation.details_json
          }
        : null
    };
  });
}

export async function saveEvidence(
  cameraId: string,
  frameBuffer: Buffer,
  detections: Array<{
    label: string;
    confidence: number;
    bbox: [number, number, number, number];
    attributes?: Record<string, string>;
  }>,
  redZones: Array<{ name: string; points: Array<{ x: number; y: number }> }>
): Promise<{
  evidenceUrl: string | null;
  evidencePath: string | null;
  originalEvidenceUrl: string | null;
  originalEvidencePath: string | null;
}> {
  try {
    const ts = Date.now();
    const original = await saveEvidenceSnapshot(cameraId, frameBuffer, { suffix: "original", ts });
    const annotated = await annotateFrame(frameBuffer, detections, redZones);
    const annotatedSaved = await saveEvidenceSnapshot(cameraId, annotated, { ts });
    return {
      evidenceUrl: annotatedSaved.publicUrl,
      evidencePath: annotatedSaved.filePath,
      originalEvidenceUrl: original.publicUrl,
      originalEvidencePath: original.filePath
    };
  } catch {
    logger.error({ cameraId }, "Failed to save evidence snapshot");
    return { evidenceUrl: null, evidencePath: null, originalEvidenceUrl: null, originalEvidencePath: null };
  }
}

export async function notifyViolation(params: {
  eventId: string;
  cameraId: string;
  checkResults: ReturnType<typeof buildCheckResults>;
  evidenceUrl: string | null;
  latestUrl: string;
  detectedAt: Date;
}): Promise<void> {
  const { eventId, cameraId, checkResults, evidenceUrl, latestUrl, detectedAt } = params;

  await notificationQueue.add("notify", { eventId, cameraId });

  await publishViolation({
    eventId,
    cameraId,
    violations: checkResults
      .filter((cr) => cr.isViolation)
      .map((cr) => ({ check: cr.check, confidence: cr.confidence })),
    snapshotUrl: evidenceUrl ?? latestUrl,
    detectedAt
  });

  logger.info(
    { cameraId, violations: checkResults.filter((cr) => cr.isViolation).map((cr) => cr.check) },
    "Violations detected"
  );
}

// ─── Per-mapping inference runner ─────────────────────────────────────────────

type ActiveMapping = Awaited<ReturnType<typeof getActiveMappingsForCamera>>[number];
type InferRequest = Parameters<typeof inferViaGrpc>[0];

// Resolve which checks to run: per-mapping override → model defaults → person_count
// fallback, plus red_zone_count whenever the camera has red zones configured.
function resolveSelectedChecks(mapping: ActiveMapping, hasRedZones: boolean): string[] {
  const mappingChecks = mapping.selectedChecks as string[] | undefined;
  const modelDefaultChecks = (mapping.modelId as { defaultChecks?: string[] } | null)?.defaultChecks;
  const selectedChecks = [
    ...(mappingChecks?.length
      ? mappingChecks
      : modelDefaultChecks?.length
        ? modelDefaultChecks
        : ["person_count"])
  ];
  if (hasRedZones && !selectedChecks.includes("red_zone_count")) {
    selectedChecks.push("red_zone_count");
  }
  return selectedChecks;
}

// Assemble the gRPC inference request, normalizing all geometry to [0,1] points.
function buildInferRequest(args: {
  cameraId: string;
  frameBuffer: Buffer;
  selectedChecks: string[];
  mapping: ActiveMapping;
  rules?: CameraRules;
  redZones: Array<{ name: string; points: Array<{ x: number; y: number }> }>;
}): InferRequest {
  const { cameraId, frameBuffer, selectedChecks, mapping, rules, redZones } = args;
  return {
    camera_id: cameraId,
    frame_id: `frame-${Date.now()}`,
    timestamp_utc: new Date().toISOString(),
    selected_checks: selectedChecks,
    image_base64: frameBuffer.toString("base64"),
    thresholds: mapping.confidenceThreshold
      ? { conf: mapping.confidenceThreshold, iou: 0.45 }
      : undefined,
    rules,
    // Normalized [0,1] polygon for red_zone_count; AI skips if < 3 points.
    roi_polygon: ((mapping.roiPolygon as Array<{ x: number; y: number }> | undefined) ?? []).map(
      (p) => ({ x: p.x, y: p.y })
    ),
    // Handrail geometry for handrail_count; AI skips if zone < 3 pts or no line.
    stairs_zone: ((mapping.stairsZone as Array<{ x: number; y: number }> | undefined) ?? []).map(
      (p) => ({ x: p.x, y: p.y })
    ),
    handrail_lines: (
      (mapping.handrailLines as Array<{ points: Array<{ x: number; y: number }> }> | undefined) ?? []
    ).map((line) => ({ points: (line.points ?? []).map((p) => ({ x: p.x, y: p.y })) })),
    red_zones: redZones.map((z) => ({
      name: z.name,
      points: z.points.map((p) => ({
        x: Math.max(0, Math.min(1, p.x)),
        y: Math.max(0, Math.min(1, p.y))
      }))
    }))
  };
}

// Call the AI service, logging + swallowing failures (returns null so the caller
// can bail out without throwing on a per-frame inference error).
async function runGrpcInference(
  request: InferRequest,
  cameraId: string,
  mappingId: string
): Promise<InferResult | null> {
  try {
    return await inferViaGrpc(request);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ cameraId, mappingId, err: msg }, "gRPC inference failed");
    publishLog({
      level: "error",
      source: "system",
      msg: `AI gRPC failed → cameraId=${cameraId} — ${msg}`,
      meta: { cameraId, mappingId, reason: msg }
    });
    return null;
  }
}

// Publish the human-readable response + violation summaries to the live log stream.
function logInferenceResponse(
  cameraId: string,
  inferResult: InferResult,
  checkResults: ReturnType<typeof buildCheckResults>,
  hasViolation: boolean
): void {
  const labelCounts: Record<string, number> = {};
  for (const d of inferResult.detections) {
    labelCounts[d.label] = (labelCounts[d.label] ?? 0) + 1;
  }
  const detectionSummary = Object.entries(labelCounts)
    .map(([lbl, n]) => `${n}×${lbl}`)
    .join(", ") || "none";

  const checkSummary = checkResults
    .map((cr) => `${cr.check}=${cr.value}${cr.isViolation ? "⚠" : ""}`)
    .join(", ");

  publishLog({
    level: hasViolation ? "warn" : "info",
    source: "system",
    msg: `AI response ${inferResult.latency_ms}ms — detections: ${detectionSummary}`,
    meta: {
      cameraId,
      latencyMs: inferResult.latency_ms,
      detections: inferResult.detections.length,
      checks: checkSummary,
      violations: inferResult.violations.length
    }
  });

  if (hasViolation) {
    const violationTypes = checkResults
      .filter((cr) => cr.isViolation)
      .map((cr) => `${cr.check}(sev:${cr.violation?.severity ?? "?"})`);
    publishLog({
      level: "error",
      source: "system",
      msg: `Violation detected → cameraId=${cameraId} [${violationTypes.join(", ")}]`,
      meta: { cameraId, violations: violationTypes }
    });
  }
}

// Cooldown / debounce: a violation that persists across frames should count as ONE
// occurrence, not a fresh event every cycle. If this camera+mapping already logged a
// violation within `cooldownPeriod` seconds, the current frame is the same ongoing
// violation — skip the event (and notification). After the window passes, a still-active
// violation logs again as a new occurrence.
async function isViolationDebounced(
  cameraId: string,
  mappingId: ActiveMapping["_id"],
  cooldownPeriod: number
): Promise<boolean> {
  const since = new Date(Date.now() - cooldownPeriod * 1_000);
  const recent = await DetectionEventModel.exists({
    cameraId,
    mappingId,
    isViolation: true,
    detectedAt: { $gte: since }
  });
  if (!recent) return false;
  publishLog({
    level: "info",
    source: "system",
    msg: `Violation debounced (cooldown ${cooldownPeriod}s) → cameraId=${cameraId} — same ongoing violation, not re-logged`,
    meta: { cameraId, mappingId: String(mappingId), cooldownPeriod }
  });
  return true;
}

export type LiveDetection = {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  attributes?: Record<string, string>;
};

type MappingInferenceResult = {
  eventId: string | null;
  hasViolation: boolean;
  /** Raw-ish detection/check/violation data for the caller's live overlay —
   *  populated whenever an inference actually ran, regardless of whether the
   *  result was persisted (see the evidence-gating note below). */
  detections: LiveDetection[];
  checkResults: InferResult["check_results"];
  violations: InferResult["violations"];
};

const NO_LIVE_DATA = { detections: [] as LiveDetection[], checkResults: [], violations: [] };

export async function runMappingInference(params: {
  cameraId: string;
  frameBuffer: Buffer;
  latestUrl: string;
  mapping: ActiveMapping;
  timezone: string;
  expiresAt: Date;
  rules?: CameraRules;
  redZones: Array<{ name: string; points: Array<{ x: number; y: number }> }>;
  /** Debounce window (seconds). A violation that persists within this window of a
   *  prior one on the same camera+mapping is treated as the same ongoing violation
   *  and skipped (no new event, no notification). 0 disables debounce. */
  cooldownPeriod: number;
}): Promise<MappingInferenceResult> {
  const { cameraId, frameBuffer, latestUrl, mapping, timezone, expiresAt, rules, redZones, cooldownPeriod } = params;
  const mappingId = String(mapping._id);

  if (!isScheduleActive(mapping.schedule as Parameters<typeof isScheduleActive>[0], timezone)) {
    logger.info({ cameraId, mappingId }, "Mapping schedule not active — skipping");
    return { eventId: null, hasViolation: false, ...NO_LIVE_DATA };
  }

  const selectedChecks = resolveSelectedChecks(mapping, redZones.length > 0);

  publishLog({
    level: "info",
    source: "system",
    msg: `AI request → cameraId=${cameraId} checks=[${selectedChecks.join(", ")}]`,
    meta: { cameraId, mappingId, checks: selectedChecks }
  });

  const request = buildInferRequest({ cameraId, frameBuffer, selectedChecks, mapping, rules, redZones });
  const inferResult = await runGrpcInference(request, cameraId, mappingId);
  if (!inferResult) return { eventId: null, hasViolation: false, ...NO_LIVE_DATA };

  const checkResults = buildCheckResults(inferResult);
  const hasViolation = checkResults.some((cr) => cr.isViolation);
  const mappedDetections: LiveDetection[] = inferResult.detections.map((d) => ({
    label: d.label,
    confidence: d.confidence,
    bbox: d.bbox as [number, number, number, number],
    attributes: d.attributes ?? {}
  }));
  const liveData = {
    detections: mappedDetections,
    checkResults: inferResult.check_results,
    violations: inferResult.violations
  };

  logInferenceResponse(cameraId, inferResult, checkResults, hasViolation);

  // Evidence (2 JPEGs) + a DetectionEvent row are only persisted when a check
  // actually violates — at always-on cadence, writing both on every clean
  // cycle would dwarf the AI call itself in disk/DB cost for no audit value.
  // The live overlay above still reflects every cycle regardless.
  if (!hasViolation) {
    return { eventId: null, hasViolation: false, ...liveData };
  }

  if (cooldownPeriod > 0 && (await isViolationDebounced(cameraId, mapping._id, cooldownPeriod))) {
    return { eventId: null, hasViolation: true, ...liveData };
  }

  const { evidenceUrl, evidencePath, originalEvidenceUrl, originalEvidencePath } =
    await saveEvidence(cameraId, frameBuffer, mappedDetections, redZones);

  const event = await DetectionEventModel.create({
    cameraId,
    modelId: (mapping.modelId as unknown as { _id: unknown })._id,
    mappingId: mapping._id,
    detectedAt: new Date(),
    checkResults,
    isViolation: true,
    detections: mappedDetections,
    snapshotPath: evidencePath,
    snapshotUrl: evidenceUrl,
    originalSnapshotPath: originalEvidencePath,
    originalSnapshotUrl: originalEvidenceUrl,
    expiresAt
  });

  await notifyViolation({
    eventId: event._id.toString(),
    cameraId,
    checkResults,
    evidenceUrl,
    latestUrl,
    detectedAt: event.detectedAt
  });

  return { eventId: event._id.toString(), hasViolation: true, ...liveData };
}

// ─── Top-level orchestrator ───────────────────────────────────────────────────

export async function processFrameForCamera(
  cameraId: string,
  frameBuffer: Buffer,
  latestUrl: string
): Promise<{
  eventIds: string[];
  hasAnyViolation: boolean;
  detections: LiveDetection[];
  checkResults: InferResult["check_results"];
  violations: InferResult["violations"];
}> {
  const mappings = await getActiveMappingsForCamera(cameraId);
  if (mappings.length === 0) {
    logger.info({ cameraId }, "No active mappings — skipping inference");
    publishLog({
      level: "warn",
      source: "system",
      msg: `No active mappings for cameraId=${cameraId} — skipping AI inference`,
      meta: { cameraId }
    });
    return { eventIds: [], hasAnyViolation: false, ...NO_LIVE_DATA };
  }

  const settings = await getSettings();
  const retentionDays = settings.retention?.dataDays ?? 30;
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1_000);
  const timezone = (settings.get?.("timezone") as string | undefined) ?? "Asia/Jakarta";

  const camera = await CameraModel.findById(cameraId).lean();
  const rules: CameraRules | undefined =
    camera?.crowdThreshold != null ? { crowd_threshold: camera.crowdThreshold } : undefined;
  const redZones = (camera?.redZones ?? []) as Array<{ name: string; points: Array<{ x: number; y: number }> }>;
  // Per-camera debounce window for repeated violations (0 = disabled).
  const cooldownPeriod = camera?.cooldownPeriod ?? 0;

  const results = await Promise.allSettled(
    mappings.map((mapping) =>
      runMappingInference({ cameraId, frameBuffer, latestUrl, mapping, timezone, expiresAt, rules, redZones, cooldownPeriod })
    )
  );

  const eventIds: string[] = [];
  let hasAnyViolation = false;
  const detections: LiveDetection[] = [];
  const checkResults: InferResult["check_results"] = [];
  const violations: InferResult["violations"] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      if (r.value.eventId) eventIds.push(r.value.eventId);
      if (r.value.hasViolation) hasAnyViolation = true;
      detections.push(...r.value.detections);
      checkResults.push(...r.value.checkResults);
      violations.push(...r.value.violations);
    }
  }

  logger.info({ cameraId, mappings: mappings.length, eventIds: eventIds.length }, "Frame pipeline done");
  publishLog({
    level: hasAnyViolation ? "warn" : "info",
    source: "system",
    msg: `Pipeline done → cameraId=${cameraId} | ${eventIds.length}/${mappings.length} mappings | ${hasAnyViolation ? "VIOLATION" : "clean"}`,
    meta: { cameraId, mappings: mappings.length, events: eventIds.length, hasViolation: hasAnyViolation }
  });
  return { eventIds, hasAnyViolation, detections, checkResults, violations };
}
