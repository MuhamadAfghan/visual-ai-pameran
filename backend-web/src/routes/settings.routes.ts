import { Router } from "express";
import {
  getSettingsController,
  getStorageStatsController,
  getViolationAlertConfigController,
  runCleanupNowController,
  testSmtpController,
  updateSettingsController
} from "../controllers/settings.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);

// Any authenticated role (not just super_admin) — the violation-audio-alert
// feature runs app-wide, so every role needs to read this narrow, non-sensitive slice.
settingsRouter.get("/violation-alert", getViolationAlertConfigController);

settingsRouter.use(requireRole(["super_admin"]));

settingsRouter.get("/", getSettingsController);
settingsRouter.put("/", updateSettingsController);
settingsRouter.post("/smtp/test", testSmtpController);
settingsRouter.post("/cleanup/run", runCleanupNowController);
settingsRouter.get("/storage/stats", getStorageStatsController);
