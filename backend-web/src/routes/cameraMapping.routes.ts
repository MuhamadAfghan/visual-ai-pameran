import { Router } from "express";
import {
  createMappingController,
  deleteMappingController,
  getMappingByIdController,
  listAllMappingsController,
  listMappingsController,
  toggleMappingController,
  updateMappingController,
} from "../controllers/cameraMapping.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";

export const allMappingsRouter = Router();
allMappingsRouter.use(requireAuth);
allMappingsRouter.get("/", requirePermission(PERMISSIONS.CAMERA_MAPPINGS_VIEW), listAllMappingsController);

export const cameraMappingRouter = Router({ mergeParams: true });
cameraMappingRouter.use(requireAuth);
cameraMappingRouter.get("/",    requirePermission(PERMISSIONS.CAMERA_MAPPINGS_VIEW),   listMappingsController);
cameraMappingRouter.post("/",   requirePermission(PERMISSIONS.CAMERA_MAPPINGS_CREATE), createMappingController);
cameraMappingRouter.get("/:mappingId",    requirePermission(PERMISSIONS.CAMERA_MAPPINGS_VIEW),   getMappingByIdController);
cameraMappingRouter.put("/:mappingId",    requirePermission(PERMISSIONS.CAMERA_MAPPINGS_UPDATE), updateMappingController);
cameraMappingRouter.delete("/:mappingId", requirePermission(PERMISSIONS.CAMERA_MAPPINGS_DELETE), deleteMappingController);
cameraMappingRouter.patch("/:mappingId/toggle", requirePermission(PERMISSIONS.CAMERA_MAPPINGS_TOGGLE), toggleMappingController);
