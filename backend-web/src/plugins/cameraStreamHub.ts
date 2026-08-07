import { spawn, type ChildProcess } from "node:child_process";
import type { Response } from "express";
import pino from "pino";
import { readJpegSize } from "../utils/rtspCapture";
import { getActiveMappingsForCamera } from "../services/cameraMapping.service";
import { getCameraById } from "../services/camera.service";
import { getSettings } from "../services/systemSettings.service";
import { runMappingInference } from "../services/framePipeline.service";
import { CameraModel } from "../models/camera.model";
import { saveLatestSnapshot } from "./storage";
import { publishLog } from "./logStream";
import type { CameraRules, CheckResult, Violation } from "./aiGrpcClient";

const logger = pino({ name: "camera-stream-hub" });

// ── Tunables ──────────────────────────────────────────────────────────────────

const MJPEG_BOUNDARY = "mjpegboundary";

// ffmpeg aborts a read/write that stalls this long (microseconds). Without it,
// reading an RTSP path with no publisher blocks forever and leaks the process.
const RW_TIMEOUT_US = 10_000_000; // 10s

// Tear a viewOnly hub down (or trigger a monitoring hub's reconnect) if no
// decodable frame arrives within this window.
const NO_DATA_TIMEOUT_MS = 15_000;

// Output framerate of the shared MJPEG feed (used by dashboard tiles / cards).
const STREAM_FPS = 12;

// Shared decode width. One ffmpeg feeds the display feed AND inference. YOLO
// resizes to ~640 internally, so matching it avoids inflating the gRPC payload
// and per-frame decode for zero model-accuracy gain.
const STREAM_MAX_WIDTH = 640;

// Keep a viewOnly hub alive this long after its last subscriber/poll leaves.
// Monitoring hubs never idle-teardown — they run for as long as the camera is
// active, independent of viewers.
const HUB_KEEPALIVE_MS = 5_000;

// How long a resolved capture context (mappings/rules/red zones/timezone) is
// reused before re-reading from the DB. Bounds staleness after a mapping edit
// without hitting Mongo on every capture cycle.
const CONTEXT_TTL_MS = 10_000;

// Throttle for the diagnostic capture-cycle latency log line.
const LATENCY_LOG_INTERVAL_MS = 5_000;

// Reconnect backoff for a monitoring hub whose ffmpeg died (RTSP hiccup, camera
// reboot, network blip). Retries forever — an always-on violation pipeline must
// self-heal, not go dark until a human happens to reopen a viewer.
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;

// Throttled Camera.status/lastCaptureAt/latestSnapshotUrl write. A plain Mongo
// update, not tied to inference cadence — cycles can run several times/sec.
const HEARTBEAT_INTERVAL_MS = 7_000;

// While a monitoring hub is down, log loudly for the first few attempts, then
// drop to a periodic "still down" heartbeat so an extended outage doesn't
// flood logs but stays visible.
const RECONNECT_LOUD_ATTEMPTS = 3;
const RECONNECT_LOG_REPEAT_MS = 10 * 60_000;

// ── Types ─────────────────────────────────────────────────────────────────────

type HubMode = "monitoring" | "viewOnly";

type Detection = {
  label: string;
  confidence: number;
  bbox: number[];
  attributes?: Record<string, string>;
};

// Latest capture-cycle result for a camera. Includes the exact frame analyzed
// (base64 JPEG) so the poll-fallback client can render frame + boxes together.
// `seq` increments per new result so a client can skip frames it already has.
type LiveResult = {
  seq: number;
  frame: string | null;
  width: number | null;
  height: number | null;
  detections: Detection[];
  checkResults: CheckResult[];
  violations: Violation[];
};

const EMPTY_RESULT: LiveResult = {
  seq: 0,
  frame: null,
  width: null,
  height: null,
  detections: [],
  checkResults: [],
  violations: []
};

const NO_CYCLE_DATA = { detections: [] as Detection[], checkResults: [] as CheckResult[], violations: [] as Violation[] };

// Wire shape returned by the poll endpoint. `monitored:false` means no
// monitoring hub exists for this camera (paused/inactive) — the caller should
// show that state rather than a stale/empty result.
export type LivePollResponse =
  | { seq: number; unchanged: true; monitored: true }
  | (LiveResult & { unchanged: false; monitored: true });

// Lightweight SSE payload — deliberately omits `frame`. The pixel stream
// already flows continuously over the MJPEG /stream endpoint; repeating the
// same JPEG bytes on every result would roughly double pixel cost for no
// benefit, since a client rendering both already has the frame from /stream.
export type LiveStreamResultPayload = Omit<LiveResult, "frame">;

type ActiveMapping = Awaited<ReturnType<typeof getActiveMappingsForCamera>>[number];

// Resolved once per CONTEXT_TTL_MS window and reused across capture cycles —
// avoids a Mongo round-trip on every cycle (which can run several times/sec).
type HubContext = {
  mappings: ActiveMapping[];
  rules?: CameraRules;
  redZones: Array<{ name: string; points: Array<{ x: number; y: number }> }>;
  cooldownPeriod: number;
  timezone: string;
  expiresAt: Date;
  latestUrl: string;
};

// A raw MJPEG stream client (dashboard tile, camera card, detail page video).
type Subscriber = {
  onFrame: (frame: Buffer) => void;
  onClose: () => void;
};

// An SSE detection-result subscriber (the unified live camera view).
type ResultSubscriber = {
  onResult: (payload: LiveStreamResultPayload) => void;
  onClose: () => void;
};

type Hub = {
  cameraId: string;
  rtspUrl: string;
  mode: HubMode;
  ffmpeg: ChildProcess;
  stopped: boolean; // true once permanently torn down (removed from the registry)

  // ── streaming ──
  latestFrame: Buffer | null;
  subscribers: Set<Subscriber>;
  watchdog: NodeJS.Timeout;
  teardownTimer: NodeJS.Timeout | null; // viewOnly idle-teardown only
  lastActivityAt: number;

  // ── capture cycle (monitoring only) ──
  latest: LiveResult;
  resultSubscribers: Set<ResultSubscriber>;
  captureRunning: boolean;
  lastLatencyLogAt: number;
  context: HubContext | null;
  contextAt: number;

  // ── reconnect (monitoring only) ──
  connected: boolean;
  reconnectTimer: NodeJS.Timeout | null;
  reconnectAttempts: number;
  downSince: number | null;
  lastReconnectLogAt: number;

  // ── status heartbeat (monitoring only) ──
  lastHeartbeatAt: number;
  lastKnownStatus: "online" | "offline" | null;
};

const hubs = new Map<string, Hub>();

// ── ffmpeg spawn + frame parsing ────────────────────────────────────────────

function spawnFfmpeg(rtspUrl: string): ChildProcess {
  // Low-latency decode: don't buffer the demuxer, and decode with minimal delay.
  // Cuts the lag between a real-world event and the frame reaching the client.
  const lowLatency = ["-fflags", "nobuffer", "-flags", "low_delay"];

  // -rtsp_transport / -timeout are RTSP-only; passing them for a local file
  // makes ffmpeg abort with "Option rtsp_transport not found". A file input is
  // instead looped at realtime pace so it behaves like a continuous live feed.
  // NOTE: it's -timeout (socket I/O timeout, µs) for the rtsp demuxer on ffmpeg
  // 5+; -rw_timeout / -stimeout are rejected as unknown and abort ffmpeg at start.
  const isRtsp = /^rtsps?:\/\//i.test(rtspUrl);
  const inputArgs = isRtsp
    ? [
        "-rtsp_transport", "tcp",
        "-timeout", String(RW_TIMEOUT_US),
        ...lowLatency,
        // Read straight from the socket without aio buffering, and probe the
        // stream minimally so playback starts (and stays) near real-time instead
        // of filling a multi-second analysis buffer first. If a specific camera
        // ever fails to be detected, raise -probesize (e.g. 500000).
        "-avioflags", "direct",
        "-probesize", "32",
        "-analyzeduration", "0"
      ]
    : ["-stream_loop", "-1", "-re", ...lowLatency];

  return spawn(
    "ffmpeg",
    [
      "-loglevel", "error",
      ...inputArgs,
      "-i", rtspUrl,
      "-an", // no audio — we never use it
      "-r", String(STREAM_FPS),
      "-vf", `scale='min(${STREAM_MAX_WIDTH},iw)':-2`,
      "-f", "mjpeg",
      "-q:v", "5",
      "-flush_packets", "1", // push each frame out immediately, don't batch
      "pipe:1"
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
}

// Wires stdout parsing + error/close handlers onto hub.ffmpeg. Split out from
// createHub so a reconnect can re-attach a freshly spawned process without
// duplicating the SOI/EOI parsing logic — each call gets its own fresh parse
// buffer, correctly discarding any partial frame left over from a dead process.
function attachFfmpegHandlers(hub: Hub): void {
  const SOI = Buffer.from([0xff, 0xd8]);
  const EOI = Buffer.from([0xff, 0xd9]);
  let buffer = Buffer.alloc(0);

  hub.ffmpeg.stdout!.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    let start = buffer.indexOf(SOI);
    while (start !== -1) {
      const end = buffer.indexOf(EOI, start + 2);
      if (end === -1) break; // incomplete frame — wait for more bytes
      const frame = buffer.slice(start, end + 2);
      buffer = buffer.slice(end + 2);
      onFrame(hub, frame);
      start = buffer.indexOf(SOI);
    }
  });

  hub.ffmpeg.on("error", () => handleFfmpegDown(hub, "ffmpeg error"));
  hub.ffmpeg.on("close", () => handleFfmpegDown(hub, "ffmpeg closed"));
}

// ── Hub lifecycle ─────────────────────────────────────────────────────────────

function createHub(cameraId: string, rtspUrl: string, mode: HubMode): Hub {
  const ffmpeg = spawnFfmpeg(rtspUrl);

  const hub: Hub = {
    cameraId,
    rtspUrl,
    mode,
    ffmpeg,
    stopped: false,
    latestFrame: null,
    subscribers: new Set(),
    watchdog: setTimeout(() => handleFfmpegDown(hub, "no data"), NO_DATA_TIMEOUT_MS),
    teardownTimer: null,
    lastActivityAt: Date.now(),
    latest: EMPTY_RESULT,
    resultSubscribers: new Set(),
    captureRunning: false,
    lastLatencyLogAt: 0,
    context: null,
    contextAt: 0,
    connected: true,
    reconnectTimer: null,
    reconnectAttempts: 0,
    downSince: null,
    lastReconnectLogAt: 0,
    lastHeartbeatAt: 0,
    lastKnownStatus: null
  };

  attachFfmpegHandlers(hub);

  hubs.set(cameraId, hub);
  if (mode === "viewOnly") scheduleIdleCheck(hub);
  logger.info({ cameraId, mode }, "Stream hub started");
  return hub;
}

function onFrame(hub: Hub, frame: Buffer): void {
  hub.latestFrame = frame;
  clearTimeout(hub.watchdog);
  hub.watchdog = setTimeout(() => handleFfmpegDown(hub, "no data"), NO_DATA_TIMEOUT_MS);
  for (const sub of hub.subscribers) sub.onFrame(frame);

  // Frame arrival IS the capture-cycle trigger: no fixed-interval timer at
  // all, so cadence is bounded only by (a) how fast the camera/ffmpeg actually
  // decodes new frames and (b) how long the previous cycle took — never an
  // artificial wait, and never re-analyzing a frame we've already processed.
  if (hub.mode === "monitoring" && !hub.stopped && !hub.captureRunning) {
    hub.captureRunning = true;
    runCaptureCycle(hub).finally(() => {
      hub.captureRunning = false;
    });
  }
}

// ffmpeg died (error/close) or stalled (watchdog). A viewOnly hub tears down
// permanently, exactly as before. A monitoring hub instead goes dark and
// reconnects with backoff — an always-on violation pipeline can't just stop.
function handleFfmpegDown(hub: Hub, reason: string): void {
  if (hub.stopped) return;
  if (hub.mode === "monitoring") {
    teardownHub(hub, reason, { permanent: false });
  } else {
    teardownHub(hub, reason, { permanent: true });
  }
}

function teardownHub(hub: Hub, reason: string, opts: { permanent: boolean }): void {
  if (hub.stopped) return;

  if (!opts.permanent) {
    // Non-permanent: kill ffmpeg and go dark, but keep the hub/subscribers/
    // registry entry alive so a brief hiccup doesn't force-disconnect every
    // /stream viewer, and so reconnecting can resume in place.
    clearTimeout(hub.watchdog);
    if (!hub.ffmpeg.killed) hub.ffmpeg.kill("SIGKILL");
    hub.latestFrame = null; // don't keep re-analyzing a stale buffered frame
    if (hub.connected) {
      hub.connected = false;
      hub.downSince = Date.now();
      void persistCaptureHeartbeat(hub, "offline");
    }
    scheduleReconnect(hub);
    return;
  }

  hub.stopped = true;
  clearTimeout(hub.watchdog);
  if (hub.teardownTimer) clearTimeout(hub.teardownTimer);
  if (hub.reconnectTimer) clearTimeout(hub.reconnectTimer);
  if (!hub.ffmpeg.killed) hub.ffmpeg.kill("SIGKILL");

  for (const sub of hub.subscribers) sub.onClose();
  hub.subscribers.clear();
  for (const sub of hub.resultSubscribers) sub.onClose();
  hub.resultSubscribers.clear();

  if (hubs.get(hub.cameraId) === hub) hubs.delete(hub.cameraId);
  logger.info({ cameraId: hub.cameraId, reason }, "Stream hub stopped");
}

function scheduleReconnect(hub: Hub): void {
  if (hub.stopped) return;
  const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** hub.reconnectAttempts);
  const jitter = backoff * (0.8 + Math.random() * 0.4); // ±20%, avoids a reconnect storm
  hub.reconnectAttempts++;
  logReconnectAttempt(hub);
  hub.reconnectTimer = setTimeout(() => {
    hub.reconnectTimer = null;
    if (hub.stopped) return;
    hub.ffmpeg = spawnFfmpeg(hub.rtspUrl);
    attachFfmpegHandlers(hub);
    hub.watchdog = setTimeout(() => handleFfmpegDown(hub, "no data"), NO_DATA_TIMEOUT_MS);
  }, jitter);
}

function logReconnectAttempt(hub: Hub): void {
  const now = Date.now();
  const loud = hub.reconnectAttempts <= RECONNECT_LOUD_ATTEMPTS;
  const heartbeatDue = now - hub.lastReconnectLogAt > RECONNECT_LOG_REPEAT_MS;
  if (!loud && !heartbeatDue) return;
  hub.lastReconnectLogAt = now;
  const downForMs = hub.downSince ? now - hub.downSince : 0;
  logger.warn({ cameraId: hub.cameraId, attempt: hub.reconnectAttempts, downForMs }, "Camera capture reconnecting");
  publishLog({
    level: "error",
    source: "system",
    msg: `Camera offline, reconnecting (attempt ${hub.reconnectAttempts}) → cameraId=${hub.cameraId}`,
    meta: { cameraId: hub.cameraId, attempt: hub.reconnectAttempts, downForMs }
  });
}

// Reuses an existing hub for this camera+URL if one is already running
// (monitoring or viewOnly — either can serve raw stream/snapshot readers),
// otherwise lazily creates one in viewOnly mode.
function acquireHub(cameraId: string, rtspUrl: string): Hub {
  let hub = hubs.get(cameraId);
  // A hub for a stale URL (camera edited) must not be reused.
  if (hub && hub.rtspUrl !== rtspUrl) {
    teardownHub(hub, "source changed", { permanent: true });
    hub = undefined;
  }
  if (!hub) hub = createHub(cameraId, rtspUrl, "viewOnly");
  hub.lastActivityAt = Date.now();
  return hub;
}

// Self-rearming idle check: a viewOnly hub lives while it has stream
// subscribers OR has been read within HUB_KEEPALIVE_MS; otherwise its ffmpeg
// is killed. Monitoring hubs never idle-teardown — they run for as long as
// the camera is active, independent of viewers.
function scheduleIdleCheck(hub: Hub): void {
  if (hub.mode !== "viewOnly") return;
  if (hub.stopped || hub.teardownTimer) return;
  hub.teardownTimer = setTimeout(() => {
    hub.teardownTimer = null;
    if (hub.stopped) return;
    if (hub.subscribers.size === 0 && Date.now() - hub.lastActivityAt >= HUB_KEEPALIVE_MS) {
      teardownHub(hub, "idle", { permanent: true });
    } else {
      scheduleIdleCheck(hub);
    }
  }, HUB_KEEPALIVE_MS);
}

// ── Public: stream endpoint (dashboard tiles / cards / detail page video) ─────

/**
 * Streams a camera's shared MJPEG feed to an HTTP response. All viewers of the
 * same camera share one ffmpeg; for a monitored camera that's the always-on
 * monitoring hub, otherwise one is spawned on first viewer and killed shortly
 * after the last one disconnects.
 */
export function attachMjpegResponse(res: Response, cameraId: string, rtspUrl: string): void {
  res.setHeader("Content-Type", `multipart/x-mixed-replace;boundary=${MJPEG_BOUNDARY}`);
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "close");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const hub = acquireHub(cameraId, rtspUrl);

  let closed = false;
  const cleanup = (): void => {
    if (closed) return;
    closed = true;
    hub.subscribers.delete(sub);
    if (!res.writableEnded) res.end();
    hub.lastActivityAt = Date.now();
    scheduleIdleCheck(hub);
  };

  const sub: Subscriber = {
    onFrame: (frame) => {
      // Drop frames for a slow or finished client rather than buffering — this
      // is a live feed, so a stale frame has no value.
      if (res.writableEnded || res.writableNeedDrain) return;
      res.write(
        `--${MJPEG_BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`
      );
      res.write(frame);
      res.write("\r\n");
    },
    onClose: cleanup
  };

  hub.subscribers.add(sub);
  if (hub.latestFrame) sub.onFrame(hub.latestFrame); // show something immediately
  res.on("close", cleanup);
}

// ── Public: latest-frame accessor (grid snapshot polling) ─────────────────────

/**
 * Returns a camera's most recent decoded frame from the shared ffmpeg, joining
 * the monitoring hub if one exists or lazily creating a viewOnly one otherwise.
 * One ffmpeg is shared by all viewers; polling this is a cheap memory read (no
 * per-request ffmpeg spawn). Returns null only while the hub is still warming
 * up (no frame decoded yet), so the caller can fall back to a one-shot capture.
 */
export function getLiveFrame(cameraId: string, rtspUrl: string): Buffer | null {
  const hub = acquireHub(cameraId, rtspUrl);
  hub.lastActivityAt = Date.now();
  scheduleIdleCheck(hub); // no-op for a monitoring hub
  return hub.latestFrame;
}

// ── Public: live-detect poll endpoint (fallback transport for the live view) ──

/**
 * Returns the latest capture-cycle result for a camera — detections, checks,
 * violations, and the exact analyzed frame. Cheap: it does NOT capture or
 * infer on the request path, it reads the cache the monitoring hub's capture
 * cycle already fills. Returns null if no monitoring hub exists (camera is
 * paused/inactive) — the caller should surface that rather than an ad-hoc
 * inference loop for a camera an operator deliberately paused. `since` is the
 * client's last-seen seq; an unchanged result skips re-sending the frame.
 */
export function pollLiveDetections(cameraId: string, since: number): LivePollResponse | null {
  const hub = hubs.get(cameraId);
  if (!hub || hub.mode !== "monitoring") return null;
  const latest = hub.latest;
  if (latest.seq === since) return { seq: latest.seq, unchanged: true, monitored: true };
  return { ...latest, unchanged: false, monitored: true };
}

// ── Public: live-stream SSE endpoint (unified live camera view) ───────────────

/**
 * Attaches an SSE response that pushes every new capture-cycle result for a
 * camera (no `frame` field — pixels already flow continuously over /stream).
 * Only works against a monitoring hub; if the camera isn't currently
 * monitored, sends a `not_monitored` event instead of hanging in "connecting."
 * Coalesces to latest per subscriber (skips a write while the previous one
 * hasn't drained) rather than buffering a backlog for a slow client — the
 * same principle attachMjpegResponse already applies to MJPEG viewers.
 */
export function attachLiveResultStream(res: Response, cameraId: string): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const hub = hubs.get(cameraId);
  if (!hub || hub.mode !== "monitoring") {
    res.write(`event: not_monitored\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
  } else if (hub.latest.seq > 0) {
    const { frame: _frame, ...payload } = hub.latest;
    res.write(`event: result\ndata: ${JSON.stringify(payload)}\n\n`);
  }

  const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 25_000);

  const sub: ResultSubscriber = {
    onResult: (payload) => {
      if (res.writableEnded || res.writableNeedDrain) return;
      res.write(`event: result\ndata: ${JSON.stringify(payload)}\n\n`);
    },
    onClose: () => {
      if (!res.writableEnded) res.write(`event: not_monitored\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    }
  };

  hub?.mode === "monitoring" && hub.resultSubscribers.add(sub);

  const cleanup = (): void => {
    clearInterval(heartbeat);
    hub?.resultSubscribers.delete(sub);
  };
  res.on("close", cleanup);
}

// ── Device-camera live broadcast ───────────────────────────────────────────────
// Device-sourced cameras have no continuous ffmpeg decode / hub — a frame only
// exists at the moment the browser pushes one (POST /push-frame). This is a
// lightweight, hub-free parallel to attachLiveResultStream/broadcastResult
// above: the controller calls broadcastDeviceResult() once per push with the
// same merged detections/checks/violations shape, fed to whichever SSE
// subscribers are currently attached to that camera.

const deviceResultSubscribers = new Map<string, Set<ResultSubscriber>>();
const deviceSeq = new Map<string, number>();

/** SSE endpoint for a device-sourced camera's live detection channel. */
export function attachDeviceLiveResultStream(res: Response, cameraId: string): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

  const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 25_000);

  const sub: ResultSubscriber = {
    onResult: (payload) => {
      if (res.writableEnded || res.writableNeedDrain) return;
      res.write(`event: result\ndata: ${JSON.stringify(payload)}\n\n`);
    },
    onClose: () => {
      // No hub to go dark — device pushes just resume whenever the browser
      // sends the next frame, so there's nothing to signal here.
    }
  };

  let set = deviceResultSubscribers.get(cameraId);
  if (!set) {
    set = new Set();
    deviceResultSubscribers.set(cameraId, set);
  }
  set.add(sub);

  const cleanup = (): void => {
    clearInterval(heartbeat);
    const s = deviceResultSubscribers.get(cameraId);
    s?.delete(sub);
    if (s && s.size === 0) deviceResultSubscribers.delete(cameraId);
  };
  res.on("close", cleanup);
}

/** Called once per push-frame with the merged per-mapping result. */
export function broadcastDeviceResult(
  cameraId: string,
  data: { width: number | null; height: number | null; detections: Detection[]; checkResults: CheckResult[]; violations: Violation[] }
): void {
  const subs = deviceResultSubscribers.get(cameraId);
  if (!subs || subs.size === 0) return;
  const seq = (deviceSeq.get(cameraId) ?? 0) + 1;
  deviceSeq.set(cameraId, seq);
  const payload: LiveStreamResultPayload = { seq, ...data };
  for (const sub of subs) sub.onResult(payload);
}

// ── Capture cycle (monitoring only) ────────────────────────────────────────────

/**
 * Resolves which mappings/rules/red zones/timezone to run for a camera,
 * cached per hub for CONTEXT_TTL_MS so a cycle that can run several times/sec
 * isn't a Mongo round-trip every time. Per-mapping ROI/checks/thresholds are
 * NOT resolved here — runMappingInference reads them straight off each
 * mapping document, so this context only needs the camera-level pieces.
 */
async function resolveHubContext(hub: Hub): Promise<HubContext> {
  if (hub.context && Date.now() - hub.contextAt < CONTEXT_TTL_MS) return hub.context;

  const [camera, mappings, settings] = await Promise.all([
    getCameraById(hub.cameraId),
    getActiveMappingsForCamera(hub.cameraId),
    getSettings()
  ]);

  const retentionDays = settings.retention?.dataDays ?? 30;
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1_000);
  const timezone = (settings.get?.("timezone") as string | undefined) ?? "Asia/Jakarta";
  const rules: CameraRules | undefined =
    camera?.crowdThreshold != null ? { crowd_threshold: camera.crowdThreshold } : undefined;
  const redZones = (camera?.redZones ?? []) as Array<{ name: string; points: Array<{ x: number; y: number }> }>;
  const cooldownPeriod = camera?.cooldownPeriod ?? 0;
  const latestUrl = camera?.latestSnapshotUrl ?? "";

  const context: HubContext = { mappings, rules, redZones, cooldownPeriod, timezone, expiresAt, latestUrl };
  hub.context = context;
  hub.contextAt = Date.now();
  return context;
}

async function runCaptureCycle(hub: Hub): Promise<void> {
  const frame = hub.latestFrame;
  if (!frame || hub.stopped) return;

  const size = readJpegSize(frame);
  const base = { width: size?.width ?? null, height: size?.height ?? null };

  let ctx: HubContext;
  try {
    ctx = await resolveHubContext(hub);
  } catch (err) {
    logger.warn(
      { cameraId: hub.cameraId, err: err instanceof Error ? err.message : String(err) },
      "Failed to resolve capture context"
    );
    return;
  }
  if (hub.stopped) return;

  let cycleData: typeof NO_CYCLE_DATA = NO_CYCLE_DATA;
  if (ctx.mappings.length > 0) {
    const t0 = Date.now();
    // One inferViaGrpc call per active mapping — NOT merged into one call —
    // because notificationWorker resolves which PICs to email via mappingId,
    // so merging mappings here would break PIC-targeted notification and lose
    // per-mapping ROI/rule attribution. Mirrors the pre-existing snapshot
    // worker's fan-out shape exactly.
    const results = await Promise.allSettled(
      ctx.mappings.map((mapping) =>
        runMappingInference({
          cameraId: hub.cameraId,
          frameBuffer: frame,
          latestUrl: ctx.latestUrl,
          mapping,
          timezone: ctx.timezone,
          expiresAt: ctx.expiresAt,
          rules: ctx.rules,
          redZones: ctx.redZones,
          cooldownPeriod: ctx.cooldownPeriod
        })
      )
    );
    if (hub.stopped) return;

    const detections: Detection[] = [];
    const checkResults: CheckResult[] = [];
    const violations: Violation[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        detections.push(...r.value.detections);
        checkResults.push(...r.value.checkResults);
        violations.push(...r.value.violations);
      }
    }
    cycleData = { detections, checkResults, violations };

    const now = Date.now();
    if (now - hub.lastLatencyLogAt > LATENCY_LOG_INTERVAL_MS) {
      hub.lastLatencyLogAt = now;
      logger.info(
        { cameraId: hub.cameraId, mappings: ctx.mappings.length, roundTripMs: now - t0 },
        "Capture cycle latency"
      );
    }
  }

  hub.latest = {
    seq: hub.latest.seq + 1,
    frame: frame.toString("base64"),
    ...base,
    ...cycleData
  };
  broadcastResult(hub);
  void persistCaptureHeartbeat(hub, "online");
}

function broadcastResult(hub: Hub): void {
  if (hub.resultSubscribers.size === 0) return;
  const { frame: _frame, ...payload } = hub.latest;
  for (const sub of hub.resultSubscribers) sub.onResult(payload);
}

/**
 * Takes over the Camera.status/lastCaptureAt/latestSnapshotUrl write that used
 * to belong to the snapshot worker — throttled to HEARTBEAT_INTERVAL_MS (or
 * immediate on an online↔offline transition) since it's a plain Mongo write,
 * not something that needs sub-second freshness. Strictly about *capture*
 * health (ffmpeg/RTSP) — AI-service health is a separate existing signal.
 */
async function persistCaptureHeartbeat(hub: Hub, status: "online" | "offline"): Promise<void> {
  const now = Date.now();
  const transitioned = hub.lastKnownStatus !== status;
  if (!transitioned && now - hub.lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
  hub.lastHeartbeatAt = now;
  hub.lastKnownStatus = status;

  try {
    const update: Record<string, unknown> = { status };
    if (status === "online") {
      update.lastCaptureAt = new Date();
      if (hub.latestFrame) {
        const { publicUrl } = await saveLatestSnapshot(hub.cameraId, hub.latestFrame);
        update.latestSnapshotUrl = publicUrl;
      }
    }
    await CameraModel.findByIdAndUpdate(hub.cameraId, update);
  } catch (err) {
    logger.warn(
      { cameraId: hub.cameraId, err: err instanceof Error ? err.message : String(err) },
      "Capture heartbeat write failed"
    );
  }
}

// ── Public: monitoring lifecycle ───────────────────────────────────────────────

/** Boot-time: starts an always-on monitoring hub for every active RTSP camera. */
export async function initCaptureHubs(): Promise<void> {
  logger.info("Initialising camera capture hubs...");
  const activeCameras = await CameraModel.find(
    { isActive: true, sourceType: { $ne: "device" } },
    "rtspUrl"
  );
  let started = 0;
  for (const camera of activeCameras) {
    if (!camera.rtspUrl) continue;
    startMonitoringHub(camera._id.toString(), camera.rtspUrl);
    started++;
  }
  logger.info({ count: started }, "Capture hubs initialised");
}

/**
 * Starts (or restarts, if the RTSP URL changed) always-on monitoring for a
 * camera: continuous capture, per-mapping inference, evidence/notification
 * persistence on violation, and auto-reconnect on ffmpeg death. Idempotent —
 * calling it again with the same URL while already monitoring is a no-op.
 */
export function startMonitoringHub(cameraId: string, rtspUrl: string): void {
  const existing = hubs.get(cameraId);
  if (existing && existing.mode === "monitoring" && existing.rtspUrl === rtspUrl) return;
  if (existing) {
    teardownHub(existing, existing.mode === "viewOnly" ? "promoting to monitoring" : "source changed", {
      permanent: true
    });
  }
  createHub(cameraId, rtspUrl, "monitoring");
}

/** Stops always-on monitoring for a camera (pause, deactivate, delete). */
export function stopMonitoringHub(cameraId: string): void {
  const hub = hubs.get(cameraId);
  if (hub && hub.mode === "monitoring") {
    teardownHub(hub, "monitoring stopped", { permanent: true });
  }
}

/** System-health reporting: how many cameras are monitored / reconnecting. */
export function getCaptureHubsSnapshot(): {
  monitoring: number;
  reconnecting: number;
  longestDownMs: number | null;
} {
  let monitoring = 0;
  let reconnecting = 0;
  let longestDownMs: number | null = null;
  for (const hub of hubs.values()) {
    if (hub.mode !== "monitoring") continue;
    monitoring++;
    if (!hub.connected) {
      reconnecting++;
      const downMs = hub.downSince ? Date.now() - hub.downSince : 0;
      if (longestDownMs === null || downMs > longestDownMs) longestDownMs = downMs;
    }
  }
  return { monitoring, reconnecting, longestDownMs };
}

// ── Shutdown ──────────────────────────────────────────────────────────────────

/** Kills every active hub's ffmpeg. Call on process shutdown. */
export function shutdownAllHubs(): void {
  for (const hub of [...hubs.values()]) teardownHub(hub, "shutdown", { permanent: true });
}
