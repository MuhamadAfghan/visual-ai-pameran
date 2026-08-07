import { Router } from "express";
import {
  createPicController,
  deletePicController,
  getPicByIdController,
  listPicsController,
  resetPicPasswordController,
  updatePicController,
} from "../controllers/pic.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";

export const picRouter = Router();

picRouter.use(requireAuth);
picRouter.get("/",    requirePermission(PERMISSIONS.PICS_VIEW),   listPicsController);
picRouter.get("/:id", requirePermission(PERMISSIONS.PICS_VIEW),   getPicByIdController);
picRouter.post("/",   requirePermission(PERMISSIONS.PICS_CREATE), createPicController);
picRouter.put("/:id", requirePermission(PERMISSIONS.PICS_UPDATE), updatePicController);
picRouter.delete("/:id", requirePermission(PERMISSIONS.PICS_DELETE), deletePicController);
picRouter.post("/:id/reset-password", requirePermission(PERMISSIONS.PICS_UPDATE), resetPicPasswordController);
