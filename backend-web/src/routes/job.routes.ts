import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";
import {
  createDetectionJobController,
  getDetectionJobController,
  getQueueStatsController,
  listDetectionJobsController,
} from "../controllers/job.controller";

export const jobRouter = Router();

jobRouter.use(requireAuth);
jobRouter.get("/queue/stats", requireRole(["super_admin"]),                  getQueueStatsController);
jobRouter.get("/",    requirePermission(PERMISSIONS.DETECTION_JOBS_VIEW),   listDetectionJobsController);
jobRouter.get("/:id", requirePermission(PERMISSIONS.DETECTION_JOBS_VIEW),   getDetectionJobController);
jobRouter.post("/",   requirePermission(PERMISSIONS.DETECTION_JOBS_CREATE), createDetectionJobController);
