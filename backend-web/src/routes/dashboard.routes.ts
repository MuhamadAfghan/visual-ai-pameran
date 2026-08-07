import { Router } from "express";
import {
  getDashboardStatsController,
  getPicPerformanceController,
  getViolationsByCameraController,
  getViolationsByTypeController,
  getViolationsTrendController,
} from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get("/stats",     requirePermission(PERMISSIONS.DASHBOARD_VIEW), getDashboardStatsController);
dashboardRouter.get("/trend",     requirePermission(PERMISSIONS.DASHBOARD_VIEW), getViolationsTrendController);
dashboardRouter.get("/by-type",   requirePermission(PERMISSIONS.DASHBOARD_VIEW), getViolationsByTypeController);
dashboardRouter.get("/by-camera", requirePermission(PERMISSIONS.DASHBOARD_VIEW), getViolationsByCameraController);
dashboardRouter.get("/pic/performance", requirePermission(PERMISSIONS.DASHBOARD_VIEW), getPicPerformanceController);
