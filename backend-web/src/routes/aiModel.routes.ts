import { Router } from "express";
import {
  createAiModelController,
  deleteAiModelController,
  getAiModelByIdController,
  listAiModelsController,
  listSelectedChecksController,
  updateAiModelController,
} from "../controllers/aiModel.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";

export const aiModelRouter = Router();

aiModelRouter.use(requireAuth);
aiModelRouter.get("/checks", requirePermission(PERMISSIONS.AI_MODELS_VIEW),   listSelectedChecksController);
aiModelRouter.get("/",       requirePermission(PERMISSIONS.AI_MODELS_VIEW),   listAiModelsController);
aiModelRouter.get("/:id",    requirePermission(PERMISSIONS.AI_MODELS_VIEW),   getAiModelByIdController);
aiModelRouter.post("/",      requirePermission(PERMISSIONS.AI_MODELS_CREATE), createAiModelController);
aiModelRouter.put("/:id",    requirePermission(PERMISSIONS.AI_MODELS_UPDATE), updateAiModelController);
aiModelRouter.delete("/:id", requirePermission(PERMISSIONS.AI_MODELS_DELETE), deleteAiModelController);
