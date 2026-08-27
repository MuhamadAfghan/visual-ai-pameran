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
import { toLabel } from "../utils/violationLabels";

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

// Unlike buildCheckResults() above (one entry per check-type, first-match-wins —
// fine for the notification/UI summary), this keeps every violation instance the
// AI service reported, each with its own trackId when the AI service could tell
// individual violators apart (see ai/.../infer.py's per-violator fan-out).
// Checks with no natural single violator (e.g. crowd_exceeded) report trackId null.
// Used to key the cooldown per-person instead of per-camera+mapping.
export function buildViolationInstances(inferResult: InferResult) {
  return inferResult.violations.map((v) => ({
    check: checkForViolation(v.type) ?? v.type,
    type: v.type,
    severity: v.severity,
    score: v.score,
    trackId: v.track_id ?? null,
    detailsJson: v.details_json
  }));
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

function toPublishableViolations(checkResults: ReturnType<typeof buildCheckResults>) {
  return checkResults
    .filter((cr) => cr.isViolation)
    .map((cr) => ({
      check: cr.check,
      confidence: cr.confidence,
      severity: cr.violation?.severity ?? null,
      label: toLabel(cr.check)
    }));
}

export async function notifyViolation(params: {
  eventId: string;
  cameraId: string;
  cameraName: string;
  checkResults: ReturnType<typeof buildCheckResults>;
  evidenceUrl: string | null;
  latestUrl: string;
  detectedAt: Date;
}): Promise<void> {
  const { eventId, cameraId, cameraName, checkResults, evidenceUrl, latestUrl, detectedAt } = params;

  await notificationQueue.add("notify", { eventId, cameraId });

  await publishViolation({
    eventId,
    cameraId,
    cameraName,
    violations: toPublishableViolations(checkResults),
    snapshotUrl: evidenceUrl ?? latestUrl,
    detectedAt
  });

  logger.info(
    { cameraId, violations: checkResults.filter((cr) => cr.isViolation).map((cr) => cr.check) },
    "Violations detected"
  );
}

// "Repeat ping" — a lightweight, audio-only re-announcement for a violation that's
// still ongoing while suppressed by the cooldown debounce below. Deliberately does
// NOT touch Mongo (no DetectionEvent row, no evidence snapshot, no notification
// queue) — only an in-process throttle + one SSE emit — so "repeat while violating"
// can't multiply DB/disk/email load the way bypassing the debounce outright would.
const lastRepeatPingAt = new Map<string, number>();

function maybeSendRepeatPing(params: {
  key: string;
  cameraId: string;
  cameraName: string;
  checkResults: ReturnType<typeof buildCheckResults>;
  latestUrl: string;
  repeatIntervalSeconds: number;
}): void {
  const { key, cameraId, cameraName, checkResults, latestUrl, repeatIntervalSeconds } = params;
  const now = Date.now();
  const last = lastRepeatPingAt.get(key) ?? 0;
  if (now - last < repeatIntervalSeconds * 1_000) return;

  lastRepeatPingAt.set(key, now);
  void publishViolation({
    eventId: null,
    cameraId,
    cameraName,
    isRepeat: true,
    violations: toPublishableViolations(checkResults),
    snapshotUrl: latestUrl,
    detectedAt: new Date()
  });
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
// occurrence, not a fresh event every cycle. Keyed per INDIVIDUAL violator (via
// AI-assigned trackId) rather than per camera+mapping — so a different person
// violating during another person's cooldown window still gets captured. Checks
// where the AI service can't identify a single violator (trackId null, e.g.
// crowd_exceeded — a whole-zone metric) fall back to the old camera+mapping-wide
// cooldown, exactly as before this per-person distinction existed.
async function getUndebouncedViolationInstances(
  cameraId: string,
  mappingId: ActiveMapping["_id"],
  cooldownPeriod: number,
  violationInstances: ReturnType<typeof buildViolationInstances>
): Promise<ReturnType<typeof buildViolationInstances>> {
  const since = new Date(Date.now() - cooldownPeriod * 1_000);
  const trackedIds = [...new Set(violationInstances.map((v) => v.trackId).filter((id): id is number => id != null))];
  const hasUntracked = violationInstances.some((v) => v.trackId == null);

  let coveredTrackIds = new Set<number>();
  let hasRecentUntracked = false;
  if (trackedIds.length > 0 || hasUntracked) {
    const recentEvents = await DetectionEventModel.find(
      { cameraId, mappingId, isViolation: true, detectedAt: { $gte: since } },
      { violatingTrackIds: 1, hasUntrackedViolation: 1 }
    ).lean();
    for (const ev of recentEvents) {
      for (const id of ev.violatingTrackIds ?? []) coveredTrackIds.add(id);
      if (ev.hasUntrackedViolation) hasRecentUntracked = true;
    }
  }

  const undebounced = violationInstances.filter((v) => {
    if (v.trackId != null) return !coveredTrackIds.has(v.trackId);
    return !hasRecentUntracked;
  });

  if (undebounced.length === 0) {
    publishLog({
      level: "info",
      source: "system",
      msg: `Violation debounced (cooldown ${cooldownPeriod}s) → cameraId=${cameraId} — same ongoing violator(s), not re-logged`,
      meta: { cameraId, mappingId: String(mappingId), cooldownPeriod }
    });
  }
  return undebounced;
}

// Serializes the debounce-check → evidence-save → event-create section per
// camera+mapping. Device-camera pushes now fire in parallel (not gated on
// the previous push's response), so without this, two concurrent frames for
// the same camera+mapping could both pass isViolationDebounced() before
// either has written its DetectionEvent — producing duplicate events/
// notifications for what should count as one ongoing violation. Only this
// section queues; inference itself (the expensive part) still runs fully in
// parallel, and a queue only forms here on an actual violation, not every
// frame.
const violationLocks = new Map<string, Promise<void>>();

function withViolationLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = violationLocks.get(key) ?? Promise.resolve();
  const result = previous.then(fn);
  // A separate never-rejecting marker, so the next caller for this key is
  // released regardless of whether we threw — storing `result` itself would
  // wedge the lock forever after the first failure.
  violationLocks.set(
    key,
    result.then(
      () => undefined,
      () => undefined
    )
  );
  return result;
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
  cameraName: string;
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
  /** "cooldown" (default): rely solely on cooldownPeriod above for re-alerting.
   *  "continuous": additionally re-announce (audio-only, no DB writes) every
   *  repeatIntervalSeconds while the violation keeps being detected. */
  repeatMode: "cooldown" | "continuous";
  repeatIntervalSeconds: number;
}): Promise<MappingInferenceResult> {
  const {
    cameraId,
    cameraName,
    frameBuffer,
    latestUrl,
    mapping,
    timezone,
    expiresAt,
    rules,
    redZones,
    cooldownPeriod,
    repeatMode,
    repeatIntervalSeconds
  } = params;
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
  const violationInstances = buildViolationInstances(inferResult);
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

  const outcome = await withViolationLock(`${cameraId}:${mappingId}`, async () => {
    if (cooldownPeriod > 0) {
      const undebounced = await getUndebouncedViolationInstances(
        cameraId,
        mapping._id,
        cooldownPeriod,
        violationInstances
      );
      if (undebounced.length === 0) {
        return { debounced: true as const };
      }
    }

    const { evidenceUrl, evidencePath, originalEvidenceUrl, originalEvidencePath } =
      await saveEvidence(cameraId, frameBuffer, mappedDetections, redZones);

    // Recorded from ALL current violators (not just the newly-undebounced ones) —
    // this capture's snapshot shows everyone violating right now, so it re-baselines
    // the cooldown for each of them, tracked or not.
    const violatingTrackIds = [
      ...new Set(violationInstances.map((v) => v.trackId).filter((id): id is number => id != null))
    ];
    const hasUntrackedViolation = violationInstances.some((v) => v.trackId == null);

    const event = await DetectionEventModel.create({
      cameraId,
      modelId: (mapping.modelId as unknown as { _id: unknown })._id,
      mappingId: mapping._id,
      detectedAt: new Date(),
      checkResults,
      isViolation: true,
      detections: mappedDetections,
      violatingTrackIds,
      hasUntrackedViolation,
      snapshotPath: evidencePath,
      snapshotUrl: evidenceUrl,
      originalSnapshotPath: originalEvidencePath,
      originalSnapshotUrl: originalEvidenceUrl,
      expiresAt
    });

    return { debounced: false as const, event, evidenceUrl };
  });

  const lockKey = `${cameraId}:${mappingId}`;

  if (outcome.debounced) {
    if (repeatMode === "continuous") {
      maybeSendRepeatPing({ key: lockKey, cameraId, cameraName, checkResults, latestUrl, repeatIntervalSeconds });
    }
    return { eventId: null, hasViolation: true, ...liveData };
  }

  // A real (non-debounced) notify just fired — reset the repeat-ping clock so
  // the next repeat is timed from this fresh alert, not from an earlier cycle.
  lastRepeatPingAt.set(lockKey, Date.now());

  const { event, evidenceUrl } = outcome;

  await notifyViolation({
    eventId: event._id.toString(),
    cameraId,
    cameraName,
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
  const cameraName = camera?.name ?? cameraId;
  const rules: CameraRules | undefined =
    camera?.crowdThreshold != null ? { crowd_threshold: camera.crowdThreshold } : undefined;
  const redZones = (camera?.redZones ?? []) as Array<{ name: string; points: Array<{ x: number; y: number }> }>;
  // Per-camera debounce window for repeated violations (0 = disabled).
  const cooldownPeriod = camera?.cooldownPeriod ?? 0;
  const repeatMode = settings.violationAlert?.repeatMode ?? "cooldown";
  const repeatIntervalSeconds = settings.violationAlert?.repeatIntervalSeconds ?? 15;

  const results = await Promise.allSettled(
    mappings.map((mapping) =>
      runMappingInference({
        cameraId,
        cameraName,
        frameBuffer,
        latestUrl,
        mapping,
        timezone,
        expiresAt,
        rules,
        redZones,
        cooldownPeriod,
        repeatMode,
        repeatIntervalSeconds
      })
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
