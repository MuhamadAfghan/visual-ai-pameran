import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireAuthStream } from "../middleware/requireAuthStream";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";
import {
  createCameraController,
  deleteCameraController,
  getCameraByIdController,
  getCameraLiveDetectController,
  getCameraLiveStreamController,
  getCameraSnapshotController,
  getCameraStreamController,
  listCamerasController,
  pushFrameController,
  startCameraSchedulerController,
  stopCameraSchedulerController,
  suggestCameraCodeController,
  testCameraConnectionController,
  testCameraUrlController,
  updateCameraController,
} from "../controllers/camera.controller";

export const cameraRouter = Router();

cameraRouter.get("/:id/stream", requireAuthStream, requirePermission(PERMISSIONS.CAMERAS_STREAM), getCameraStreamController);
// Snapshot is loaded by <img> tags (camera grid) which cannot send an auth header,
// so it uses requireAuthStream (token via ?token=) — same as /stream. Must be
// registered BEFORE the header-only requireAuth below.
cameraRouter.get("/:id/snapshot", requireAuthStream, requirePermission(PERMISSIONS.CAMERAS_SNAPSHOT), getCameraSnapshotController);
// EventSource cannot send a custom Authorization header either — same
// query-token support as /stream, matching the existing /events/stream and
// /system/stream SSE endpoints (requireAuth already accepts ?token=).
cameraRouter.get("/:id/live-stream", requireAuth, requirePermission(PERMISSIONS.CAMERAS_STREAM), getCameraLiveStreamController);

cameraRouter.use(requireAuth);
cameraRouter.get("/",                    requirePermission(PERMISSIONS.CAMERAS_VIEW),      listCamerasController);
cameraRouter.post("/",                   requirePermission(PERMISSIONS.CAMERAS_CREATE),    createCameraController);
cameraRouter.get("/suggest-code",        requirePermission(PERMISSIONS.CAMERAS_VIEW),      suggestCameraCodeController);
cameraRouter.get("/:id",                 requirePermission(PERMISSIONS.CAMERAS_VIEW),      getCameraByIdController);
cameraRouter.put("/:id",                 requirePermission(PERMISSIONS.CAMERAS_UPDATE),    updateCameraController);
cameraRouter.delete("/:id",              requirePermission(PERMISSIONS.CAMERAS_DELETE),    deleteCameraController);
cameraRouter.post("/:id/scheduler/start", requirePermission(PERMISSIONS.CAMERAS_SCHEDULER), startCameraSchedulerController);
cameraRouter.post("/:id/scheduler/stop",  requirePermission(PERMISSIONS.CAMERAS_SCHEDULER), stopCameraSchedulerController);
cameraRouter.post("/test-url",            requirePermission(PERMISSIONS.CAMERAS_CREATE),   testCameraUrlController);
cameraRouter.post("/:id/test-connection", requirePermission(PERMISSIONS.CAMERAS_UPDATE),   testCameraConnectionController);
cameraRouter.get("/:id/live-detect",      requirePermission(PERMISSIONS.CAMERAS_STREAM),   getCameraLiveDetectController);
cameraRouter.post("/:id/push-frame",      requirePermission(PERMISSIONS.CAMERAS_CAPTURE),  pushFrameController);
