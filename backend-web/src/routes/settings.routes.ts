import { Router } from "express";
import {
  getSettingsController,
  getStorageStatsController,
  runCleanupNowController,
  testSmtpController,
  updateSettingsController
} from "../controllers/settings.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requireRole } from "../middleware/requireRole";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);
settingsRouter.use(requireRole(["super_admin"]));

settingsRouter.get("/", getSettingsController);
settingsRouter.put("/", updateSettingsController);
settingsRouter.post("/smtp/test", testSmtpController);
settingsRouter.post("/cleanup/run", runCleanupNowController);
settingsRouter.get("/storage/stats", getStorageStatsController);
