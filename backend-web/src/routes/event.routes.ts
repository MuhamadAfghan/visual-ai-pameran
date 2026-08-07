import { Router } from "express";
import {
  acknowledgeAllEventsController,
  acknowledgeEventController,
  deleteEventController,
  exportEventsController,
  getEventByIdController,
  getEventSnapshotController,
  listEventsController,
  markFalsePositiveController,
  sseStreamController,
} from "../controllers/event.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { exportRateLimit } from "../middleware/exportRateLimit";
import { PERMISSIONS } from "../constants/permissions";

export const eventRouter = Router();

eventRouter.get("/stream", requireAuth, sseStreamController);
eventRouter.get("/export", requireAuth, requirePermission(PERMISSIONS.EVENTS_EXPORT), exportRateLimit, exportEventsController);

eventRouter.use(requireAuth);
eventRouter.get("/",              requirePermission(PERMISSIONS.EVENTS_VIEW),           listEventsController);
eventRouter.post("/acknowledge-all", requirePermission(PERMISSIONS.EVENTS_ACKNOWLEDGE), acknowledgeAllEventsController);
eventRouter.get("/:id",           requirePermission(PERMISSIONS.EVENTS_VIEW),           getEventByIdController);
eventRouter.get("/:id/snapshot",  requirePermission(PERMISSIONS.EVENTS_VIEW),           getEventSnapshotController);
eventRouter.patch("/:id/acknowledge",    requirePermission(PERMISSIONS.EVENTS_ACKNOWLEDGE),    acknowledgeEventController);
eventRouter.patch("/:id/false-positive", requirePermission(PERMISSIONS.EVENTS_FALSE_POSITIVE), markFalsePositiveController);
eventRouter.delete("/:id",        requirePermission(PERMISSIONS.EVENTS_DELETE),         deleteEventController);
