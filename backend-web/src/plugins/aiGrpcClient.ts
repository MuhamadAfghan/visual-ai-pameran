import path from "node:path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { env } from "../config/env";

// ── Types matching proto/ai/v1/inference.proto ────────────────────────────────

export type Thresholds = {
  conf: number;
  iou: number;
};

export type CameraRules = {
  crowd_threshold?: number;
};

// Normalized [0,1] coordinate relative to the frame.
export type Point = {
  x: number;
  y: number;
};

// One handrail line (matches proto `Polyline`). Wrapper because proto has no
// repeated-of-repeated; used for handrail_lines (rails on multiple stair sides).
export type Polyline = {
  points: Point[];
};

export type RedZone = {
  name: string;
  points: Point[];
};

export type InferRequest = {
  camera_id: string;
  frame_id: string;
  timestamp_utc: string;
  image_uri?: string;
  image_base64?: string;
  selected_checks: string[];
  thresholds?: Thresholds;
  rules?: CameraRules;
  metadata_json?: string;
  roi_polygon?: Point[];
  stairs_zone?: Point[];
  handrail_lines?: Polyline[];
  red_zones?: RedZone[];
};

export type Keypoint = {
  x: number;
  y: number;
  score: number;
};

export type Detection = {
  id: number;
  track_id?: number;
  label: string;
  confidence: number;
  bbox: number[];
  keypoints: Keypoint[];
  attributes: Record<string, string>;
};

export type CheckDetails = {
  source_labels: string[];
  breakdown: Record<string, number>;
};

export type CheckResult = {
  check: string;
  value: number;
  confidence: number;
  details: CheckDetails;
};

export type Violation = {
  type: string;
  severity: string;
  score: number;
  track_id?: number;
  details_json: string;
};

export type InferResponse = {
  camera_id: string;
  frame_id: string;
  timestamp_utc: string;
  latency_ms: number;
  model_tasks_executed: string[];
  detections: Detection[];
  check_results: CheckResult[];
  violations: Violation[];
  meta_json: string;
};

// ── Violation → Check mapping ─────────────────────────────────────────────────
// Single source of truth untuk link violation back ke check yang men-trigger-nya.
// Tambah entry kalau AI tambah violation type baru. Lihat
// `ai/docs/api_reference.md#daftar-tipe-violation` (source: AI registry).

export const VIOLATION_TO_CHECK: Record<string, string> = {
  crowd_exceeded: "person_count",
  red_zone_intrusion: "red_zone_count",
  hand_in_pocket_violation: "hand_in_pocket_count",
  holding_phone_violation: "holding_phone_count",
  handrail_violation: "handrail_count",
  // PPE compliance — per-APD, zero-tolerance (fire saat ada deteksi `no_*`).
  // Pakai penamaan `no_*` karena itu yang di-emit AI service (ai/.../infer.py).
  no_mask_violation: "mask_count",
  no_helmet_violation: "helmet_count",
  no_vest_violation: "vest_count",
  no_goggles_violation: "goggles_count",
  no_gloves_violation: "gloves_count",
  // Fall detection (dari origin/main). AI saat ini belum emit ini; disiapkan.
  fall_detected_violation: "fall_detected_count",
};

export function checkForViolation(violationType: string): string | undefined {
  return VIOLATION_TO_CHECK[violationType];
}

// ── gRPC client setup ─────────────────────────────────────────────────────────

type InferenceClient = grpc.Client & {
  Infer(
    req: InferRequest,
    callback: (err: grpc.ServiceError | null, res: InferResponse) => void
  ): void;
  Infer(
    req: InferRequest,
    options: grpc.CallOptions,
    callback: (err: grpc.ServiceError | null, res: InferResponse) => void
  ): void;
  Health(
    req: Record<string, never>,
    callback: (err: grpc.ServiceError | null, res: { status: string }) => void
  ): void;
};

const protoPath = path.resolve(__dirname, "../../proto/ai/v1/inference.proto");
const packageDefinition = protoLoader.loadSync(protoPath, {
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  keepCase: true
});

const grpcObject = grpc.loadPackageDefinition(packageDefinition) as any;
const InferenceService = grpcObject.ai.v1.InferenceService;

// Channel options — keepalive ensures the connection is probed periodically
// so a restarted AI service is detected quickly without a backend-web restart.
const _32MB = 32 * 1024 * 1024;

const CHANNEL_OPTIONS: grpc.ChannelOptions = {
  // Only ping during active calls — pinging without calls causes grpcio servers
  // to send GOAWAY (ENHANCE_YOUR_CALM) and reset the connection.
  "grpc.keepalive_time_ms": 30_000,
  "grpc.keepalive_timeout_ms": 5_000,
  "grpc.enable_retries": 1,
  "grpc.initial_reconnect_backoff_ms": 500,
  "grpc.max_reconnect_backoff_ms": 10_000,
  "grpc.max_send_message_length": _32MB,
  "grpc.max_receive_message_length": _32MB,
};

const DEFAULT_DEADLINE_MS = 30_000;

export function withDeadline(ms = DEFAULT_DEADLINE_MS): grpc.CallOptions {
  return { deadline: new Date(Date.now() + ms) };
}

function createClient(): InferenceClient {
  return new InferenceService(
    env.AI_GRPC_TARGET,
    grpc.credentials.createInsecure(),
    CHANNEL_OPTIONS
  );
}

const client: InferenceClient = createClient();

// ── Global concurrency safeguard ────────────────────────────────────────────
// Every caller (monitoring hubs, device push, the legacy ad-hoc job queue)
// goes through inferViaGrpc, so gating it here protects the AI service from
// all of them at once without touching any call site. A slot that doesn't
// free up in time fails fast with a distinguishable error instead of queuing
// unboundedly — the hub loop treats that as expected back-pressure, not a hard
// failure, and just skips that cycle.

export class AiBackpressureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBackpressureError";
  }
}

class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    this.available = max;
  }

  acquire(timeoutMs: number): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
      return Promise.resolve(() => this.release());
    }
    return new Promise((resolve, reject) => {
      const onGranted = (): void => {
        clearTimeout(timer);
        this.available--;
        resolve(() => this.release());
      };
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(onGranted);
        if (idx !== -1) this.waiters.splice(idx, 1);
        reject(new AiBackpressureError(`AI inference slot wait timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      this.waiters.push(onGranted);
    });
  }

  private release(): void {
    this.available++;
    const next = this.waiters.shift();
    if (next) next();
  }
}

const inferSemaphore = new Semaphore(env.AI_INFER_MAX_CONCURRENCY);

// ── Retry logic ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

const RETRYABLE_CODES = new Set([
  grpc.status.UNAVAILABLE,
  grpc.status.INTERNAL
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function callOnce(req: InferRequest): Promise<InferResponse> {
  return new Promise((resolve, reject) => {
    // A deadline is mandatory: without it, an in-flight call whose channel is
    // closed underneath it (e.g. a concurrent caller's retry runs client.close())
    // never fires its callback, hanging the caller forever. With it, the call
    // fails with DEADLINE_EXCEEDED and the caller can recover instead of wedging.
    client.Infer(req, withDeadline(), (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export async function inferViaGrpc(req: InferRequest): Promise<InferResponse> {
  // The AI validates ROI points as normalized [0,1] (Pydantic ge=0/le=1). The
  // frontend ROI editor can land a point a hair out of range (e.g. x=-0.0009 at
  // a frame edge), which makes the AI reject EVERY request for that camera with
  // INVALID_ARGUMENT — silently breaking the live tab and snapshot worker. Clamp
  // defensively here, the single boundary to the AI, so bad stored ROI still works.
  const clampPoint = (p: Point): Point => ({
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y))
  });
  if (req.roi_polygon?.length) {
    req = { ...req, roi_polygon: req.roi_polygon.map(clampPoint) };
  }
  if (req.stairs_zone?.length) {
    req = { ...req, stairs_zone: req.stairs_zone.map(clampPoint) };
  }
  if (req.handrail_lines?.length) {
    req = {
      ...req,
      handrail_lines: req.handrail_lines.map((line) => ({
        points: (line.points ?? []).map(clampPoint)
      }))
    };
  }

  // Held for the whole retry loop below (including its backoff sleeps), then
  // released once — an in-progress attempt legitimately still owns its slot.
  const release = await inferSemaphore.acquire(env.AI_INFER_SLOT_WAIT_TIMEOUT_MS);
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await callOnce(req);
      } catch (err) {
        const code = (err as grpc.ServiceError)?.code;
        if (RETRYABLE_CODES.has(code) && attempt < MAX_RETRIES) {
          // Don't close the shared client here: concurrent callers (the
          // monitoring hubs, device push, and the legacy job queue) share this
          // one client, and closing the channel out from under their in-flight
          // calls makes those calls hang forever. grpc-js reconnects the
          // channel automatically on the next call.
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw err;
      }
    }
    // Unreachable — loop always returns or throws, but satisfies TS
    throw new Error("inferViaGrpc: unexpected exit");
  } finally {
    release();
  }
}

export function pingAi(): Promise<string> {
  return new Promise((resolve, reject) => {
    client.Health({}, (err, res) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(res.status);
    });
  });
}
