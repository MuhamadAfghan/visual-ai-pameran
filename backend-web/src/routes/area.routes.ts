import { Router } from "express";
import {
  createAreaController,
  deleteAreaController,
  getAreaByIdController,
  listAreasController,
  updateAreaController,
} from "../controllers/area.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";

export const areaRouter = Router();

areaRouter.use(requireAuth);
areaRouter.get("/",    requirePermission(PERMISSIONS.AREAS_VIEW),   listAreasController);
areaRouter.get("/:id", requirePermission(PERMISSIONS.AREAS_VIEW),   getAreaByIdController);
areaRouter.post("/",   requirePermission(PERMISSIONS.AREAS_CREATE), createAreaController);
areaRouter.put("/:id", requirePermission(PERMISSIONS.AREAS_UPDATE), updateAreaController);
areaRouter.delete("/:id", requirePermission(PERMISSIONS.AREAS_DELETE), deleteAreaController);
