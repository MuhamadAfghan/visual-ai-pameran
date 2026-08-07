import fs from "node:fs";
import path from "node:path";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import {
  assertSectionExists,
  createCamera,
  deleteCamera,
  generateCameraCode,
  getCameraById,
  listCameras,
  updateCamera,
  updateCameraStatus
} from "../services/camera.service";
import { sendSuccess } from "../utils/apiResponse";
import { logAuditEvent } from "../services/audit.service";
import { captureRtspFrame } from "../utils/rtspCapture";
import {
  attachMjpegResponse,
  attachLiveResultStream,
  attachDeviceLiveResultStream,
  broadcastDeviceResult,
  pollLiveDetections,
  getLiveFrame,
  startMonitoringHub,
  stopMonitoringHub
} from "../plugins/cameraStreamHub";
import { env } from "../config/env";
import { CameraModel } from "../models/camera.model";
import { saveLatestSnapshot } from "../plugins/storage";
import { processFrameForCamera } from "../services/framePipeline.service";
import { idParamSchema } from "../utils/validation";

const cameraListQuerySchema = z.object({
  sectionId: z.string().optional(),
  status: z.enum(["online", "offline", "maintenance"]).optional(),
  isActive: z.string().optional().transform((v) => v === undefined ? undefined : v === "true")
});

const cameraBaseObject = z.object({
  code: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1),
  sourceType: z.enum(["rtsp", "device"]).optional().default("rtsp"),
  rtspUrl: z.string().trim().optional(),
  sectionId: z.string().min(1),
  brand: z.string().trim().optional().default(""),
  minCaptureGapSeconds: z.number().int().min(0).optional().default(0),
  cooldownPeriod: z.number().int().positive().optional().default(300),
  crowdThreshold: z.number().int().min(0).nullable().optional().default(null),
  defaultPicIds: z.array(z.string().min(1)).min(1, "Kamera wajib punya minimal 1 PIC"),
  notes: z.string().trim().optional().default(""),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  redZones: z.array(z.object({
    name: z.string(),
    points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }))
  })).optional().default([])
});

function refineRtspUrl(
  data: { sourceType?: string; rtspUrl?: string },
  ctx: z.RefinementCtx
) {
  if (data.sourceType === "rtsp" && !data.rtspUrl?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "RTSP URL wajib diisi",
      path: ["rtspUrl"]
    });
  }
}

const cameraPayloadSchema = cameraBaseObject.superRefine(refineRtspUrl);
const cameraUpdateSchema = cameraBaseObject.partial().superRefine(refineRtspUrl);

export async function listCamerasController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = cameraListQuerySchema.parse(req.query);
    if (req.user?.role === "pic") {
      if (!req.user.picId) { sendSuccess(res, []); return; }
      (filters as Record<string, unknown>).picId = req.user.picId;
    }
    const data = await listCameras(filters);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getCameraByIdController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getCameraById(id);
    if (!data) throw new HttpError(404, "Camera not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function suggestCameraCodeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sectionId } = z.object({ sectionId: z.string().min(1) }).parse(req.query);
    const code = await generateCameraCode(sectionId);
    sendSuccess(res, { code });
  } catch (error) {
    next(error);
  }
}

export async function createCameraController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = cameraPayloadSchema.parse(req.body);
    await assertSectionExists(payload.sectionId);
    if (!payload.code) {
      payload.code = await generateCameraCode(payload.sectionId);
    }
    const data = await createCamera(payload as typeof payload & { code: string });
    if (data.isActive && data.sourceType !== "device" && data.rtspUrl) {
      startMonitoringHub(data._id.toString(), data.rtspUrl);
    }
    sendSuccess(res, data, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateCameraController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = cameraUpdateSchema.parse(req.body);
    const before = await getCameraById(id);
    if (!before) throw new HttpError(404, "Camera not found");

    if (payload.sectionId) await assertSectionExists(payload.sectionId);
    const data = await updateCamera(id, payload);
    if (!data) throw new HttpError(404, "Camera not found");

    const wasActive = before.isActive;
    const isNowActive = data.isActive;
    const rtspUrlChanged = payload.rtspUrl !== undefined && payload.rtspUrl !== before.rtspUrl;

    const isDevice = data.sourceType === "device";
    if (!wasActive && isNowActive && !isDevice && data.rtspUrl) {
      startMonitoringHub(id, data.rtspUrl);
    } else if (wasActive && !isNowActive) {
      stopMonitoringHub(id);
    } else if (isNowActive && rtspUrlChanged && !isDevice && data.rtspUrl) {
      startMonitoringHub(id, data.rtspUrl); // restarts against the new source (self-healing via acquireHub)
    }

    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function deleteCameraController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    stopMonitoringHub(id);
    const data = await deleteCamera(id);
    if (!data) throw new HttpError(404, "Camera not found");
    logAuditEvent({
      actorUserId: req.user!.id,
      actorEmail: req.user!.email,
      action: "camera.delete",
      targetType: "Camera",
      targetId: id,
      ipAddress: req.ip,
      metadata: { name: (data as { name?: string }).name, code: (data as { code?: string }).code }
    }).catch(() => {});
    sendSuccess(res, { message: "Camera deleted" });
  } catch (error) {
    next(error);
  }
}

export async function startCameraSchedulerController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const camera = await getCameraById(id);
    if (!camera) throw new HttpError(404, "Camera not found");
    if (!camera.isActive) throw new HttpError(400, "Camera is inactive");
    if (camera.sourceType === "device") throw new HttpError(400, "Kamera device tidak menggunakan scheduler server-side");
    if (!camera.rtspUrl) throw new HttpError(400, "Camera has no RTSP URL");
    startMonitoringHub(id, camera.rtspUrl);
    sendSuccess(res, { message: "Scheduler started" });
  } catch (error) {
    next(error);
  }
}

export async function stopCameraSchedulerController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    stopMonitoringHub(id);
    sendSuccess(res, { message: "Scheduler stopped" });
  } catch (error) {
    next(error);
  }
}

export async function testCameraConnectionController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const camera = await getCameraById(id);
    if (!camera) throw new HttpError(404, "Camera not found");

    if (camera.sourceType === "device") {
      sendSuccess(res, { online: true, message: "Kamera device diakses langsung dari browser" });
      return;
    }

    try {
      const frame = await captureRtspFrame(camera.rtspUrl!);
      const snapshotBase64 = frame.toString("base64");
      await updateCameraStatus(camera._id.toString(), "online");
      sendSuccess(res, { online: true, message: "Connection successful", snapshotBase64 });
    } catch (err) {
      await updateCameraStatus(camera._id.toString(), "offline");
      // Return 200 with online:false — test result, not a server error
      sendSuccess(res, {
        online: false,
        message: err instanceof Error ? err.message : "Connection failed"
      });
    }
  } catch (error) {
    next(error);
  }
}

export async function getCameraStreamController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const camera = await getCameraById(id);
    if (!camera) throw new HttpError(404, "Camera not found");
    if (!camera.rtspUrl) throw new HttpError(400, "Camera has no RTSP URL");
    // Joins the camera's shared ffmpeg via the stream hub — one decoder per
    // camera fans out to every viewer instead of spawning ffmpeg per client.
    attachMjpegResponse(res, id, camera.rtspUrl);
  } catch (error) {
    next(error);
  }
}

// Live tab feed (poll fallback, used when the SSE /live-stream channel can't
// connect): returns the exact frame that was analyzed plus its detections, so
// the client renders frame + boxes together. Cheap by design — it reads the
// cache the monitoring hub's own capture cycle already fills, WITHOUT
// capturing or inferring on the request path. `since` is the client's
// last-seen seq; an unchanged result skips re-sending the frame. Returns
// monitored:false (no lazy hub creation) if the camera isn't actively
// monitored — e.g. paused/inactive — rather than starting an ad-hoc inference
// loop for a camera an operator deliberately paused.
export async function getCameraLiveDetectController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const since = Number.parseInt(String(req.query.since ?? ""), 10) || 0;
    const result = pollLiveDetections(id, since);
    sendSuccess(res, result ?? { seq: 0, unchanged: false, monitored: false });
  } catch (error) {
    next(error);
  }
}

// Unified live view's primary transport: an SSE stream of capture-cycle
// results (detections/checks/violations, no image bytes — pixels come from
// GET /:id/stream). Device-sourced cameras have no continuous ffmpeg decode
// to broadcast from, so they're explicitly unsupported here; the frontend
// falls back to the poll-based live-detect/latestEvents path for them.
export async function getCameraLiveStreamController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const camera = await getCameraById(id);
    if (!camera) throw new HttpError(404, "Camera not found");
    if (camera.sourceType === "device") {
      // No continuous ffmpeg decode to key off of — broadcastDeviceResult()
      // fires this channel once per POST /push-frame instead.
      attachDeviceLiveResultStream(res, id);
    } else {
      attachLiveResultStream(res, id);
    }
  } catch (error) {
    next(error);
  }
}

export async function getCameraSnapshotController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const camera = await getCameraById(id);
    if (!camera) throw new HttpError(404, "Camera not found");

    // Serve a LIVE frame WITHOUT detection so the grid actually moves. The grid
    // polls this fast (~1s); each poll is a cheap read of the latest frame from
    // the shared per-camera ffmpeg decoder (cameraStreamHub) — one decoder feeds
    // every viewer, and the inference loop is NOT started, so no YOLO/gRPC/events.
    // No snapshot worker or detection scheduler is involved.
    // Skip live decode/capture entirely when the scheduler is off (Dimatikan) —
    // there's no decoder to read from, and a one-shot capture would block on a
    // ~15s ffmpeg timeout for no reason. Fall straight to the last saved snapshot.
    if (camera.rtspUrl && camera.isActive) {
      // 1. Shared live decoder — instant cached frame once warm.
      const liveFrame = getLiveFrame(id, camera.rtspUrl);
      if (liveFrame) {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-store"); // always serve the latest frame
        res.end(liveFrame);
        return;
      }
      // 2. Hub still warming (no frame decoded yet) — one-shot capture so the
      //    very first poll isn't blank. Same plain ffmpeg grab as Test connection.
      try {
        const frame = await captureRtspFrame(camera.rtspUrl);
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "no-store");
        res.end(frame);
        return;
      } catch {
        // Live capture failed (camera unreachable) — fall through to last saved file.
      }
    }

    if (!camera.latestSnapshotUrl) throw new HttpError(404, "No snapshot available");

    // If URL points to local storage, serve the file directly
    const storageBase = env.STORAGE_BASE_URL;
    if (camera.latestSnapshotUrl.startsWith(storageBase)) {
      const relPath = camera.latestSnapshotUrl.slice(storageBase.length).replace(/^\//, "");
      const absPath = path.resolve(env.STORAGE_BASE_PATH, relPath);
      if (!fs.existsSync(absPath)) throw new HttpError(404, "Snapshot file not found");
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=30");
      // Buffered readFile (not createReadStream.pipe): opens/closes the fd quickly
      // and surfaces errors as a catchable rejection. An unhandled stream 'error'
      // (e.g. EMFILE — too many open files) would otherwise crash the whole process.
      res.end(await fs.promises.readFile(absPath));
      return;
    }

    // External URL — redirect
    res.redirect(302, camera.latestSnapshotUrl);
  } catch (error) {
    next(error);
  }
}

const pushFrameSchema = z.object({ imageBase64: z.string().min(1) });

export async function pushFrameController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { imageBase64 } = pushFrameSchema.parse(req.body);

    const camera = await getCameraById(id);
    if (!camera) throw new HttpError(404, "Camera not found");
    if ((camera as { sourceType?: string }).sourceType !== "device") {
      throw new HttpError(400, "Endpoint hanya untuk kamera dengan sourceType device");
    }

    const frameBuffer = Buffer.from(imageBase64, "base64");

    const { publicUrl: latestUrl } = await saveLatestSnapshot(id, frameBuffer);
    await CameraModel.findByIdAndUpdate(id, {
      status: "online",
      lastCaptureAt: new Date(),
      latestSnapshotUrl: latestUrl
    });

    const result = await processFrameForCamera(id, frameBuffer, latestUrl);
    broadcastDeviceResult(id, {
      width: null,
      height: null,
      detections: result.detections,
      checkResults: result.checkResults,
      violations: result.violations
    });
    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

const testUrlSchema = z.object({ rtspUrl: z.string().min(1) });

export async function testCameraUrlController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rtspUrl } = testUrlSchema.parse(req.body);

    try {
      const frame = await captureRtspFrame(rtspUrl);
      const snapshotBase64 = frame.toString("base64");
      sendSuccess(res, { online: true, message: "Connection successful", snapshotBase64 });
    } catch (err) {
      sendSuccess(res, {
        online: false,
        message: err instanceof Error ? err.message : "Connection failed"
      });
    }
  } catch (error) {
    next(error);
  }
}
