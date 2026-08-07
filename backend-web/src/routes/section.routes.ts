import { Router } from "express";
import {
  createSectionController,
  deleteSectionController,
  getSectionByIdController,
  listSectionsController,
  updateSectionController,
} from "../controllers/section.controller";
import { requireAuth } from "../middleware/requireAuth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../constants/permissions";

export const sectionRouter = Router();

sectionRouter.use(requireAuth);
sectionRouter.get("/",    requirePermission(PERMISSIONS.SECTIONS_VIEW),   listSectionsController);
sectionRouter.post("/",   requirePermission(PERMISSIONS.SECTIONS_CREATE), createSectionController);
sectionRouter.get("/:id", requirePermission(PERMISSIONS.SECTIONS_VIEW),   getSectionByIdController);
sectionRouter.put("/:id", requirePermission(PERMISSIONS.SECTIONS_UPDATE), updateSectionController);
sectionRouter.delete("/:id", requirePermission(PERMISSIONS.SECTIONS_DELETE), deleteSectionController);
